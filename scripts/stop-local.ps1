param([string]$DataDirectory = $env:COP_DATA_DIR)
$ErrorActionPreference = 'Stop'
if (-not $DataDirectory) { $DataDirectory = Join-Path $env:USERPROFILE '.cop' }
if (-not (Test-Path -LiteralPath (Join-Path $DataDirectory 'pglite-local.lock'))) {
  throw 'Geen actieve lokale COP-start gevonden.'
}
[IO.File]::WriteAllText((Join-Path $DataDirectory 'stop-request'), 'stop')
Write-Output 'Stopverzoek verstuurd. COP sluit de processen en database netjes af.'
