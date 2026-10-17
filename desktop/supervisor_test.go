//go:build darwin

package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestDesktopHelper(t *testing.T) {
	if os.Getenv("JH_DESKTOP") != "1" {
		return
	}
	listener, err := net.FileListener(os.NewFile(3, "api"))
	if err != nil {
		os.Exit(2)
	}
	http.Serve(listener, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/health" {
			http.NotFound(w, r)
			return
		}
		fmt.Fprint(w, `{"ok":true}`)
	}))
	os.Exit(0)
}

func fixtureSupervisor(t *testing.T, script string) *supervisor {
	t.Helper()
	resources := t.TempDir()
	os.MkdirAll(filepath.Join(resources, "app"), 0700)
	os.MkdirAll(filepath.Join(resources, "bin"), 0700)
	if script == "" {
		script = "#!/bin/sh\nexec '" + strings.ReplaceAll(os.Args[0], "'", "'\"'\"'") + "' -test.run=TestDesktopHelper\n"
	}
	if err := os.WriteFile(filepath.Join(resources, "bin/node"), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	s, err := newSupervisor(resources, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.close)
	return s
}

func TestOwnedServiceLifecycleAndPortCollision(t *testing.T) {
	occupied, err := net.Listen("tcp4", "127.0.0.1:4321")
	if err == nil {
		defer occupied.Close()
	}
	s := fixtureSupervisor(t, "")
	url, err := s.start()
	if err != nil {
		t.Fatal(err)
	}
	if url == "http://127.0.0.1:4321" {
		t.Fatal("did not select a free port")
	}
	if s.state.ServicePID <= 0 {
		t.Fatal("missing service identity")
	}
	s.close()
	if err = syscall.Kill(s.state.ServicePID, 0); err != syscall.ESRCH {
		t.Fatalf("service survived Quit: %v", err)
	}
	if _, err = os.Stat(filepath.Join(s.data, "desktop-instance.json")); !os.IsNotExist(err) {
		t.Fatal("stale instance file")
	}
	if _, err = os.Stat(filepath.Join(s.data, "desktop-port")); err != nil {
		t.Fatal("lost persistent origin")
	}
	replacement, err := newSupervisor(s.resources, s.data)
	if err != nil {
		t.Fatal(err)
	}
	replacement.close()
}

func TestSecondLaunchActivatesExistingInstance(t *testing.T) {
	s := fixtureSupervisor(t, "")
	shown := make(chan bool, 1)
	s.mu.Lock()
	s.show = func() { shown <- true }
	s.mu.Unlock()
	second, err := newSupervisor(s.resources, s.data)
	if err != nil || second != nil {
		t.Fatalf("duplicate launch: %v", err)
	}
	select {
	case <-shown:
	case <-time.After(time.Second):
		t.Fatal("did not activate first instance")
	}
}

func TestServiceFailureIsVisible(t *testing.T) {
	s := fixtureSupervisor(t, "#!/bin/sh\nexit 7\n")
	if _, err := s.start(); err == nil || !strings.Contains(err.Error(), "startup") {
		t.Fatalf("missing startup failure: %v", err)
	}
}

func TestEnvironmentUsesPackagedRuntimeAndNoSeed(t *testing.T) {
	t.Setenv("JH_PROFILE_SEED", "/private/profile.json")
	t.Setenv("NODE_OPTIONS", "--require bad.js")
	t.Setenv("JH_CODEX_MODEL", "other")
	values := desktopEnvironment("/Applications/ununemploy.app/Contents/Resources", "/data")
	env := strings.Join(values, "\n")
	for _, bad := range []string{"JH_PROFILE_SEED=", "NODE_OPTIONS=", "JH_CODEX_MODEL=other"} {
		if strings.Contains(env, bad) {
			t.Fatal(bad)
		}
	}
	for _, expected := range []string{"JH_CODEX_MODEL=gpt-5.6-sol", "JH_DATA_DIR=/data", "JH_HOST=127.0.0.1"} {
		if !strings.Contains(env, expected) {
			t.Fatal(expected)
		}
	}
}
