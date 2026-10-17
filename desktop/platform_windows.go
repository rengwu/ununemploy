package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

type platformService struct {
	job   windows.Handle
	ready string
}

func replaceInstanceFile(source, target string) error {
	// A concurrent status reader or antivirus may briefly deny replacement on Windows.
	// Keep the previous complete record visible and retry the atomic rename.
	var err error
	for attempt := 0; attempt < 50; attempt++ {
		err = os.Rename(source, target)
		if err == nil || (!errors.Is(err, windows.ERROR_SHARING_VIOLATION) && !errors.Is(err, windows.ERROR_ACCESS_DENIED)) {
			return err
		}
		time.Sleep(20 * time.Millisecond)
	}
	return err
}

func lockInstance(file *os.File) error {
	err := windows.LockFileEx(windows.Handle(file.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &windows.Overlapped{})
	if errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
		return errInstanceLocked
	}
	return err
}
func unlockInstance(file *os.File) {
	_ = windows.UnlockFileEx(windows.Handle(file.Fd()), 0, 1, 0, &windows.Overlapped{})
}
func executableName(name string) string { return name + ".exe" }
func environmentKey(key string) string  { return strings.ToUpper(key) }
func runtimePath(resources string) string {
	return filepath.Join(resources, "bin") + string(os.PathListSeparator) + os.Getenv("PATH")
}
func (s *supervisor) prepareService(port int) (func(), error) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return nil, err
	}
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err = windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		windows.CloseHandle(job)
		return nil, err
	}
	s.platform.job = job
	s.platform.ready = filepath.Join(s.data, "desktop-ready-"+s.state.Token+".json")
	s.cmd = exec.Command(filepath.Join(s.resources, "bin/node.exe"), "scripts/desktop-bootstrap.mjs")
	s.cmd.Dir = filepath.Join(s.resources, "app")
	s.cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	s.cmd.Env = append(desktopEnvironment(s.resources, s.data), "JH_DESKTOP_PORT="+strconv.Itoa(port), "JH_DESKTOP_READY="+s.platform.ready)
	return func() { _ = os.Remove(s.platform.ready) }, nil
}
func (s *supervisor) serviceStarted() error {
	handle, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(s.cmd.Process.Pid))
	if err != nil {
		return err
	}
	defer windows.CloseHandle(handle)
	if err = windows.AssignProcessToJobObject(s.platform.job, handle); err != nil {
		return fmt.Errorf("Could not own service processes: %w", err)
	}
	// The plain Node bootstrap cannot load application code or spawn descendants
	// until ownership is established. Parent death before this closes stdin.
	_, err = s.stdin.Write([]byte("start\n"))
	return err
}
func (s *supervisor) readServiceAddress() error {
	b, err := os.ReadFile(s.platform.ready)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var ready struct {
		PID int    `json:"pid"`
		URL string `json:"url"`
	}
	if err = json.Unmarshal(b, &ready); err != nil {
		return err
	}
	u, err := url.Parse(ready.URL)
	if err != nil || ready.PID != s.state.ServicePID || u.Scheme != "http" || u.Hostname() != "127.0.0.1" || u.User != nil || u.Path != "" || listenerPort(u.Host) < 1 {
		return fmt.Errorf("Invalid service startup response")
	}
	s.state.URL = ready.URL
	return nil
}
func (s *supervisor) stopService() {
	if s.stdin != nil {
		_, _ = s.stdin.Write([]byte("stop\n"))
	}
}
func (s *supervisor) killService() {
	if s.platform.job != 0 {
		_ = windows.TerminateJobObject(s.platform.job, 0)
	}
	_ = s.cmd.Process.Kill()
}
func (s *supervisor) closePlatform() {
	if s.platform.job != 0 {
		windows.CloseHandle(s.platform.job)
	}
	if s.platform.ready != "" {
		_ = os.Remove(s.platform.ready)
	}
}
