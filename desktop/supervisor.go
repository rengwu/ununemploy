package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

type instance struct {
	PID        int    `json:"pid"`
	ServicePID int    `json:"servicePid"`
	URL        string `json:"url"`
	Control    string `json:"control"`
	Token      string `json:"token"`
}

type supervisor struct {
	resources, data string
	lock, log       *os.File
	control         net.Listener
	state           instance
	show            func()
	quit            func()
	cmd             *exec.Cmd
	stdin           io.WriteCloser
	done            chan struct{}
	exit            error
	mu              sync.Mutex
	closed          bool
	platform        platformService
}

func newSupervisor(resources, data string) (*supervisor, error) {
	data, err := filepath.Abs(data)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(data, 0700); err != nil {
		return nil, err
	}
	lock, err := os.OpenFile(filepath.Join(data, "desktop.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err := lockInstance(lock); err != nil {
		lock.Close()
		if !errors.Is(err, errInstanceLocked) {
			return nil, err
		}
		// The first launch may still be publishing its control address.
		for attempt := 0; attempt < 30; attempt++ {
			var state instance
			b, _ := os.ReadFile(filepath.Join(data, "desktop-instance.json"))
			if json.Unmarshal(b, &state) == nil && strings.HasPrefix(state.Control, "http://127.0.0.1:") {
				req, _ := http.NewRequest(http.MethodPost, state.Control+"/show", nil)
				req.Header.Set("Authorization", "Bearer "+state.Token)
				client := http.Client{Timeout: time.Second}
				if res, e := client.Do(req); e == nil {
					res.Body.Close()
					if res.StatusCode == 204 {
						return nil, nil
					}
				}
			}
			time.Sleep(100 * time.Millisecond)
		}
		return nil, fmt.Errorf("ununemploy is already starting. Open it again in a moment.")
	}
	s := &supervisor{resources: resources, data: data, lock: lock, done: make(chan struct{})}
	fail := func(e error) (*supervisor, error) { s.close(); return nil, e }
	// Bound local logs without deleting the previous launch's diagnostic output.
	logPath := filepath.Join(data, "desktop.log")
	if info, e := os.Stat(logPath); e == nil && info.Size() > 5*1024*1024 {
		_ = os.Rename(logPath, logPath+".previous")
	}
	s.log, err = os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return fail(err)
	}
	s.control, err = net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return fail(err)
	}
	secret := make([]byte, 32)
	if _, err = rand.Read(secret); err != nil {
		return fail(err)
	}
	s.state = instance{PID: os.Getpid(), Control: "http://" + s.control.Addr().String(), Token: hex.EncodeToString(secret)}
	if err = s.saveState(); err != nil {
		return fail(err)
	}
	go http.Serve(s.control, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if (r.URL.Path != "/show" && r.URL.Path != "/quit") || r.Method != http.MethodPost || r.Header.Get("Authorization") != "Bearer "+s.state.Token {
			http.NotFound(w, r)
			return
		}
		s.mu.Lock()
		show := s.show
		if r.URL.Path == "/quit" {
			show = s.quit
		}
		s.mu.Unlock()
		if show != nil {
			show()
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	return s, nil
}

func (s *supervisor) saveState() error {
	b, err := json.Marshal(s.state)
	if err != nil {
		return err
	}
	tmp := filepath.Join(s.data, "desktop-instance.json.tmp")
	if err = os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return replaceInstanceFile(tmp, filepath.Join(s.data, "desktop-instance.json"))
}

func (s *supervisor) start() (string, error) {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return "", nil
	}
	// Prefer the last origin so WebKit retains filters and editor navigation.
	port := 4321
	if b, e := os.ReadFile(filepath.Join(s.data, "desktop-port")); e == nil {
		if n, e := strconv.Atoi(strings.TrimSpace(string(b))); e == nil && n > 1024 && n < 65536 {
			port = n
		}
	}
	cleanup, err := s.prepareService(port)
	if err != nil {
		s.mu.Unlock()
		return "", err
	}
	defer cleanup()
	s.cmd.Stdout = s.log
	s.cmd.Stderr = s.log
	s.stdin, err = s.cmd.StdinPipe()
	if err == nil {
		err = s.cmd.Start()
	}
	if err != nil {
		if s.stdin != nil {
			s.stdin.Close()
		}
		s.cmd = nil
		s.mu.Unlock()
		return "", fmt.Errorf("Could not start the bundled services: %w", err)
	}
	s.state.ServicePID = s.cmd.Process.Pid
	go func() { s.exit = s.cmd.Wait(); close(s.done) }()
	err = s.serviceStarted()
	s.mu.Unlock()
	if err != nil {
		return "", err
	}
	client := http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case <-s.done:
			return "", fmt.Errorf("The services stopped during startup. See %s", filepath.Join(s.data, "desktop.log"))
		default:
		}
		if s.state.URL == "" {
			if err := s.readServiceAddress(); err != nil {
				return "", err
			}
			if s.state.URL == "" {
				time.Sleep(100 * time.Millisecond)
				continue
			}
			_ = os.WriteFile(filepath.Join(s.data, "desktop-port"), []byte(strconv.Itoa(listenerPort(strings.TrimPrefix(s.state.URL, "http://")))), 0600)
			if err := s.saveState(); err != nil {
				return "", err
			}
		}
		res, e := client.Get(s.state.URL + "/api/health")
		if e == nil {
			res.Body.Close()
			if res.StatusCode == 200 {
				return s.state.URL, nil
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	return "", fmt.Errorf("The services did not become ready. See %s", filepath.Join(s.data, "desktop.log"))
}

func listenerPort(address string) int {
	_, p, _ := net.SplitHostPort(address)
	n, _ := strconv.Atoi(p)
	return n
}

func desktopEnvironment(resources, data string) []string {
	// Finder has a small PATH. Bundled runtimes take precedence; no shell is used.
	overrides := map[string]string{
		"PATH":        runtimePath(resources),
		"JH_DATA_DIR": data, "JH_HOST": "127.0.0.1", "JH_TEST_SERVER": "1", "JH_DESKTOP": "1",
		"JH_CODEX_MODEL": "gpt-5.6-sol", "JH_CODEX_REASONING_EFFORT": "high",
		"JH_TECTONIC_BIN":          filepath.Join(resources, "bin/"+executableName("tectonic")),
		"JH_LATEX_CACHE":           filepath.Join(resources, "tex-cache"),
		"PLAYWRIGHT_BROWSERS_PATH": filepath.Join(resources, "browsers"),
	}
	if runtime.GOOS == "windows" {
		overrides["JH_LATEX_SANDBOX"] = filepath.Join(resources, "bin", executableName("ununemploy-tex-sandbox"))
		overrides["JH_WINDOWS_PDF"] = filepath.Join(resources, "..", "ununemploy.exe")
	}
	env := []string{}
	for _, v := range os.Environ() {
		k, _, _ := strings.Cut(v, "=")
		k = environmentKey(k)
		if _, ok := overrides[k]; !ok && k != "NODE_OPTIONS" && k != "JH_PROFILE_SEED" && k != "JH_CHROMIUM_PATH" && k != "ORIGIN" {
			env = append(env, v)
		}
	}
	for k, v := range overrides {
		env = append(env, k+"="+v)
	}
	return env
}

func (s *supervisor) wait() error {
	<-s.done
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	return fmt.Errorf("The services stopped unexpectedly. Quit and reopen ununemploy. Details: %s", filepath.Join(s.data, "desktop.log"))
}

func (s *supervisor) close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	cmd := s.cmd
	s.mu.Unlock()
	if cmd != nil && cmd.Process != nil {
		s.stopService()
		if s.stdin != nil {
			_ = s.stdin.Close()
		}
		select {
		case <-s.done:
		case <-time.After(5 * time.Second):
		}
		// Also reap descendants that survived the service process.
		s.killService()
	}
	s.closePlatform()
	if s.control != nil {
		s.control.Close()
	}
	if s.lock != nil {
		_ = os.Remove(filepath.Join(s.data, "desktop-instance.json"))
		unlockInstance(s.lock)
		s.lock.Close()
	}
	if s.log != nil {
		s.log.Close()
	}
}

var errInstanceLocked = errors.New("desktop instance is locked")
