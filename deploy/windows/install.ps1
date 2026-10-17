param(
  [string]$Destination = (Join-Path $env:LOCALAPPDATA 'Programs/ununemploy'),
  [switch]$NoShortcut,
  [switch]$Check
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'package.ps1')
$source = [IO.Path]::GetFullPath($PSScriptRoot)
$destinationPath = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
$dataPath = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ununemploy')).TrimEnd('\')
if ($destinationPath -eq $dataPath -or $dataPath.StartsWith($destinationPath + '\',[StringComparison]::OrdinalIgnoreCase) -or $destinationPath.StartsWith($dataPath + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Installation and personal data must use separate directories.' }
if ($destinationPath -eq $source -or $source.StartsWith($destinationPath + '\',[StringComparison]::OrdinalIgnoreCase) -or $destinationPath.StartsWith($source + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Choose a destination outside the extracted package.' }
Assert-PlainPath $destinationPath
Assert-Package $source
$webviewVersion = Assert-WindowsPrerequisites
if ($Check) {
  Write-Output "Package checksums verified. WebView2 $webviewVersion is installed."
  return
}
if (Test-Path -LiteralPath $destinationPath) {
  # Older/corrupted app files can be repaired. Require identity and reject any
  # junctions before moving/deleting this directory, without requiring new hashes.
  Get-PackageFiles $destinationPath | Out-Null
  Assert-PackageIdentity $destinationPath
}
$running = @(Get-CimInstance Win32_Process -Filter "Name='ununemploy.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($destinationPath + '\',[StringComparison]::OrdinalIgnoreCase) })
if ($running.Count) { throw 'Quit ununemploy before installing this update.' }
$parent = [IO.Path]::GetDirectoryName($destinationPath)
[IO.Directory]::CreateDirectory($parent) | Out-Null
$stagingPath = $destinationPath + '.installing-' + [Guid]::NewGuid().ToString('N')
$previousPath = $destinationPath + '.previous-' + [Guid]::NewGuid().ToString('N')
# These exact sibling paths are generated here; personal data is never copied,
# moved or deleted. Publish only after the complete package has been copied.
try {
  Copy-Item -LiteralPath $source -Destination $stagingPath -Recurse
  Assert-Package $stagingPath
  # Directory.Move is a same-volume directory rename. PowerShell Move-Item may
  # recursively move children and leave a partial app if one file is locked.
  if (Test-Path -LiteralPath $destinationPath) { [IO.Directory]::Move($destinationPath, $previousPath) }
  try { [IO.Directory]::Move($stagingPath, $destinationPath) }
  catch {
    if (Test-Path -LiteralPath $previousPath) { [IO.Directory]::Move($previousPath, $destinationPath) }
    throw
  }
  if (Test-Path -LiteralPath $previousPath) {
    try { Remove-Item -LiteralPath $previousPath -Recurse -Force }
    catch { Write-Warning "The update is installed. Previous application files could not be removed from $previousPath. Close programs using those files before removing that directory." }
  }
} finally {
  if (Test-Path -LiteralPath $stagingPath) { Remove-Item -LiteralPath $stagingPath -Recurse -Force }
}
if (!$NoShortcut) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'ununemploy.lnk'))
  $shortcut.TargetPath = Join-Path $destinationPath 'ununemploy.exe'
  $shortcut.WorkingDirectory = $destinationPath
  $shortcut.Save()
}
Write-Output "Installed $destinationPath"
Write-Output "Personal data remains in $dataPath"
