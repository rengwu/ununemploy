package main

/*
#cgo CFLAGS: -x objective-c -fobjc-arc -mmacosx-version-min=13.0
#cgo LDFLAGS: -framework Cocoa -framework WebKit
#include "native.h"
*/
import "C"

import (
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"unsafe"
)

func nativeString(value string, call func(*C.char)) {
	c := C.CString(value)
	defer C.free(unsafe.Pointer(c))
	call(c)
}

func main() {
	runtime.LockOSThread()
	executable, err := os.Executable()
	if err != nil {
		panic(err)
	}
	resources := filepath.Join(filepath.Dir(executable), "../Resources")
	data := os.Getenv("JH_DESKTOP_DATA_DIR")
	if data == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			panic(err)
		}
		data = filepath.Join(home, "Library/Application Support/ununemploy")
	}
	supervisor, err := newSupervisor(resources, data)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		go nativeString(err.Error(), func(c *C.char) { C.nativeFailure(c) })
		C.nativeRun()
		return
	}
	if supervisor == nil {
		return
	} // Existing instance has been brought forward.
	defer supervisor.close()
	supervisor.mu.Lock()
	supervisor.show = func() { C.nativeShow() }
	supervisor.mu.Unlock()
	stopping := make(chan os.Signal, 1)
	signal.Notify(stopping, syscall.SIGTERM, syscall.SIGINT)
	defer signal.Stop(stopping)
	go func() { <-stopping; C.nativeQuit() }()
	go func() {
		url, err := supervisor.start()
		if err == nil {
			nativeString(url, func(c *C.char) { C.nativeLoad(c) })
			err = supervisor.wait()
		}
		if err != nil {
			nativeString(err.Error(), func(c *C.char) { C.nativeFailure(c) })
		}
	}()
	C.nativeRun()
}
