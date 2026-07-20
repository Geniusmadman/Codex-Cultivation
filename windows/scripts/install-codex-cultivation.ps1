[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$NoShortcuts,
  [switch]$NoSpiritPet
)

$ErrorActionPreference = 'Stop'
$PortExplicit = $PSBoundParameters.ContainsKey('Port')
$SkillRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

$operationLock = Enter-CultivationOperationLock
try {
  Assert-CultivationPort -Port $Port
  $node = Get-CultivationNodeRuntime
  $registeredInstalls = @(Get-CultivationRegisteredCodexInstalls)
  if ($registeredInstalls.Count -eq 0) {
    throw 'The official OpenAI.Codex Store package is not installed or its identity cannot be validated.'
  }
  foreach ($registeredCodex in $registeredInstalls) {
    if ((Get-CultivationCodexProcesses -Codex $registeredCodex).Count -gt 0) {
      throw 'Close Codex before installing Cultivation so config.toml cannot change during the transaction.'
    }
  }

  $StateRoot = Join-Path $env:LOCALAPPDATA 'CodexCultivation'
  $themePaths = Get-CultivationThemePaths -StateRoot $StateRoot
  Ensure-CultivationManagedDirectory -Path $themePaths.Root -Root $themePaths.Root
  $StatePath = Join-Path $StateRoot 'state.json'
  $PetManager = Join-Path $PSScriptRoot 'pet-manager.mjs'
  $PetFamily = Join-Path $SkillRoot 'pets\yinyue\pet-family.json'
  $PetDisableFile = Join-Path $StateRoot 'spirit-pet-disabled'
  $CodexHome = if ($env:CODEX_HOME) {
    [System.IO.Path]::GetFullPath($env:CODEX_HOME)
  } else {
    [System.IO.Path]::GetFullPath((Join-Path $HOME '.codex'))
  }
  $existingState = Read-CultivationState -Path $StatePath
  $savedPathCandidate = Get-CultivationCodexStatePathCandidate -State $existingState
  $savedCodex = Resolve-CultivationCodexInstallFromState -State $existingState -RegisteredInstalls $registeredInstalls
  if ($null -ne $savedPathCandidate -and $null -eq $savedCodex -and
    (Get-CultivationCodexProcesses -Codex $savedPathCandidate).Count -gt 0) {
    throw 'The saved Codex path is still running but no longer matches a registered Store package. Close it manually before installing.'
  }
  $null = Initialize-CultivationThemeStore -SkillRoot $SkillRoot -StateRoot $StateRoot
  $ConfigPath = Join-Path $HOME '.codex\config.toml'
  $BackupPath = Join-Path $StateRoot 'config.before-cultivation.toml'
  if (-not $NoSpiritPet) {
    $petVerification = @(& $node.Path $PetManager verify --family $PetFamily `
      --state-root $StateRoot --codex-home $CodexHome 2>&1)
    if ($LASTEXITCODE -ne 0) {
      throw "Silver Moon pet preflight failed: $($petVerification -join ' ')"
    }
  }
  Install-CultivationBaseTheme -ConfigPath $ConfigPath -BackupPath $BackupPath
  if ($NoSpiritPet) {
    Write-CultivationUtf8FileAtomically -Path $PetDisableFile -Content "disabled`r`n"
  } else {
    $petInstall = @(& $node.Path $PetManager install --family $PetFamily `
      --state-root $StateRoot --codex-home $CodexHome 2>&1)
    if ($LASTEXITCODE -ne 0) {
      throw "Silver Moon pet installation failed: $($petInstall -join ' ')"
    }
    Remove-Item -LiteralPath $PetDisableFile -Force -ErrorAction SilentlyContinue
  }

  if (-not $NoShortcuts) {
    $shell = New-Object -ComObject WScript.Shell
    $desktop = [Environment]::GetFolderPath('Desktop')
    $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
    $startScript = Join-Path $PSScriptRoot 'start-codex-cultivation.ps1'
    $restoreScript = Join-Path $PSScriptRoot 'restore-codex-cultivation.ps1'
    $trayScript = Join-Path $PSScriptRoot 'tray-codex-cultivation.ps1'
    $portArgument = if ($PortExplicit) { " -Port $Port" } else { '' }

    foreach ($folder in @($desktop, $startMenu)) {
      $shortcut = $shell.CreateShortcut((Join-Path $folder 'Codex Cultivation.lnk'))
      $shortcut.TargetPath = $powershell
      $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`"$portArgument -PromptRestart"
      $shortcut.WorkingDirectory = $SkillRoot
      $shortcut.Description = 'Launch the official Codex app with Codex Cultivation'
      $shortcut.Save()
    }

    $restore = $shell.CreateShortcut((Join-Path $desktop 'Codex Cultivation - Restore.lnk'))
    $restore.TargetPath = $powershell
    $restore.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$restoreScript`"$portArgument -RestoreBaseTheme -PromptRestart"
    $restore.WorkingDirectory = $SkillRoot
    $restore.Description = 'Restore the official Codex appearance and close the CDP session'
    $restore.Save()

    foreach ($folder in @($desktop, $startMenu)) {
      $tray = $shell.CreateShortcut((Join-Path $folder 'Codex Cultivation - Tray.lnk'))
      $tray.TargetPath = $powershell
      $tray.Arguments = "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$trayScript`"$portArgument"
      $tray.WorkingDirectory = $SkillRoot
      $tray.Description = 'Open Codex Cultivation status and theme controls in the system tray'
      $tray.Save()
    }
    Start-Process -FilePath $powershell -ArgumentList `
      "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$trayScript`"$portArgument" `
      -WindowStyle Hidden | Out-Null
  }

  if ($NoShortcuts) {
    $petMessage = if ($NoSpiritPet) { ' Spirit pet management is disabled.' } else { ' Silver Moon was installed.' }
    Write-Host "Codex Cultivation base theme installed.$petMessage Run start-codex-cultivation.ps1 to launch it."
  } else {
    $petMessage = if ($NoSpiritPet) { ' Spirit pet management is disabled.' } else { ' Silver Moon was installed.' }
    Write-Host "Codex Cultivation installed.$petMessage The launch shortcut asks before restarting an open Codex window."
  }
} finally {
  Exit-CultivationOperationLock -Mutex $operationLock
}
