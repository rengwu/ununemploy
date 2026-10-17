package main

import (
	"errors"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
)

type platformService struct{}

func replaceInstanceFile(source, target string) error { return os.Rename(source, target) }

func lockInstance(file *os.File) error {
	err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if errors.Is(err, syscall.EWOULDBLOCK) {
		return errInstanceLocked
	}
	return err
}
func unlockInstance(file *os.File)      { _ = syscall.Flock(int(file.Fd()), syscall.LOCK_UN) }
func executableName(name string) string { return name }
func environmentKey(key string) string  { return key }
func runtimePath(resources string) string {
	return filepath.Join(resources, "bin") + ":/usr/bin:/bin:/usr/sbin:/sbin"
}
func (s *supervisor) prepareService(port int) (func(), error) {
	listener, err := net.ListenTCP("tcp4", &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: port})
	if err != nil {
		listener, err = net.ListenTCP("tcp4", &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	}
	if err != nil {
		return nil, err
	}
	file, err := listener.File()
	address := listener.Addr().String()
	listener.Close()
	if err != nil {
		return nil, err
	}
	s.cmd = exec.Command(filepath.Join(s.resources, "bin/node"), "--import", "tsx", "scripts/desktop-service.ts")
	s.cmd.Dir = filepath.Join(s.resources, "app")
	s.cmd.ExtraFiles = []*os.File{file}
	s.cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	s.cmd.Env = desktopEnvironment(s.resources, s.data)
	s.state.URL = "http://" + address
	_ = os.WriteFile(filepath.Join(s.data, "desktop-port"), []byte(strconv.Itoa(listenerPort(address))), 0600)
	return func() { file.Close() }, nil
}
func (s *supervisor) serviceStarted() error     { return s.saveState() }
func (s *supervisor) readServiceAddress() error { return nil }
func (s *supervisor) stopService()              { _ = syscall.Kill(-s.cmd.Process.Pid, syscall.SIGTERM) }
func (s *supervisor) killService()              { _ = syscall.Kill(-s.cmd.Process.Pid, syscall.SIGKILL) }
func (s *supervisor) closePlatform()            {}
