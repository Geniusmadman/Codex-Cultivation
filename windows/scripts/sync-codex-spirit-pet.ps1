[CmdletBinding()]
param([int]$Port = 9335)

$ErrorActionPreference = 'Stop'
$PortExplicit = $PSBoundParameters.ContainsKey('Port')
$injector = Join-Path $PSScriptRoot 'injector.mjs'
$petFamily = Join-Path (Split-Path -Parent $PSScriptRoot) 'pets\yinyue\pet-family.json'
. (Join-Path $PSScriptRoot 'common-windows.ps1')

$operationLock = Enter-CultivationOperationLock
$syncExitCode = 1
try {
  $stateRoot = Join-Path $env:LOCALAPPDATA 'CodexCultivation'
  $statePath = Join-Path $stateRoot 'state.json'
  $state = Read-CultivationState -Path $statePath
  if (-not $PortExplicit -and $null -ne $state -and $state.port) { $Port = [int]$state.port }
  Assert-CultivationPort -Port $Port
  $node = Get-CultivationNodeRuntime
  $currentCodex = Get-CultivationCodexInstall
  $codex = $currentCodex
  $cdpIdentity = Get-CultivationVerifiedCdpIdentity -Port $Port -Codex $codex
  if ($null -eq $cdpIdentity -and $null -ne $state) {
    $savedCodex = Get-CultivationCodexInstallFromState -State $state
    if ($null -ne $savedCodex -and
      -not (Test-CultivationPathEqual -Left $savedCodex.Executable -Right $currentCodex.Executable)) {
      $savedIdentity = Get-CultivationVerifiedCdpIdentity -Port $Port -Codex $savedCodex
      if ($null -ne $savedIdentity) {
        $codex = $savedCodex
        $cdpIdentity = $savedIdentity
      }
    }
  }
  if ($null -eq $cdpIdentity) {
    throw "No verified Codex CDP endpoint is active on loopback port $Port."
  }
  if ($null -ne $state -and $state.browserId -and "$($state.browserId)" -cne $cdpIdentity.BrowserId) {
    throw 'The active CDP browser does not match the saved Cultivation session; state was preserved.'
  }
  $codexHome = if ($env:CODEX_HOME) {
    [System.IO.Path]::GetFullPath($env:CODEX_HOME)
  } else {
    [System.IO.Path]::GetFullPath((Join-Path $HOME '.codex'))
  }
  & $node.Path $injector --sync-pet --port $Port --browser-id $cdpIdentity.BrowserId `
    --timeout-ms 30000 --pet-family $petFamily --pet-state-root $stateRoot `
    --codex-home $codexHome --pet-disable-file (Join-Path $stateRoot 'spirit-pet-disabled')
  $syncExitCode = $LASTEXITCODE
} finally {
  Exit-CultivationOperationLock -Mutex $operationLock
}
exit $syncExitCode
