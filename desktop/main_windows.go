package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

func desktopPaths() (string, string, error) {
	executable, err := os.Executable()
	if err != nil {
		return "", "", err
	}
	resources := filepath.Join(filepath.Dir(executable), "resources")
	data := os.Getenv("JH_DESKTOP_DATA_DIR")
	if data == "" {
		local := os.Getenv("LOCALAPPDATA")
		if local == "" {
			return "", "", fmt.Errorf("Windows local application data directory is unavailable")
		}
		data = filepath.Join(local, "ununemploy")
	}
	return resources, data, nil
}

func requestQuit(data string) error {
	var state instance
	b, err := os.ReadFile(filepath.Join(data, "desktop-instance.json"))
	if err != nil {
		return err
	}
	if err = json.Unmarshal(b, &state); err != nil {
		return err
	}
	if !strings.HasPrefix(state.Control, "http://127.0.0.1:") || state.Token == "" {
		return fmt.Errorf("Invalid running instance")
	}
	req, err := http.NewRequest(http.MethodPost, state.Control+"/quit", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+state.Token)
	client := http.Client{Timeout: 3 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != 204 {
		return fmt.Errorf("Could not request Quit (%d)", res.StatusCode)
	}
	return nil
}

func main() {
	exitCode := 0
	// Registered before supervisor cleanup so failure exits still reap services.
	defer func() {
		if exitCode != 0 {
			os.Exit(exitCode)
		}
	}()
	runtime.LockOSThread()
	if len(os.Args) == 3 && os.Args[1] == "--print-pdf" {
		if err := printPDF(os.Args[2]); err != nil {
			fmt.Fprintln(os.Stderr, err)
			exitCode = 1
		}
		return
	}
	resources, data, err := desktopPaths()
	headless := false
	for _, arg := range os.Args[1:] {
		if arg == "--quit" {
			if err = requestQuit(data); err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			return
		}
		if arg == "--headless" {
			headless = true
		}
	}
	if err != nil {
		exitCode = 1
		nativeError(err.Error())
		return
	}
	s, err := newSupervisor(resources, data)
	if err != nil {
		exitCode = 1
		if headless {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		nativeError(err.Error())
		return
	}
	if s == nil {
		return
	}
	defer s.close()
	log.SetOutput(s.log)
	url, err := s.start()
	if err != nil {
		exitCode = 1
		if headless {
			fmt.Fprintln(os.Stderr, err)
			return
		}
		nativeError(err.Error())
		return
	}
	if headless {
		stopped := make(chan struct{}, 1)
		s.mu.Lock()
		s.quit = func() {
			select {
			case stopped <- struct{}{}:
			default:
			}
		}
		s.mu.Unlock()
		select {
		case <-stopped:
		case <-s.done:
			exitCode = 1
		}
		return
	}
	if err = runNativeWindow(s, url); err != nil {
		exitCode = 1
		nativeError(err.Error())
	}
}
