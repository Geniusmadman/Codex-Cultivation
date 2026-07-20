[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$RestartExisting,
  [switch]$PromptRestart,
  [string]$ProfilePath,
  [switch]$ForegroundInjector,
  [switch]$RestartForSpiritPet
)

$ErrorActionPreference = 'Stop'
$PortExplicit = $PSBoundParameters.ContainsKey('Port')
$Injector = Join-Path $PSScriptRoot 'injector.mjs'
$PetFamily = Join-Path (Split-Path -Parent $PSScriptRoot) 'pets\yinyue\pet-family.json'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

$operationLock = Enter-CultivationOperationLock
try {
  Assert-CultivationPort -Port $Port
  if ($ProfilePath) { $ProfilePath = [System.IO.Path]::GetFullPath($ProfilePath) }
  $node = Get-CultivationNodeRuntime
  $currentCodex = Get-CultivationCodexInstall
  $codex = $currentCodex
  $StateRoot = Join-Path $env:LOCALAPPDATA 'CodexCultivation'
  $themePaths = Get-CultivationThemePaths -StateRoot $StateRoot
  Ensure-CultivationManagedDirectory -Path $themePaths.Root -Root $themePaths.Root
  $StatePath = Join-Path $StateRoot 'state.json'
  $PetDisableFile = Join-Path $StateRoot 'spirit-pet-disabled'
  $CodexHome = if ($env:CODEX_HOME) {
    [System.IO.Path]::GetFullPath($env:CODEX_HOME)
  } else {
    [System.IO.Path]::GetFullPath((Join-Path $HOME '.codex'))
  }
  $StdoutPath = Join-Path $StateRoot 'injector.log'
  $StderrPath = Join-Path $StateRoot 'injector-error.log'
  $VerifyPath = Join-Path $StateRoot 'verify.log'
  $themePaths = Initialize-CultivationThemeStore -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
  $pauseWasSet = Test-CultivationPaused -StateRoot $StateRoot

  $previousState = Read-CultivationState -Path $StatePath
  if (-not $PortExplicit -and $null -ne $previousState -and $previousState.port) {
    $savedPort = [int]$previousState.port
    Assert-CultivationPort -Port $savedPort
    $Port = $savedPort
  }
  $savedPathCandidate = Get-CultivationCodexStatePathCandidate -State $previousState
  $savedCodex = Get-CultivationCodexInstallFromState -State $previousState
  $candidateMatchesCurrent = [bool]($null -ne $savedPathCandidate -and
    (Test-CultivationPathEqual -Left $savedPathCandidate.PackageRoot -Right $currentCodex.PackageRoot) -and
    (Test-CultivationPathEqual -Left $savedPathCandidate.Executable -Right $currentCodex.Executable))
  if ($null -ne $savedPathCandidate -and $null -eq $savedCodex -and -not $candidateMatchesCurrent) {
    $unverifiedSavedRunning = (Get-CultivationCodexProcesses -Codex $savedPathCandidate).Count -gt 0
    $unverifiedSavedOwnsPort = Test-CultivationCodexPortOwner -Port $Port -Codex $savedPathCandidate
    if ($unverifiedSavedRunning -or $unverifiedSavedOwnsPort) {
      throw 'The saved Codex path is still active but no longer matches a registered OpenAI.Codex package. Close it manually; state was preserved.'
    }
  }

  $currentProcesses = Get-CultivationCodexProcesses -Codex $currentCodex
  $codexToStop = $currentCodex
  $cdpIdentity = Get-CultivationVerifiedCdpIdentity -Port $Port -Codex $currentCodex
  $savedIsDifferent = [bool]($null -ne $savedCodex -and
    -not (Test-CultivationPathEqual -Left $savedCodex.Executable -Right $currentCodex.Executable))
  if ($savedIsDifferent) {
    $savedProcesses = Get-CultivationCodexProcesses -Codex $savedCodex
    $savedOwnsPort = Test-CultivationCodexPortOwner -Port $Port -Codex $savedCodex
    if ($currentProcesses.Count -gt 0 -and ($savedProcesses.Count -gt 0 -or $savedOwnsPort)) {
      throw 'Multiple registered Codex package versions are active. Close them manually before starting Cultivation.'
    }
    if ($savedProcesses.Count -gt 0 -or $savedOwnsPort) {
      if ($savedOwnsPort -and $savedProcesses.Count -eq 0) {
        throw 'The saved Codex listener is active but its process cannot be managed safely; state was preserved.'
      }
      $savedIdentity = Get-CultivationVerifiedCdpIdentity -Port $Port -Codex $savedCodex
      if ($null -ne $savedIdentity) {
        $codex = $savedCodex
        $codexToStop = $savedCodex
        $cdpIdentity = $savedIdentity
        Write-Warning 'Reapplying Cultivation to the still-running registered Codex version; the current Store version will be used after that app exits.'
      } else {
        $codexToStop = $savedCodex
        $currentProcesses = $savedProcesses
      }
    }
  }
  $debugReady = $null -ne $cdpIdentity
  $codexProcesses = if (Test-CultivationPathEqual -Left $codexToStop.Executable -Right $currentCodex.Executable) {
    $currentProcesses
  } else {
    Get-CultivationCodexProcesses -Codex $codexToStop
  }
  $closedExistingCodex = $false
  if ($RestartForSpiritPet -and $debugReady -and $codexProcesses.Count -gt 0) {
    $restartAuthorized = [bool]$RestartExisting
    if (-not $restartAuthorized -and $PromptRestart) {
      $restartAuthorized = Confirm-CultivationRestart -Message `
        'Codex must restart to load the evolved Silver Moon spritesheet. Unsaved input may be lost. Restart now?'
      if (-not $restartAuthorized) {
        Write-Host 'Silver Moon restart was cancelled; Codex was not changed.'
        exit 0
      }
    }
    if (-not $restartAuthorized) {
      throw 'Silver Moon restart requires -PromptRestart consent or explicit -RestartExisting authorization.'
    }
    Stop-CultivationCodex -Codex $codexToStop -AllowForce
    $closedExistingCodex = $true
    $codex = $currentCodex
    $debugReady = $false
    $cdpIdentity = $null
    $codexProcesses = @()
  }
  if (-not $debugReady -and $codexProcesses.Count -gt 0) {
    $restartAuthorized = [bool]$RestartExisting
    if (-not $restartAuthorized -and $PromptRestart) {
      $restartAuthorized = Confirm-CultivationRestart -Message 'Codex must restart once to enable Cultivation. Unsaved input may be lost. Restart now?'
      if (-not $restartAuthorized) {
        Write-Host 'Cultivation launch was cancelled; Codex was not changed.'
        exit 0
      }
    }
    if (-not $restartAuthorized) {
      throw 'Codex is open without a verified Cultivation CDP endpoint. Close it first or explicitly use -RestartExisting.'
    }
    Stop-CultivationCodex -Codex $codexToStop -AllowForce
    $closedExistingCodex = $true
    $codex = $currentCodex
  }

  $launchedWithCdp = $false
  try {
    if ($null -eq (Get-CultivationVerifiedCdpIdentity -Port $Port -Codex $codex)) {
      if (-not (Test-CultivationPortAvailable -Port $Port)) {
        if ($PortExplicit) { throw "Port $Port is already occupied by an unverified listener. Choose another port." }
        $Port = Select-CultivationPort -PreferredPort $Port
      }
      $arguments = @('--remote-debugging-address=127.0.0.1', "--remote-debugging-port=$Port")
      if ($ProfilePath) {
        New-Item -ItemType Directory -Force -Path $ProfilePath | Out-Null
        $arguments += ConvertTo-CultivationProcessArgument -Value "--user-data-dir=$ProfilePath"
      }
      Start-Process -FilePath $codex.Executable -ArgumentList $arguments | Out-Null
      $launchedWithCdp = $true
    }

    $deadline = (Get-Date).AddSeconds(45)
    $cdpIdentity = Get-CultivationVerifiedCdpIdentity -Port $Port -Codex $codex
    while ($null -eq $cdpIdentity) {
      if ((Get-Date) -ge $deadline) {
        throw "Codex did not expose a verified loopback CDP endpoint on port $Port within 45 seconds."
      }
      Start-Sleep -Milliseconds 400
      $cdpIdentity = Get-CultivationVerifiedCdpIdentity -Port $Port -Codex $codex
    }
  } catch {
    $launchError = $_
    if ($launchedWithCdp) {
      try { Stop-CultivationCodex -Codex $codex -AllowForce } catch {
        Write-Warning 'Launch rollback could not fully close the failed CDP session.'
      }
    }
    if (($closedExistingCodex -or $launchedWithCdp) -and
      (Get-CultivationCodexProcesses -Codex $codex).Count -eq 0) {
      if ($launchedWithCdp) {
        Write-Warning 'Cultivation launch failed; reopening Codex without a debugging port.'
      }
      try { Start-Process -FilePath $codex.Executable | Out-Null } catch {
        Write-Warning 'Launch rollback could not reopen Codex automatically.'
      }
    }
    throw $launchError
  }

  try {
    $recordedInjectorStopped = Stop-CultivationRecordedInjector -State $previousState
    if (-not $recordedInjectorStopped) {
      $staleStatePath = Archive-CultivationStateFile -Path $StatePath
      Write-Warning "Archived stale Cultivation state at $staleStatePath"
    }
  } catch {
    if ($launchedWithCdp) {
      try {
        Stop-CultivationCodex -Codex $codex -AllowForce
        Start-Process -FilePath $codex.Executable | Out-Null
      } catch {
        Write-Warning 'State validation rollback could not fully restart Codex; close Codex to ensure its CDP port is closed.'
      }
    }
    throw
  }

  # Keep a paused, already-running watcher paused until all state checks and any
  # restart consent have succeeded.  A cancelled prompt must be side-effect free.
  Set-CultivationPaused -Paused $false -StateRoot $StateRoot | Out-Null
  $pauseCleared = $true

  if ($ForegroundInjector) {
    try {
      Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
      Exit-CultivationOperationLock -Mutex $operationLock
      $operationLock = $null
      & $node.Path $Injector --watch --port $Port --browser-id $cdpIdentity.BrowserId `
        --theme-dir $themePaths.Active --pause-file $themePaths.PauseFile `
        --pet-family $PetFamily --pet-state-root $StateRoot --codex-home $CodexHome `
        --pet-disable-file $PetDisableFile
      $foregroundExitCode = $LASTEXITCODE
      if ($foregroundExitCode -ne 0 -and $pauseWasSet) {
        Set-CultivationPaused -Paused $true -StateRoot $StateRoot | Out-Null
      }
      exit $foregroundExitCode
    } catch {
      if ($pauseWasSet) {
        try { Set-CultivationPaused -Paused $true -StateRoot $StateRoot | Out-Null } catch {
          Write-Warning 'Foreground startup rollback could not restore the existing paused state.'
        }
      }
      throw
    }
  }

  $state = $null
  $daemon = $null
  try {
    $injectorArgs = @((ConvertTo-CultivationProcessArgument -Value $Injector), '--watch', '--port', "$Port",
      '--browser-id', $cdpIdentity.BrowserId, '--theme-dir',
      (ConvertTo-CultivationProcessArgument -Value $themePaths.Active), '--pause-file',
      (ConvertTo-CultivationProcessArgument -Value $themePaths.PauseFile), '--pet-family',
      (ConvertTo-CultivationProcessArgument -Value $PetFamily), '--pet-state-root',
      (ConvertTo-CultivationProcessArgument -Value $StateRoot), '--codex-home',
      (ConvertTo-CultivationProcessArgument -Value $CodexHome), '--pet-disable-file',
      (ConvertTo-CultivationProcessArgument -Value $PetDisableFile))
    $daemon = Start-Process -FilePath $node.Path -ArgumentList $injectorArgs -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
    Start-Sleep -Milliseconds 500
    if ($daemon.HasExited) { throw "The injector exited during startup. See $StderrPath" }

    $injectorStartedAt = Get-CultivationProcessStartedAt -ProcessId $daemon.Id
    if (-not $injectorStartedAt) { throw 'The injector process identity could not be recorded safely.' }
    $state = [pscustomobject]@{
      schemaVersion = 3
      platform = 'windows'
      port = $Port
      injectorPid = $daemon.Id
      injectorStartedAt = $injectorStartedAt
      injectorPath = $Injector
      nodePath = $node.Path
      nodeVersion = $node.Version
      codexExe = $codex.Executable
      codexPackageRoot = $codex.PackageRoot
      codexPackageFullName = $codex.PackageFullName
      codexPackageFamilyName = $codex.PackageFamilyName
      codexVersion = $codex.Version
      browserId = $cdpIdentity.BrowserId
      profilePath = $ProfilePath
      themeDir = $themePaths.Active
      pauseFile = $themePaths.PauseFile
      createdAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    Write-CultivationState -Path $StatePath -State $state

    $verifyOutput = @(& $node.Path $Injector --verify --port $Port --browser-id $cdpIdentity.BrowserId `
      --timeout-ms 30000 2>&1)
    $verifyExitCode = $LASTEXITCODE
    Write-CultivationUtf8FileAtomically -Path $VerifyPath -Content (($verifyOutput -join "`r`n") + "`r`n")
    if ($verifyExitCode -ne 0) { throw "Cultivation verification failed. See $VerifyPath" }
  } catch {
    $startupError = $_
    $injectorStopped = $true
    if ($null -ne $state) {
      try {
        $injectorStopped = Stop-CultivationRecordedInjector -State $state
      } catch {
        $injectorStopped = $false
        Write-Warning $_.Exception.Message
      }
    } elseif ($null -ne $daemon -and -not $daemon.HasExited) {
      try {
        Stop-Process -InputObject $daemon -Force -ErrorAction Stop
        [void]$daemon.WaitForExit(5000)
        $injectorStopped = $daemon.HasExited
      } catch {
        $injectorStopped = $false
        Write-Warning 'The newly created injector could not be stopped during startup rollback.'
      }
    }
    if ($injectorStopped -and -not $launchedWithCdp) {
      try {
        $rollbackIdentity = Get-CultivationVerifiedCdpIdentity -Port $Port -Codex $codex
        if ($null -ne $rollbackIdentity -and $rollbackIdentity.BrowserId -ceq $cdpIdentity.BrowserId) {
          & $node.Path $Injector --remove --port $Port --browser-id $cdpIdentity.BrowserId `
            --timeout-ms 5000 *> $null
          if ($LASTEXITCODE -ne 0) { throw 'Injector removal returned a failure status.' }
        }
      } catch {
        Write-Warning 'Startup rollback could not remove the partially applied live skin; reload or close Codex to clear it.'
      }
    }
    if ($injectorStopped) { Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue }
    if ($launchedWithCdp) {
      try {
        Stop-CultivationCodex -Codex $codex -AllowForce
        Start-Process -FilePath $codex.Executable | Out-Null
      } catch {
        Write-Warning 'Startup rollback could not fully restart Codex; close Codex to ensure its CDP port is closed.'
      }
    }
    if ($pauseWasSet -and $pauseCleared) {
      try {
        Set-CultivationPaused -Paused $true -StateRoot $StateRoot | Out-Null
      } catch {
        Write-Warning 'Startup rollback could not restore the existing paused state.'
      }
    }
    throw $startupError
  }

  Write-Host "Codex Cultivation is active on verified loopback port $Port."
} finally {
  if ($null -ne $operationLock) { Exit-CultivationOperationLock -Mutex $operationLock }
}
