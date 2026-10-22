param(
  [Parameter(Mandatory=$true)][int]$TargetPid,
  [ValidateSet('inspect','activate','close','quit','processes','cancel-quit','save-download')][string]$Action = 'inspect',
  [string]$SavePath
)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = $PSHOME + '\Modules'
if ($Action -eq 'processes') {
  $processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId)
  $owned = [System.Collections.Generic.HashSet[int]]::new()
  [void]$owned.Add($TargetPid)
  do {
    $changed = $false
    foreach ($entry in $processes) {
      if ($owned.Contains([int]$entry.ParentProcessId) -and $owned.Add([int]$entry.ProcessId)) { $changed = $true }
    }
  } while ($changed)
  ConvertTo-Json -Compress -InputObject @($owned | Sort-Object)
  exit
}
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class DesktopWindowCheck {
  public delegate bool EnumCallback(IntPtr window, IntPtr param);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumCallback callback, IntPtr param);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wp, IntPtr lp);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wp, string text);
  [DllImport("user32.dll", EntryPoint="SendMessageW", CharSet=CharSet.Unicode)] public static extern IntPtr ReadMessage(IntPtr window, uint message, IntPtr wp, System.Text.StringBuilder text);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumCallback callback, IntPtr param);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr window);
  public static bool SetFilename(IntPtr dialog, string path) {
    if(dialog==IntPtr.Zero) return false;
    bool found=false;
    EnumChildWindows(dialog,(window,param)=>{
      var name=new System.Text.StringBuilder(256);GetClassName(window,name,256);
      if(GetDlgCtrlID(window)==1001 && name.ToString()=="Edit") {
        SendMessage(window,0xc,IntPtr.Zero,path);
        var text=new System.Text.StringBuilder(32768);ReadMessage(window,0xd,(IntPtr)32768,text);
        found=text.ToString()==path;return false;
      }
      return true;
    },IntPtr.Zero);return found;
  }
  public static string Filename(IntPtr dialog) {
    string result=null;
    EnumChildWindows(dialog,(window,param)=>{
      var name=new System.Text.StringBuilder(256);GetClassName(window,name,256);
      if(GetDlgCtrlID(window)==1001 && name.ToString()=="Edit") {
        var text=new System.Text.StringBuilder(32768);ReadMessage(window,0xd,(IntPtr)32768,text);
        result=text.ToString(); return false;
      }
      return true;
    },IntPtr.Zero);
    return result;
  }
  public static bool ClickSave(IntPtr dialog) {
    SetForegroundWindow(dialog);
    IntPtr button=IntPtr.Zero;
    EnumChildWindows(dialog,(window,param)=>{
      var name=new System.Text.StringBuilder(256);GetClassName(window,name,256);
      if(GetDlgCtrlID(window)==1 && name.ToString()=="Button") { button=window; return false; }
      return true;
    },IntPtr.Zero);
    return button!=IntPtr.Zero && PostMessage(button,0xf5,IntPtr.Zero,IntPtr.Zero);
  }
  public static string[] DialogControls(int pid) {
    var controls=new List<string>();
    EnumWindows((window,param)=>{
      uint owner; GetWindowThreadProcessId(window,out owner);
      var name=new System.Text.StringBuilder(256); GetClassName(window,name,256);
      if(owner!=pid || name.ToString()!="#32770") return true;
      var title=new System.Text.StringBuilder(32768); ReadMessage(window,0xd,(IntPtr)32768,title);
      controls.Add("Dialog: "+title);
      EnumChildWindows(window,(child,unused)=>{
        var cls=new System.Text.StringBuilder(256);GetClassName(child,cls,256);
        var text=new System.Text.StringBuilder(32768);ReadMessage(child,0xd,(IntPtr)32768,text);
        controls.Add(cls+" #"+GetDlgCtrlID(child)+": "+text);
        return true;
      },IntPtr.Zero);
      return true;
    },IntPtr.Zero);
    return controls.ToArray();
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window, System.Text.StringBuilder name, int size);
  public static IntPtr Find(int pid, string className) {
    IntPtr result = IntPtr.Zero;
    EnumWindows((window,param) => {
      uint owner; GetWindowThreadProcessId(window, out owner);
      var name = new System.Text.StringBuilder(256); GetClassName(window, name, 256);
      if (owner == pid && name.ToString() == className) { result = window; return false; }
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
'@
$window = [DesktopWindowCheck]::Find($TargetPid,'ununemploy-window')
if ($window -eq [IntPtr]::Zero) { throw 'Native window not found' }
if ($Action -eq 'activate') { [void][DesktopWindowCheck]::ShowWindow($window,9); [void][DesktopWindowCheck]::SetForegroundWindow($window) }
if ($Action -eq 'close') { [void][DesktopWindowCheck]::PostMessage($window,0x10,[IntPtr]::Zero,[IntPtr]::Zero) }
if ($Action -eq 'quit') { [void][DesktopWindowCheck]::PostMessage($window,0x111,[IntPtr]1001,[IntPtr]::Zero) }
if ($Action -eq 'cancel-quit') {
  $dialog = [DesktopWindowCheck]::Find($TargetPid,'#32770')
  if ($dialog -eq [IntPtr]::Zero) { throw 'Quit confirmation not found' }
  [void][DesktopWindowCheck]::PostMessage($dialog,0x111,[IntPtr]2,[IntPtr]::Zero)
}
if ($Action -eq 'save-download') {
  if (!$SavePath) { throw 'A fixture save path is required' }
  $dialog = [DesktopWindowCheck]::Find($TargetPid,'#32770')
  if ($dialog -eq [IntPtr]::Zero) { throw 'Save As dialog not found' }
  $saveDirectory = (Get-Item -LiteralPath ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($SavePath))) -Force).FullName
  $canonicalSavePath = [IO.Path]::Combine($saveDirectory,[IO.Path]::GetFileName($SavePath))
  [void][DesktopWindowCheck]::SetForegroundWindow($dialog)
  Start-Sleep -Milliseconds 500
  if (!([DesktopWindowCheck]::SetFilename($dialog,$canonicalSavePath))) { throw 'Fixture filename did not reach the dialog' }
  Start-Sleep -Milliseconds 500
  if ([DesktopWindowCheck]::Filename($dialog) -ne $canonicalSavePath) { throw 'Save As is still initializing; retry the filename' }
  if (!([DesktopWindowCheck]::ClickSave($dialog))) { throw 'Native Save button not found' }
}
$dialogs = if ($Action -eq 'inspect') { [DesktopWindowCheck]::DialogControls($TargetPid) } else { @() }
ConvertTo-Json -Compress @{ found = $true; visible = [DesktopWindowCheck]::IsWindowVisible($window); dialogs = $dialogs }
