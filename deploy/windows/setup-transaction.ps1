param([ValidateSet('Commit','Rollback')][string]$Mode, [string]$Package, [string]$Destination, [string]$StateFile)
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $StateFile)) { exit 0 }
. (Join-Path $Package 'package.ps1')
$state = Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
$root = Get-CanonicalPath $Destination
$personal = Get-CanonicalPath (Join-Path $env:LOCALAPPDATA 'ununemploy')
if ($root -eq $personal -or $root.StartsWith($personal + '\', [StringComparison]::OrdinalIgnoreCase) -or $personal.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Installation and personal data must be separate.' }
if ($state.version -ne 1 -or $state.destination -ne $root -or $state.previous -notmatch ('^' + [regex]::Escape($root) + '\.previous-[0-9a-f]{32}$')) { throw 'Invalid installation transaction paths.' }
Assert-PlainPath $root
Assert-PlainPath $state.previous
function Remove-Application([string]$Path) {
  # Only the validated destination or its generated sibling is ever removed.
  if ($Path -ne $root -and $Path -ne $state.previous) { throw 'Invalid application cleanup path.' }
  Get-PackageFiles $Path | Out-Null
  Assert-PackageIdentity $Path
  Remove-Item -LiteralPath $Path -Recurse -Force
}
if ($Mode -eq 'Commit') {
  if (Test-Path -LiteralPath $state.previous) { Remove-Application $state.previous }
} elseif (Test-Path -LiteralPath $state.previous) {
  if (Test-Path -LiteralPath $root) { Remove-Application $root }
  [IO.Directory]::Move($state.previous, $root)
} elseif (!$state.hadPrevious -and (Test-Path -LiteralPath $root)) {
  Remove-Application $root
}
Remove-Item -LiteralPath $StateFile -Force
