package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"
	"unsafe"

	"github.com/wailsapp/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

// A short-lived, invisible WebView2 with its own empty profile. Only the fixed
// print operation is available; no debug port, application cookies or bridge.
// The service supplies rendered HTML in a fresh private temporary directory.
func printPDF(directory string) error {
	html, err := os.ReadFile(filepath.Join(directory, "input.html"))
	if err != nil {
		return err
	}
	if len(html) > 1800000 {
		return fmt.Errorf("Document is too large to print")
	}
	class := winClass{Proc: windows.NewCallback(windowProc), Name: utf16("ununemploy-print")}
	class.Size = uint32(unsafe.Sizeof(class))
	if atom, _, err := user32.NewProc("RegisterClassExW").Call(uintptr(unsafe.Pointer(&class))); atom == 0 {
		return err
	}
	hwnd, _, err := user32.NewProc("CreateWindowExW").Call(0, uintptr(unsafe.Pointer(class.Name)), 0, 0, 0, 0, 1000, 1000, 0, 0, 0, 0)
	if hwnd == 0 {
		return err
	}
	w := &nativeWindow{hwnd: hwnd, tasks: make(chan func(), 16), closed: make(chan struct{})}
	native = w
	defer func() { close(w.closed); native = nil }()
	browser := edge.NewChromium()
	browser.DataPath = filepath.Join(directory, "webview2")
	browser.AdditionalBrowserArgs = []string{"--disable-background-networking", "--disable-component-update", "--no-first-run"}
	browser.SetGlobalPermission(edge.CoreWebView2PermissionStateDeny)
	if !browser.Embed(hwnd) {
		return fmt.Errorf("WebView2 could not start PDF export")
	}
	w.browser = browser
	defer func() {
		browser.ShuttingDown()
		controller := (*webObject)(unsafe.Pointer(browser.GetController()))
		controller.vtable[24].Call(uintptr(unsafe.Pointer(controller)))
		runtime.KeepAlive(w.handlers)
	}()
	web, err := browser.GetController().GetCoreWebView2()
	if err != nil {
		return err
	}
	w.web = (*webObject)(unsafe.Pointer(web))
	defer web.Release()
	settings, err := browser.GetSettings()
	if err != nil {
		return err
	}
	for _, err := range []error{settings.PutIsScriptEnabled(false), settings.PutAreHostObjectsAllowed(false), settings.PutIsWebMessageEnabled(false), settings.PutAreDevToolsEnabled(false)} {
		if err != nil {
			return err
		}
	}
	response, err := browser.Environment().CreateWebResourceResponse([]byte{}, 403, "Blocked", "Content-Type: text/plain")
	if err != nil {
		return err
	}
	defer response.Release()
	browser.WebResourceRequestedCallback = func(_ *edge.ICoreWebView2WebResourceRequest, args *edge.ICoreWebView2WebResourceRequestedEventArgs) {
		_ = args.PutResponse(response)
	}
	browser.AddWebResourceRequestedFilter("*", edge.COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL)
	// Block all navigation except the initial in-memory document, including
	// file URLs, refreshes, frames and popups; never open an external browser.
	initialNavigation := true
	inputURL := "data:text/html;charset=utf-8;base64," + base64.StdEncoding.EncodeToString(html)
	for _, index := range []int{7, 17} {
		frame := index == 17
		handler := newCOMHandler(iidNavigation, func(_ uintptr, args uintptr) uintptr {
			uri, err := comString(args, 3)
			if err != nil || frame || !initialNavigation || (uri != "about:blank" && uri != inputURL) {
				(*webObject)(unsafe.Pointer(args)).vtable[8].Call(args, 1)
			} else {
				initialNavigation = false
			}
			return 0
		})
		w.handlers = append(w.handlers, handler)
		var token int64
		hr, _, _ := w.web.vtable[index].Call(uintptr(unsafe.Pointer(w.web)), uintptr(unsafe.Pointer(handler)), uintptr(unsafe.Pointer(&token)))
		if int32(hr) < 0 {
			return fmt.Errorf("Could not restrict PDF navigation: %x", hr)
		}
	}
	popup := newCOMHandler(iidNewWindow, func(_ uintptr, args uintptr) uintptr {
		(*webObject)(unsafe.Pointer(args)).vtable[6].Call(args, 1)
		return 0
	})
	w.handlers = append(w.handlers, popup)
	var popupToken int64
	if hr, _, _ := w.web.vtable[44].Call(uintptr(unsafe.Pointer(w.web)), uintptr(unsafe.Pointer(popup)), uintptr(unsafe.Pointer(&popupToken))); int32(hr) < 0 {
		return fmt.Errorf("Could not restrict PDF popups: %x", hr)
	}
	var result error
	finished := false
	finish := func(err error) {
		if !finished {
			finished = true
			result = err
			user32.NewProc("DestroyWindow").Call(hwnd)
		}
	}
	timer := time.AfterFunc(40*time.Second, func() { w.dispatch(func() { finish(fmt.Errorf("PDF export timed out")) }) })
	defer timer.Stop()
	started := false
	browser.NavigationCompletedCallback = func(_ *edge.ICoreWebView2, args *edge.ICoreWebView2NavigationCompletedEventArgs) {
		if started || finished {
			return
		}
		started = true
		if !comBool(uintptr(unsafe.Pointer(args)), 3) {
			finish(fmt.Errorf("Could not load PDF document"))
			return
		}
		handler := newCOMHandler(mustGUID("{5c4889f0-5ef6-4c5a-952c-d8f1b92d0574}"), func(status, output uintptr) uintptr {
			if int32(status) < 0 || output == 0 {
				finish(fmt.Errorf("PDF printing failed: %x", status))
				return 0
			}
			var reply struct {
				Data string `json:"data"`
			}
			err := json.Unmarshal([]byte(windows.UTF16PtrToString((*uint16)(unsafe.Pointer(output)))), &reply)
			if err == nil {
				var pdf []byte
				pdf, err = base64.StdEncoding.DecodeString(reply.Data)
				if err == nil && (len(pdf) < 5 || string(pdf[:5]) != "%PDF-") {
					err = fmt.Errorf("PDF printing returned no document")
				}
				if err == nil {
					err = os.WriteFile(filepath.Join(directory, "output.pdf"), pdf, 0600)
				}
			}
			finish(err)
			return 0
		})
		w.handlers = append(w.handlers, handler)
		params := `{"printBackground":true,"paperWidth":8.2677165354,"paperHeight":11.692913386,"marginTop":0,"marginBottom":0,"marginLeft":0,"marginRight":0,"preferCSSPageSize":true,"generateTaggedPDF":true}`
		hr, _, _ := w.web.vtable[36].Call(uintptr(unsafe.Pointer(w.web)), uintptr(unsafe.Pointer(utf16("Page.printToPDF"))), uintptr(unsafe.Pointer(utf16(params))), uintptr(unsafe.Pointer(handler)))
		if int32(hr) < 0 {
			finish(fmt.Errorf("Could not start PDF printing: %x", hr))
		}
	}
	// NavigateToString exposes its initial in-memory HTML as an exact data URL
	// in NavigationStarting on current Evergreen builds.
	hr, _, _ := w.web.vtable[6].Call(uintptr(unsafe.Pointer(w.web)), uintptr(unsafe.Pointer(utf16(string(html)))))
	if int32(hr) < 0 {
		return fmt.Errorf("Could not load PDF markup: %x", hr)
	}
	browser.Resize()
	var message winMessage
	for {
		code, _, err := user32.NewProc("GetMessageW").Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0)
		if int32(code) == -1 {
			return err
		}
		if code == 0 {
			break
		}
		user32.NewProc("TranslateMessage").Call(uintptr(unsafe.Pointer(&message)))
		user32.NewProc("DispatchMessageW").Call(uintptr(unsafe.Pointer(&message)))
	}
	return result
}
