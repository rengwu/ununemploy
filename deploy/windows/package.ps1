# Read-only package/prerequisite checks, shared by install.ps1 and its tests.
# Use this shell's modules even when launched through Node from PowerShell 7.
$env:PSModulePath = $PSHOME + '\Modules'
function Assert-PlainPath([string]$Path) {
  $cursor = [IO.Path]::GetFullPath($Path)
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "Installation paths cannot use links or junctions: $cursor"
      }
    }
    $cursor = [IO.Path]::GetDirectoryName($cursor)
  }
}

function Get-PackageFiles([string]$Path) {
  Assert-PlainPath $Path
  $pending = [Collections.Generic.Stack[IO.DirectoryInfo]]::new()
  $pending.Push([IO.DirectoryInfo]::new($Path))
  while ($pending.Count) {
    foreach ($entry in $pending.Pop().GetFileSystemInfos()) {
      if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "Application packages cannot contain links or junctions: $($entry.FullName)"
      }
      if ($entry -is [IO.DirectoryInfo]) { $pending.Push($entry) }
      else { $entry }
    }
  }
}

function Assert-PackageIdentity([string]$Path) {
  $manifest = Get-Content -LiteralPath (Join-Path $Path 'resources/build.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($manifest.platform -ne 'win32' -or $manifest.arch -ne 'x64' -or !(Test-Path -LiteralPath (Join-Path $Path 'ununemploy.exe') -PathType Leaf)) {
    throw 'Not an ununemploy Windows x64 package.'
  }
}

function Assert-Package([string]$Path) {
  $root = [IO.Path]::GetFullPath($Path).TrimEnd('\')
  $actual = [Collections.Generic.Dictionary[string,IO.FileInfo]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($file in (Get-PackageFiles $root)) {
    $name = $file.FullName.Substring($root.Length + 1).Replace('\','/')
    $actual.Add($name, $file)
  }
  Assert-PackageIdentity $root
  $inventoryName = 'resources/package-files.json'
  if (!$actual.ContainsKey($inventoryName)) { throw 'Incomplete package: checksum inventory is missing. Rebuild or extract the complete package.' }
  $inventory = Get-Content -LiteralPath $actual[$inventoryName].FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($inventory.version -ne 1 -or !$inventory.files -or $inventory.files -isnot [array]) { throw 'Invalid package checksum inventory.' }
  $actual.Remove($inventoryName) | Out-Null
  $expected = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    foreach ($file in $inventory.files) {
      $name = [string]$file.path
      if (!$name -or $name -match '[:\\]' -or @($name.Split('/') | Where-Object { $_ -in @('','.','..') }).Count -or !$expected.Add($name)) {
        throw 'Invalid or duplicate path in package checksum inventory.'
      }
      if (!$actual.ContainsKey($name)) { throw "Incomplete package: missing $name" }
      $entry = $actual[$name]
      if ($null -eq $file.size -or $entry.Length -ne $file.size -or $file.sha256 -notmatch '^[0-9a-f]{64}$') {
        throw "Package checksum mismatch: $name"
      }
      $stream = $entry.OpenRead()
      try { $digest = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
      finally { $stream.Dispose() }
      if ($digest -ne $file.sha256) { throw "Package checksum mismatch: $name" }
    }
  } finally { $sha.Dispose() }
  if ($expected.Count -ne $actual.Count) { throw 'Package contains files outside its checksum inventory. Extract a fresh copy.' }
  foreach ($required in @(
    'ununemploy.exe', 'install.ps1', 'package.ps1', 'resources/build.json',
    'resources/bin/node.exe', 'resources/bin/tectonic.exe', 'resources/bin/ununemploy-tex-sandbox.exe',
    'resources/app/package.json', 'resources/app/dist/index.html',
    'resources/app/scripts/desktop-bootstrap.mjs'
  )) {
    if (!$expected.Contains($required)) { throw "Incomplete package: missing $required" }
  }
  $build = Get-Content -LiteralPath (Join-Path $root 'resources/build.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $runtimeFiles = @('resources/app/core/ai/pi-sdk.ts', 'resources/app/server/index.ts', 'resources/app/worker/index.ts', 'resources/app/scripts/desktop-service.ts')
  $prefixes = @('resources/app/node_modules/', 'resources/tex-cache/', 'resources/browsers/')
  if ($build.packageFormat -eq 2) {
    $runtimeFiles = @('resources/app/runtime/desktop-service.mjs', 'resources/app/runtime/worker.mjs', 'resources/app/core/assistant/extract-pdf.worker.mjs', 'resources/app/core/latex/starter.tex', 'resources/app/core/profile/skills/build-user-profile/SKILL.md')
    $prefixes = @('resources/app/node_modules/pdfjs-dist/', 'resources/tex-cache/', 'resources/app/core/db/migrations/')
  }
  foreach ($required in $runtimeFiles) {
    if (!$expected.Contains($required)) { throw "Incomplete package: missing $required" }
  }
  foreach ($prefix in $prefixes) {
    if (!@($inventory.files | Where-Object { $_.path.StartsWith($prefix, [StringComparison]::Ordinal) }).Count) {
      throw "Incomplete package: missing $prefix"
    }
  }
}

function Get-WebView2Version {
  # Microsoft's documented per-machine and per-user Evergreen locations.
  # Registry32 selects WOW6432Node regardless of the PowerShell process bitness.
  foreach ($hive in @([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryHive]::CurrentUser)) {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, [Microsoft.Win32.RegistryView]::Registry32)
    try {
      $key = $base.OpenSubKey('Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}')
      if ($null -ne $key) {
        try {
          $version = $null
          if ([version]::TryParse([string]$key.GetValue('pv'), [ref]$version) -and $version -gt [version]'0.0.0.0') { return $version.ToString() }
        } finally { $key.Dispose() }
      }
    } finally { $base.Dispose() }
  }
  return $null
}

function Assert-WindowsPrerequisites {
  if ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() -ne 'X64') { throw 'This package requires Windows x64.' }
  $version = Get-WebView2Version
  if (!$version) { throw 'Microsoft Edge WebView2 Runtime is required. Install the Evergreen Runtime from https://developer.microsoft.com/microsoft-edge/webview2/ and run this installer again.' }
  return $version
}
