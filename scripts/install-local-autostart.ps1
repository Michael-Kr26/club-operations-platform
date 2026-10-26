param([switch]$Remove, [string]$DataDirectory = $env:COP_DATA_DIR)
$ErrorActionPreference = 'Stop'
if (-not $DataDirectory) { $DataDirectory = Join-Path $env:USERPROFILE '.cop' }
$DataDirectory = [IO.Path]::GetFullPath($DataDirectory)
if ($DataDirectory.Contains('"')) { throw 'Ongeldig pad.' }
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'COP lokaal.lnk'
if ($Remove) {
  if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
  Write-Output 'Automatisch starten van COP uitgeschakeld.'
  exit
}
$startScript = Join-Path $PSScriptRoot 'start-local.ps1'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -File "' + $startScript + '" -DataDirectory "' + $DataDirectory + '"'
$shortcut.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Start de lokale COP-werkruimte bij Windows-aanmelding'
$shortcut.Save()
Write-Output 'COP start voortaan bij aanmelden. Dit start COP nu nog niet. Logbestand: startup.log in de lokale gegevensmap.'
