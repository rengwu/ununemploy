param([string]$Package, [string]$Destination, [string]$ErrorFile, [string]$TransactionFile)
$ErrorActionPreference = 'Stop'
try {
  . (Join-Path $Package 'package.ps1')
  # Verify before prerequisite installation or changing the destination.
  Assert-Package $Package
  if (!(Get-WebView2Version)) {
    $bootstrapper = Join-Path ([IO.Path]::GetTempPath()) ('ununemploy-webview2-' + [Guid]::NewGuid().ToString('N') + '.exe')
    try {
      Invoke-WebRequest -UseBasicParsing -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper
      $signature = Get-AuthenticodeSignature -LiteralPath $bootstrapper
      if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(?:,|$)') { throw 'The Microsoft WebView2 installer signature could not be verified.' }
      $runtimeInstaller = Start-Process -FilePath $bootstrapper -ArgumentList '/silent /install' -WindowStyle Hidden -PassThru
      if (!$runtimeInstaller.WaitForExit(180000)) { throw 'WebView2 installation is still running. Wait for it to finish, then retry setup.' }
      if (!(Get-WebView2Version)) { throw 'WebView2 installation did not finish successfully. Check your internet connection and retry setup.' }
    } finally { if (Test-Path -LiteralPath $bootstrapper) { Remove-Item -LiteralPath $bootstrapper -Force } }
  }
  & (Join-Path $Package 'install.ps1') -Destination $Destination -NoShortcut -TransactionFile $TransactionFile
} catch {
  $_.Exception.Message | Set-Content -LiteralPath $ErrorFile -Encoding UTF8
  exit 1
}
