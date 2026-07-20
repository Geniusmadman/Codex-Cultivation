[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$Uninstall,
  [switch]$RestoreBaseTheme,
  [switch]$RecoverConfigBackup,
  [switch]$PromptRestart,
  [switch]$ForceRestart,
  [switch]$NoRelaunch,
  [switch]$KeepSpiritPet
)

$ErrorActionPreference = 'Stop'
$PortExplicit = $PSBoundParameters.ContainsKey('Port')
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

function Stop-CultivationTrayProcess {
  $trayScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'tray-codex-cultivation.ps1'))
  try {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" `
      -ErrorAction Stop
    foreach ($process in $processes) {
      if ($process.ProcessId -eq $PID -or -not $process.CommandLine) { continue }
      if ($process.CommandLine.IndexOf($trayScript, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
      }
    }
  } catch {
    Write-Warning "Could not close the Cultivation tray automatically: $($_.Exception.Message)"
  }
}

function Remove-CultivationSpiritPetFallback {
  param(
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][string]$CodexHome
  )
  $petStatePath = Join-Path $StateRoot 'pet-state.json'
  if (-not (Test-Path -LiteralPath $petStatePath -PathType Leaf)) { return }
  $petState = (Read-CultivationUtf8File -Path $petStatePath) | ConvertFrom-Json
  if ($petState.schemaVersion -ne 1 -or $petState.managedBy -cne 'CodexCultivation' -or
    $petState.petId -cne 'yinyue' -or $petState.activeSpritesheet -notmatch
      '^spritesheet-(qi|foundation|golden-core|nascent-soul|transformation)-[a-f0-9]{12}\.webp$') {
    throw 'Silver Moon pet state is invalid; pet files were preserved.'
  }
  $petDirectory = Join-Path $CodexHome 'pets\yinyue'
  if (Test-Path -LiteralPath $petDirectory) {
    $petDirectoryItem = Get-Item -LiteralPath $petDirectory -Force
    if (($petDirectoryItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'Silver Moon pet directory is a link or junction; pet files were preserved.'
    }
    foreach ($file in @($petState.managedFiles)) {
      $name = "$($file.name)"
      $expectedHash = "$($file.sha256)".ToLowerInvariant()
      if ($name -notmatch '^spritesheet-(qi|foundation|golden-core|nascent-soul|transformation)-[a-f0-9]{12}\.webp$' -or
        $expectedHash -notmatch '^[a-f0-9]{64}$') {
        throw 'Silver Moon pet state contains an unsafe managed file; pet files were preserved.'
      }
      $managedPath = Join-Path $petDirectory $name
      if (-not (Test-Path -LiteralPath $managedPath -PathType Leaf)) { continue }
      $actualHash = (Get-FileHash -LiteralPath $managedPath -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($actualHash -ceq $expectedHash) {
        Remove-Item -LiteralPath $managedPath -Force
      } else {
        Write-Warning "Preserved modified Silver Moon file: $name"
      }
    }
    $petJsonPath = Join-Path $petDirectory 'pet.json'
    if (Test-Path -LiteralPath $petJsonPath -PathType Leaf) {
      $expectedPetJsonHash = "$($petState.petJsonSha256)".ToLowerInvariant()
      if ($expectedPetJsonHash -notmatch '^[a-f0-9]{64}$') {
        throw 'Silver Moon pet manifest hash is invalid; pet files were preserved.'
      }
      $actualPetJsonHash = (Get-FileHash -LiteralPath $petJsonPath -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($actualPetJsonHash -ceq $expectedPetJsonHash) {
        Remove-Item -LiteralPath $petJsonPath -Force
      } else {
        Write-Warning 'Preserved modified Silver Moon pet.json.'
      }
    }
    if (@(Get-ChildItem -LiteralPath $petDirectory -Force).Count -eq 0) {
      Remove-Item -LiteralPath $petDirectory -Force
    }
  }
  Remove-Item -LiteralPath $petStatePath -Force
}

$operationLock = Enter-CultivationOperationLock
try {
  if ($RestoreBaseTheme -and $RecoverConfigBackup) {
    throw 'Choose either -RestoreBaseTheme or -RecoverConfigBackup, not both.'
  }
  Assert-CultivationPort -Port $Port

  $StateRoot = Join-Path $env:LOCALAPPDATA 'CodexCultivation'
  $themePaths = Get-CultivationThemePaths -StateRoot $StateRoot
  Ensure-CultivationManagedDirectory -Path $themePaths.Root -Root $themePaths.Root
  $StatePath = Join-Path $StateRoot 'state.json'
  $PetManager = Join-Path $PSScriptRoot 'pet-manager.mjs'
  $PetDisableFile = Join-Path $StateRoot 'spirit-pet-disabled'
  $CodexHome = if ($env:CODEX_HOME) {
    [System.IO.Path]::GetFullPath($env:CODEX_HOME)
  } else {
    [System.IO.Path]::GetFullPath((Join-Path $HOME '.codex'))
  }
  $state = Read-CultivationState -Path $StatePath
  if (-not $PortExplicit -and $null -ne $state -and $state.port) {
    $Port = [int]$state.port
    Assert-CultivationPort -Port $Port
  }

  $currentCodex = $null
  try { $currentCodex = Get-CultivationCodexInstall } catch { Write-Warning $_.Exception.Message }
  $savedPathCandidate = Get-CultivationCodexStatePathCandidate -State $state
  $savedCodex = Get-CultivationCodexInstallFromState -State $state
  $candidateMatchesCurrent = [bool]($null -ne $savedPathCandidate -and $null -ne $currentCodex -and
    (Test-CultivationPathEqual -Left $savedPathCandidate.PackageRoot -Right $currentCodex.PackageRoot) -and
    (Test-CultivationPathEqual -Left $savedPathCandidate.Executable -Right $currentCodex.Executable))
  if ($null -ne $savedPathCandidate -and $null -eq $savedCodex -and -not $candidateMatchesCurrent) {
    $unverifiedSavedRunning = (Get-CultivationCodexProcesses -Codex $savedPathCandidate).Count -gt 0
    $unverifiedSavedOwnsPort = Test-CultivationCodexPortOwner -Port $Port -Codex $savedPathCandidate
    if ($unverifiedSavedRunning -or $unverifiedSavedOwnsPort) {
      throw 'The saved Codex path is still active but no longer matches a registered OpenAI.Codex package. Close it manually; state and configuration were preserved.'
    }
  }
  $savedIsDifferent = [bool]($null -ne $savedCodex -and $null -ne $currentCodex -and
    -not (Test-CultivationPathEqual -Left $savedCodex.Executable -Right $currentCodex.Executable))
  $currentRunning = $null -ne $currentCodex -and (Get-CultivationCodexProcesses -Codex $currentCodex).Count -gt 0
  $savedRunning = $null -ne $savedCodex -and (Get-CultivationCodexProcesses -Codex $savedCodex).Count -gt 0
  $savedOwnsPort = $null -ne $savedCodex -and (Test-CultivationCodexPortOwner -Port $Port -Codex $savedCodex)
  if ($savedIsDifferent -and $currentRunning -and ($savedRunning -or $savedOwnsPort)) {
    throw 'Multiple Codex package versions are active. Close them manually before restore; state and configuration were preserved.'
  }

  $codex = $currentCodex
  if ($savedRunning -or $savedOwnsPort -or $null -eq $currentCodex) {
    $codex = $savedCodex
    if ($null -ne $codex -and $savedIsDifferent) {
      Write-Warning 'Using the saved Codex package identity to close its older active CDP session.'
    } elseif ($null -ne $codex -and $null -eq $currentCodex) {
      Write-Warning 'Using the saved Codex identity after revalidating it against the registered Store package.'
    }
  }
  $relaunchCodex = if ($null -ne $currentCodex) { $currentCodex } else { $codex }
  $codexRunning = $null -ne $codex -and (Get-CultivationCodexProcesses -Codex $codex).Count -gt 0
  $portOwnedByCodex = $null -ne $codex -and (Test-CultivationCodexPortOwner -Port $Port -Codex $codex)
  if ($portOwnedByCodex -and -not $codexRunning) {
    throw 'A Codex-owned listener exists without a manageable Codex process; state was preserved.'
  }
  if ($null -ne $state -and $null -eq $codex -and -not (Test-CultivationPortAvailable -Port $Port)) {
    throw "Port $Port is still active, but Codex ownership cannot be verified. State and configuration were preserved."
  }

  $shouldCloseCodex = $codexRunning
  $forceAuthorized = [bool]$ForceRestart
  if ($shouldCloseCodex -and $PromptRestart) {
    $restartMessage = if ($NoRelaunch) {
      'Restore will close Codex and remove Cultivation plus its CDP session. Continue?'
    } else {
      'Restore will close Codex, remove Cultivation and its CDP session, then reopen the official app. Continue?'
    }
    $forceAuthorized = Confirm-CultivationRestart -Message $restartMessage
    if (-not $forceAuthorized) {
      Write-Host 'Restore was cancelled; no state or configuration was changed.'
      exit 0
    }
  }

  $backup = Join-Path $StateRoot 'config.before-cultivation.toml'
  $config = Join-Path $HOME '.codex\config.toml'
  if ($RecoverConfigBackup) {
    if (-not (Test-Path -LiteralPath $backup)) { throw 'No pre-install config backup is available.' }
    $null = Read-CultivationUtf8File -Path $backup
  } elseif ($RestoreBaseTheme) {
    if (-not (Test-Path -LiteralPath $backup)) { throw 'No pre-install config backup is available.' }
    $null = Read-CultivationUtf8File -Path $backup
    $null = Read-CultivationUtf8File -Path $config
  }

  $restoreError = $null
  try {
    Stop-CultivationTrayProcess
    if ($shouldCloseCodex) {
      Stop-CultivationCodex -Codex $codex -AllowForce:$forceAuthorized
      if ($portOwnedByCodex -and -not (Wait-CultivationPortAvailable -Port $Port -TimeoutSeconds 5)) {
        throw "Port $Port is still listening after Codex closed; state was preserved for inspection."
      }
    }

    $recordedInjectorStopped = Stop-CultivationRecordedInjector -State $state
    if (-not $recordedInjectorStopped) {
      $staleStatePath = Archive-CultivationStateFile -Path $StatePath
      Write-Warning "Archived stale Cultivation state at $staleStatePath"
    }

    if ($RecoverConfigBackup) {
      $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N')
      $recoveryBackup = Join-Path $StateRoot "config.before-recovery-$stamp.toml"
      Restore-CultivationConfigBackup -ConfigPath $config -BackupPath $backup -RecoveryBackupPath $recoveryBackup
      Write-Host "Recovered the exact pre-install config; previous current config saved at $recoveryBackup"
    } elseif ($RestoreBaseTheme) {
      Restore-CultivationBaseTheme -ConfigPath $config -BackupPath $backup
    }
    if ($RecoverConfigBackup -or $RestoreBaseTheme) {
      $archiveStamp = (Get-Date).ToString('yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N')
      $archivePath = Join-Path $StateRoot "config.restored-$archiveStamp.toml"
      Archive-CultivationConfigBackup -BackupPath $backup -ArchivePath $archivePath
      Write-Host "Archived the completed pre-install backup at $archivePath"
    }

    Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $StateRoot 'paused') -Force -ErrorAction SilentlyContinue
    if (-not $KeepSpiritPet) {
      $node = $null
      try { $node = Get-CultivationNodeRuntime } catch {}
      if ($null -ne $node) {
        $petRemoval = @(& $node.Path $PetManager remove --state-root $StateRoot `
          --codex-home $CodexHome 2>&1)
        if ($LASTEXITCODE -ne 0) {
          throw "Silver Moon pet removal failed: $($petRemoval -join ' ')"
        }
      } else {
        Remove-CultivationSpiritPetFallback -StateRoot $StateRoot -CodexHome $CodexHome
      }
      Remove-Item -LiteralPath $PetDisableFile -Force -ErrorAction SilentlyContinue
    }
    if ($Uninstall) {
      $desktop = [Environment]::GetFolderPath('Desktop')
      $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
      @(
        (Join-Path $desktop 'Codex Cultivation.lnk'),
        (Join-Path $desktop 'Codex Cultivation - Restore.lnk'),
        (Join-Path $desktop 'Codex Cultivation - Tray.lnk'),
        (Join-Path $startMenu 'Codex Cultivation.lnk'),
        (Join-Path $startMenu 'Codex Cultivation - Tray.lnk')
      ) | ForEach-Object { Remove-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue }
    }

    if ($shouldCloseCodex -and -not $NoRelaunch) {
      if ($null -eq $relaunchCodex -or -not (Test-Path -LiteralPath $relaunchCodex.Executable)) {
        throw 'Codex cannot be reopened because its current executable is unavailable.'
      }
      Start-Process -FilePath $relaunchCodex.Executable | Out-Null
    }
  } catch {
    $restoreError = $_
    if ($shouldCloseCodex -and -not $NoRelaunch -and $null -ne $relaunchCodex -and
      (Get-CultivationCodexProcesses -Codex $codex).Count -eq 0 -and (Test-Path -LiteralPath $relaunchCodex.Executable)) {
      try { Start-Process -FilePath $relaunchCodex.Executable | Out-Null } catch {
        Write-Warning 'Restore failed and Codex could not be reopened automatically.'
      }
    }
    throw $restoreError
  }

  Write-Host 'Cultivation restore actions completed; any saved CDP session was closed.'
} finally {
  Exit-CultivationOperationLock -Mutex $operationLock
}
