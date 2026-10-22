param([string]$Destination)
$ErrorActionPreference = 'Stop'
try {
  . (Join-Path $Destination 'package.ps1')
  Assert-PlainPath $Destination
  Get-PackageFiles $Destination | Out-Null
  Assert-PackageIdentity $Destination
  $root = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
  $running = @(Get-CimInstance Win32_Process -Filter "Name='ununemploy.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) })
  if ($running.Count) { exit 2 }
} catch { exit 1 }
