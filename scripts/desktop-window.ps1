param(
  [Parameter(Mandatory=$true)][int]$TargetPid,
  [ValidateSet('inspect','activate','close','quit','processes','wait-processes','cancel-quit','save-download')][string]$Action = 'inspect',
  [string]$SavePath,
  [string]$ProcessSnapshot
)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = $PSHOME + '\Modules'
if ($Action -eq 'processes') {
  $processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate)
  $root = $processes | Where-Object { $_.ProcessId -eq $TargetPid } | Select-Object -First 1
  if (!$root) { throw 'Fixture process not found' }
  $owned = [System.Collections.Generic.Dictionary[int,datetime]]::new()
  $owned.Add($TargetPid,$root.CreationDate)
  do {
    $changed = $false
    foreach ($entry in $processes) {
      if (!$owned.ContainsKey([int]$entry.ProcessId) -and $owned.ContainsKey([int]$entry.ParentProcessId) -and $entry.CreationDate -ge $owned[[int]$entry.ParentProcessId]) {
        $owned.Add([int]$entry.ProcessId,$entry.CreationDate); $changed = $true
      }
    }
  } while ($changed)
  $snapshot = @(foreach ($id in $owned.Keys) {
    try {
      $process = [Diagnostics.Process]::GetProcessById($id)
      try { @{ pid=$id; started=$process.StartTime.ToUniversalTime().Ticks.ToString(); name=$process.ProcessName } } finally { $process.Dispose() }
    } catch [ArgumentException] { }
  })
  ConvertTo-Json -Compress -InputObject $snapshot
  exit
}
if ($Action -eq 'wait-processes') {
  $tracked = @()
  try {
    foreach ($identity in (ConvertFrom-Json $ProcessSnapshot)) {
      try { $process = [Diagnostics.Process]::GetProcessById([int]$identity.pid) } catch [ArgumentException] { continue }
      if ($process.StartTime.ToUniversalTime().Ticks.ToString() -ne $identity.started) { $process.Dispose(); continue }
      # Retain the OS process handle so later PID reuse cannot look like a survivor.
      $null = $process.Handle
      $tracked += @{ process=$process; identity=$identity }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
      $remaining = @($tracked | Where-Object { !$_.process.HasExited })
      if ($remaining.Count -eq 0) { break }
      Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    ConvertTo-Json -Compress -Depth 4 @{ exited=($remaining.Count -eq 0); remaining=@($remaining | ForEach-Object { $_.identity }) }
  } finally { foreach ($entry in $tracked) { $entry.process.Dispose() } }
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
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetFocus();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [StructLayout(LayoutKind.Sequential)] public struct KeyboardInput { public ushort key, scan; public uint flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct MouseInput { public int x, y; public uint data, flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] public struct InputData { [FieldOffset(0)] public KeyboardInput keyboard; [FieldOffset(0)] public MouseInput mouse; }
  [StructLayout(LayoutKind.Sequential)] public struct Input { public uint type; public InputData data; }
  [DllImport("user32.dll")] public static extern uint SendInput(uint count, Input[] inputs, int size);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wp, IntPtr lp);
  [DllImport("user32.dll", EntryPoint="SendMessageW", CharSet=CharSet.Unicode)] public static extern IntPtr ReadMessage(IntPtr window, uint message, IntPtr wp, System.Text.StringBuilder text);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumCallback callback, IntPtr param);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr window);
  public static bool SetFilename(IntPtr dialog, string path) {
    if(dialog==IntPtr.Zero) return false;
    IntPtr edit=IntPtr.Zero;
    EnumChildWindows(dialog,(window,param)=>{
      var name=new System.Text.StringBuilder(256);GetClassName(window,name,256);
      if(GetDlgCtrlID(window)==1001 && name.ToString()=="Edit") {
        edit=window;return false;
      }
      return true;
    },IntPtr.Zero);
    if(edit==IntPtr.Zero) return false;
    uint owner; uint targetThread=GetWindowThreadProcessId(dialog,out owner);
    uint currentThread=GetCurrentThreadId();
    uint foregroundThread=GetWindowThreadProcessId(GetForegroundWindow(),out owner);
    bool foregroundAttached=foregroundThread!=currentThread && foregroundThread!=targetThread && AttachThreadInput(currentThread,foregroundThread,true);
    bool targetAttached=false;
    bool focused=false;
    try {
      targetAttached=AttachThreadInput(currentThread,targetThread,true);
      if(!targetAttached) throw new InvalidOperationException("Cannot attach to fixture input thread");
      SetForegroundWindow(dialog);SetFocus(edit);
      focused=GetFocus()==edit && GetForegroundWindow()==dialog;
    } finally {
      if(targetAttached) AttachThreadInput(currentThread,targetThread,false);
      if(foregroundAttached) AttachThreadInput(currentThread,foregroundThread,false);
    }
    if(!focused || GetForegroundWindow()!=dialog) throw new InvalidOperationException("Cannot focus fixture filename: foreground="+GetForegroundWindow()+", dialog="+dialog+", focused="+focused);
    // WM_SETTEXT can update the legacy Edit without updating the shell's
    // filename model. Type through the focused control as a user would.
    var keys=new List<Input>();
    keys.Add(Key(0x11,0,0));keys.Add(Key(0x41,0,0));
    keys.Add(Key(0x41,0,2));keys.Add(Key(0x11,0,2));
    foreach(char character in path) {
      keys.Add(Key(0,character,4));keys.Add(Key(0,character,6));
    }
    return SendInput((uint)keys.Count,keys.ToArray(),Marshal.SizeOf(typeof(Input)))==keys.Count;
  }
  private static Input Key(ushort key, ushort scan, uint flags) {
    return new Input { type=1, data=new InputData { keyboard=new KeyboardInput { key=key, scan=scan, flags=flags } } };
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
  $filenameDeadline = [DateTime]::UtcNow.AddSeconds(3)
  while ([DesktopWindowCheck]::Filename($dialog) -ne $canonicalSavePath -and [DateTime]::UtcNow -lt $filenameDeadline) { Start-Sleep -Milliseconds 100 }
  if ([DesktopWindowCheck]::Filename($dialog) -ne $canonicalSavePath) { throw 'Fixture filename input did not finish' }
  if (!([DesktopWindowCheck]::ClickSave($dialog))) { throw 'Native Save button not found' }
}
$dialogs = if ($Action -eq 'inspect') { [DesktopWindowCheck]::DialogControls($TargetPid) } else { @() }
ConvertTo-Json -Compress @{ found = $true; visible = [DesktopWindowCheck]::IsWindowVisible($window); dialogs = $dialogs }
