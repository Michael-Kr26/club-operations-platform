param([string]$DataDirectory = $env:COP_DATA_DIR)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
if (-not $DataDirectory) { $DataDirectory = Join-Path $env:USERPROFILE '.cop' }
$DataDirectory = [IO.Path]::GetFullPath($DataDirectory)
New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
if (Test-Path -LiteralPath (Join-Path $DataDirectory 'pglite-local.lock')) {
  throw 'COP draait al of de gegevensmap is vergrendeld. Controleer de bestaande COP-start.'
}
$env:COP_DATA_DIR = $DataDirectory
$env:COP_STOP_FILE = Join-Path $DataDirectory 'stop-request'
$pnpmExecutable = (Get-Command pnpm.cmd -ErrorAction Stop).Source
Set-Location -LiteralPath $projectDirectory
& $pnpmExecutable dev:local *>> (Join-Path $DataDirectory 'startup.log')
exit $LASTEXITCODE
