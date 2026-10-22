$ErrorActionPreference = 'Stop'
$toolsPath = Join-Path $PSScriptRoot '../build/tools'
$compilerPath = Join-Path $toolsPath 'inno/ISCC.exe'
if (Test-Path -LiteralPath $compilerPath) { Write-Output $compilerPath; exit 0 }
[IO.Directory]::CreateDirectory($toolsPath) | Out-Null
$download = Join-Path $toolsPath 'innosetup-7.1.0-x64.exe'
Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/jrsoftware/issrc/releases/download/is-7_1_0/innosetup-7.1.0-x64.exe' -OutFile $download
if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne '0362a383ed217d4c4239b5933866dd96d3eb2102737da92f80f6057a4b40df2f') { throw 'Inno Setup checksum mismatch.' }
$signature = Get-AuthenticodeSignature -LiteralPath $download
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Pyrsys B.V.') { throw 'Inno Setup signature could not be verified.' }
$destination = [IO.Path]::GetFullPath((Join-Path $toolsPath 'inno'))
$installer = Start-Process -FilePath $download -ArgumentList ('/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER /DIR="' + $destination + '"') -WindowStyle Hidden -PassThru -Wait
if ($installer.ExitCode -ne 0 -or !(Test-Path -LiteralPath $compilerPath)) { throw 'Inno Setup compiler installation failed.' }
Write-Output $compilerPath
