param([string]$Destination)
$ErrorActionPreference = 'Stop'
try {
  . (Join-Path $Destination 'package.ps1')
  Assert-PlainPath $Destination
  Get-PackageFiles $Destination | Out-Null
  Assert-PackageIdentity $Destination
  $root = (Get-CanonicalPath $Destination) + '\'
  $running = @(Get-CimInstance Win32_Process -Filter "Name='ununemploy.exe'" | Where-Object { $_.ExecutablePath -and (Get-CanonicalPath $_.ExecutablePath).StartsWith($root, [StringComparison]::OrdinalIgnoreCase) })
  if ($running.Count) { exit 2 }
} catch { exit 1 }
