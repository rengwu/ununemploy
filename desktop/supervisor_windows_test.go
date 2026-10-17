package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

func TestMain(m *testing.M) {
	if os.Getenv("UNUNEMPLOY_TEST_DESCENDANT") == "1" {
		for {
			time.Sleep(time.Hour)
		}
	}
	if os.Getenv("JH_DESKTOP") == "1" {
		fixtureService()
		return
	}
	if os.Getenv("UNUNEMPLOY_TEST_PARENT") == "1" {
		s, err := newSupervisor(os.Getenv("UNUNEMPLOY_TEST_RESOURCES"), os.Getenv("UNUNEMPLOY_TEST_DATA"))
		if err != nil {
			os.Exit(2)
		}
		defer s.close()
		if _, err = s.start(); err != nil {
			os.Exit(3)
		}
		select {}
	}
	os.Exit(m.Run())
}
func fixtureService() {
	input := bufio.NewScanner(os.Stdin)
	if !input.Scan() || input.Text() != "start" {
		return
	}
	if os.Getenv("UNUNEMPLOY_TEST_FAIL") == "1" {
		os.Exit(7)
	}
	port, _ := strconv.Atoi(os.Getenv("JH_DESKTOP_PORT"))
	listener, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		listener, err = net.Listen("tcp4", "127.0.0.1:0")
	}
	if err != nil {
		os.Exit(4)
	}
	child := exec.Command(os.Args[0])
	child.Env = append(os.Environ(), "UNUNEMPLOY_TEST_DESCENDANT=1")
	if child.Start() != nil {
		os.Exit(5)
	}
	_ = os.WriteFile(filepath.Join(os.Getenv("JH_DATA_DIR"), "test-descendant"), []byte(strconv.Itoa(child.Process.Pid)), 0600)
	ready, _ := json.Marshal(map[string]any{"pid": os.Getpid(), "url": "http://" + listener.Addr().String()})
	path := os.Getenv("JH_DESKTOP_READY")
	_ = os.WriteFile(path+".tmp", ready, 0600)
	_ = os.Rename(path+".tmp", path)
	go func() {
		http.Serve(listener, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `{"ok":true}`) }))
	}()
	for input.Scan() {
		if input.Text() == "stop" {
			return
		}
	}
}
func fixtureSupervisor(t *testing.T) *supervisor {
	t.Helper()
	resources := t.TempDir()
	_ = os.MkdirAll(filepath.Join(resources, "bin"), 0700)
	_ = os.MkdirAll(filepath.Join(resources, "app"), 0700)
	source, err := os.Open(os.Args[0])
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	target, err := os.Create(filepath.Join(resources, "bin/node.exe"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = io.Copy(target, source)
	target.Close()
	if err != nil {
		t.Fatal(err)
	}
	s, err := newSupervisor(resources, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.close)
	return s
}
func processAlive(pid int) bool {
	handle, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		return false
	}
	defer windows.CloseHandle(handle)
	result, _ := windows.WaitForSingleObject(handle, 0)
	return result == uint32(windows.WAIT_TIMEOUT)
}
func await(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatal("condition timed out")
}
func descendant(s *supervisor) int {
	b, _ := os.ReadFile(filepath.Join(s.data, "test-descendant"))
	n, _ := strconv.Atoi(string(b))
	return n
}
func TestWindowsLifecycleAndPortCollision(t *testing.T) {
	occupied, err := net.Listen("tcp4", "127.0.0.1:4321")
	if err == nil {
		defer occupied.Close()
	}
	s := fixtureSupervisor(t)
	url, err := s.start()
	if err != nil {
		t.Fatal(err)
	}
	if url == "http://127.0.0.1:4321" {
		t.Fatal("port conflict was not handled")
	}
	child := descendant(s)
	if !processAlive(child) {
		t.Fatal("missing descendant")
	}
	s.close()
	await(t, func() bool { return !processAlive(s.state.ServicePID) && !processAlive(child) })
	if _, err := os.Stat(filepath.Join(s.data, "desktop-instance.json")); !os.IsNotExist(err) {
		t.Fatal("stale instance record")
	}
	replacement, err := newSupervisor(s.resources, s.data)
	if err != nil {
		t.Fatal(err)
	}
	defer replacement.close()
	next, err := replacement.start()
	if err != nil {
		t.Fatal(err)
	}
	if next != url {
		t.Fatal("origin not retained")
	}
}
func TestWindowsSingleInstanceAndControlAuthentication(t *testing.T) {
	s := fixtureSupervisor(t)
	shown := make(chan bool, 1)
	s.mu.Lock()
	s.show = func() { shown <- true }
	s.mu.Unlock()
	second, err := newSupervisor(s.resources, s.data)
	if err != nil || second != nil {
		t.Fatalf("duplicate: %v", err)
	}
	select {
	case <-shown:
	case <-time.After(time.Second):
		t.Fatal("not activated")
	}
	response, err := http.Post(s.state.Control+"/quit", "text/plain", nil)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 404 {
		t.Fatal("unauthenticated control accepted")
	}
}
func TestWindowsStartupFailure(t *testing.T) {
	t.Setenv("UNUNEMPLOY_TEST_FAIL", "1")
	s := fixtureSupervisor(t)
	if _, err := s.start(); err == nil || !strings.Contains(err.Error(), "startup") {
		t.Fatalf("missing startup error: %v", err)
	}
}
func TestWindowsParentCrashReapsDescendants(t *testing.T) {
	s := fixtureSupervisor(t)
	s.close()
	parent := exec.Command(os.Args[0])
	parent.Env = append(os.Environ(), "UNUNEMPLOY_TEST_PARENT=1", "UNUNEMPLOY_TEST_RESOURCES="+s.resources, "UNUNEMPLOY_TEST_DATA="+s.data)
	if err := parent.Start(); err != nil {
		t.Fatal(err)
	}
	defer parent.Process.Kill()
	var state instance
	await(t, func() bool {
		b, _ := os.ReadFile(filepath.Join(s.data, "desktop-instance.json"))
		_ = json.Unmarshal(b, &state)
		return state.ServicePID > 0 && descendant(s) > 0
	})
	child := descendant(s)
	if err := parent.Process.Kill(); err != nil {
		t.Fatal(err)
	}
	_ = parent.Wait()
	await(t, func() bool { return !processAlive(state.ServicePID) && !processAlive(child) })
	replacement, err := newSupervisor(s.resources, s.data)
	if err != nil {
		t.Fatal(err)
	}
	replacement.close()
}
func TestWindowsEnvironmentAndNavigation(t *testing.T) {
	t.Setenv("NODE_OPTIONS", "--require bad.js")
	t.Setenv("JH_PROFILE_SEED", "private.json")
	t.Setenv("JH_CODEX_MODEL", "other")
	env := strings.Join(desktopEnvironment(`C:\App\resources`, `C:\Data`), "\n")
	for _, bad := range []string{"NODE_OPTIONS=", "JH_PROFILE_SEED=", "JH_CODEX_MODEL=other"} {
		if strings.Contains(env, bad) {
			t.Fatal(bad)
		}
	}
	if !strings.Contains(env, `JH_CODEX_BIN=C:\App\resources\codex\bin\codex.exe`) {
		t.Fatal("wrong Windows executable")
	}
	origin := "http://127.0.0.1:4321"
	for _, raw := range []string{"https://example.com", "http://127.0.0.1:43210", "file:///private", "http://user@127.0.0.1:4321"} {
		if sameOrigin(raw, origin) {
			t.Fatal("navigation escaped origin")
		}
	}
	if !sameOrigin(origin+"/#jobs", origin) || !allowedFrame("blob:"+origin+"/test", origin) {
		t.Fatal("local navigation rejected")
	}
}
