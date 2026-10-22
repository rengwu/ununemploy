#ifndef AppVersion
  #error AppVersion must be supplied by the build script
#endif
#ifndef PackageRoot
  #error PackageRoot must be supplied by the build script
#endif
#ifndef OutputRoot
  #error OutputRoot must be supplied by the build script
#endif

[Setup]
AppId={{CF039767-4082-42CE-B1B4-A63F4F89DBF4}
AppName=ununemploy
AppVersion={#AppVersion}
AppPublisher=ununemploy
AppPublisherURL=https://github.com/rengwu/ununemploy
AppSupportURL=https://github.com/rengwu/ununemploy/issues
AppUpdatesURL=https://github.com/rengwu/ununemploy/releases
DefaultDirName={localappdata}\Programs\ununemploy
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.22000
DisableProgramGroupPage=yes
DisableDirPage=yes
DisableWelcomePage=yes
UninstallDisplayIcon={app}\ununemploy.exe
OutputDir={#OutputRoot}
OutputBaseFilename=ununemploy-{#AppVersion}-windows-x64-setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
SetupLogging=yes
Uninstallable=yes

[Files]
Source: "{#PackageRoot}\*"; DestDir: "{tmp}\payload"; Flags: dontcopy recursesubdirs createallsubdirs
Source: "setup-install.ps1"; Flags: dontcopy
Source: "setup-transaction.ps1"; Flags: dontcopy
Source: "setup-uninstall-check.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\ununemploy"; Filename: "{app}\ununemploy.exe"; WorkingDir: "{app}"; Check: CreateStartMenuShortcut

[Run]
Filename: "{app}\ununemploy.exe"; Description: "Open ununemploy"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\resources"
Type: files; Name: "{app}\ununemploy.exe"
Type: files; Name: "{app}\install.ps1"
Type: files; Name: "{app}\package.ps1"

[Code]
var SetupFinished: Boolean;

procedure FinishTransaction(Mode: String);
var Code: Integer;
begin
  if FileExists(ExpandConstant('{tmp}\install-state.json')) then begin
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\setup-transaction.ps1') +
      '" -Mode ' + Mode + ' -Package "' + ExpandConstant('{tmp}\payload') + '" -Destination "' + ExpandConstant('{app}') +
      '" -StateFile "' + ExpandConstant('{tmp}\install-state.json') + '"', '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then
      MsgBox('Setup could not finish application-file cleanup. Your personal data is unchanged. Retry setup to repair the installation.', mbError, MB_OK);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
#ifdef VerifyRollback
  if CurStep = ssInstall then RaiseException('Synthetic setup interruption');
#endif
  if CurStep = ssDone then begin
    SetupFinished := True;
    FinishTransaction('Commit');
  end;
end;

procedure DeinitializeSetup();
begin
  if not SetupFinished then FinishTransaction('Rollback');
end;

function CreateStartMenuShortcut(): Boolean;
begin
  Result := not WizardNoIcons;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var Code: Integer; ErrorText: AnsiString; Arguments: String;
begin
  Result := '';
  WizardForm.StatusLabel.Caption := 'Preparing ununemploy. Installing Microsoft WebView2 if needed...';
  ExtractTemporaryFiles('{tmp}\payload\*');
  ExtractTemporaryFile('setup-install.ps1');
  ExtractTemporaryFile('setup-transaction.ps1');
  Arguments := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\setup-install.ps1') +
    '" -Package "' + ExpandConstant('{tmp}\payload') + '" -Destination "' + ExpandConstant('{app}') +
    '" -ErrorFile "' + ExpandConstant('{tmp}\install-error.txt') + '" -TransactionFile "' + ExpandConstant('{tmp}\install-state.json') + '"';
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Arguments, '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then begin
    FinishTransaction('Rollback');
    if LoadStringFromFile(ExpandConstant('{tmp}\install-error.txt'), ErrorText) then Result := String(ErrorText)
    else Result := 'Setup could not install ununemploy. Please retry.';
  end;
end;

function InitializeUninstall(): Boolean;
var Code: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\setup-uninstall-check.ps1') +
    '" -Destination "' + ExpandConstant('{app}') + '"', '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
  if not Result then begin
    if Code = 2 then MsgBox('Quit ununemploy using File > Quit ununemploy, then retry uninstalling. Closing its window keeps it running.', mbError, MB_OK)
    else MsgBox('The installation could not be checked. Reinstall ununemploy, then retry uninstalling.', mbError, MB_OK);
  end;
end;
