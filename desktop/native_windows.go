package main

import (
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"unsafe"

	"github.com/wailsapp/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

var user32 = windows.NewLazySystemDLL("user32.dll")
var shell32 = windows.NewLazySystemDLL("shell32.dll")
var ole32 = windows.NewLazySystemDLL("ole32.dll")
var native *nativeWindow

const wmDispatch = 0x8001
const commandQuit = 1001

type winClass struct {
	Size, Style                        uint32
	Proc                               uintptr
	ClassExtra, WindowExtra            int32
	Instance, Icon, Cursor, Background uintptr
	Menu, Name                         *uint16
	SmallIcon                          uintptr
}
type winMessage struct {
	Window         uintptr
	Message        uint32
	WParam, LParam uintptr
	Time           uint32
	X, Y           int32
	Private        uint32
}
type nativeWindow struct {
	hwnd         uintptr
	browser      *edge.Chromium
	web          *webObject
	origin       string
	tasks        chan func()
	handlers     []*comHandler
	checkingQuit bool
	closed       chan struct{}
	closeOnce    sync.Once
}

func utf16(value string) *uint16 { return windows.StringToUTF16Ptr(value) }
func nativeError(message string) {
	log.Print(message)
	user32.NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(utf16(message))), uintptr(unsafe.Pointer(utf16("ununemploy could not keep running"))), 0x10)
}
func (w *nativeWindow) dispatch(fn func()) {
	select {
	case <-w.closed:
		return
	case w.tasks <- fn:
	}
	user32.NewProc("PostMessageW").Call(w.hwnd, wmDispatch, 0, 0)
}
func (w *nativeWindow) show() {
	user32.NewProc("ShowWindow").Call(w.hwnd, 9)
	user32.NewProc("SetForegroundWindow").Call(w.hwnd)
}
func (w *nativeWindow) requestQuit() {
	if w.checkingQuit {
		return
	}
	w.checkingQuit = true
	handler := newCOMHandler(iidScriptCompleted, func(status uintptr, result uintptr) uintptr {
		w.checkingQuit = false
		if int32(status) < 0 || result == 0 {
			nativeError("Could not check unsaved changes. Please save your work and retry Quit.")
			return 0
		}
		dirty := windows.UTF16PtrToString((*uint16)(unsafe.Pointer(result))) == "true"
		if dirty {
			choice, _, _ := user32.NewProc("MessageBoxW").Call(w.hwnd, uintptr(unsafe.Pointer(utf16("Your unsaved document edits will be lost. Quit without saving?"))), uintptr(unsafe.Pointer(utf16("ununemploy"))), 0x31|0x100)
			if choice != 1 {
				return 0
			}
		}
		user32.NewProc("DestroyWindow").Call(w.hwnd)
		return 0
	})
	w.handlers = append(w.handlers, handler)
	script := "(() => { const e = new Event('beforeunload', {cancelable:true}); window.dispatchEvent(e); return e.defaultPrevented; })()"
	hr, _, _ := w.web.vtable[29].Call(uintptr(unsafe.Pointer(w.web)), uintptr(unsafe.Pointer(utf16(script))), uintptr(unsafe.Pointer(handler)))
	if int32(hr) < 0 {
		w.checkingQuit = false
		nativeError("Could not check unsaved changes. Please save your work and retry Quit.")
	}
}
func windowProc(hwnd uintptr, msg uint32, wp, lp uintptr) uintptr {
	w := native
	if w != nil {
		switch msg {
		case 0x10:
			user32.NewProc("ShowWindow").Call(hwnd, 0)
			return 0 // Close keeps services running.
		case 0x2:
			user32.NewProc("PostQuitMessage").Call(0)
			return 0
		case 0x5:
			if w.browser != nil {
				w.browser.Resize()
			}
			return 0
		case 0x7:
			if w.browser != nil {
				w.browser.Focus()
			}
			return 0
		case 0x3:
			if w.browser != nil {
				_ = w.browser.NotifyParentWindowPositionChanged()
			}
		case 0x111:
			if wp&0xffff == commandQuit {
				w.requestQuit()
				return 0
			}
		case wmDispatch:
			for {
				select {
				case fn := <-w.tasks:
					fn()
				default:
					return 0
				}
			}
		}
	}
	result, _, _ := user32.NewProc("DefWindowProcW").Call(hwnd, uintptr(msg), wp, lp)
	return result
}

func runNativeWindow(s *supervisor, origin string) error {
	// COM and all window/webview calls stay on the main OS thread.
	hr, _, _ := ole32.NewProc("CoInitializeEx").Call(0, 2)
	if int32(hr) < 0 {
		return fmt.Errorf("Could not initialize Windows COM: %x", hr)
	}
	defer ole32.NewProc("CoUninitialize").Call()
	user32.NewProc("SetProcessDpiAwarenessContext").Call(^uintptr(3))
	instance, _, err := windows.NewLazySystemDLL("kernel32.dll").NewProc("GetModuleHandleW").Call(0)
	if instance == 0 {
		return err
	}
	cursor, _, _ := user32.NewProc("LoadCursorW").Call(0, 32512)
	class := winClass{Proc: windows.NewCallback(windowProc), Instance: uintptr(instance), Cursor: cursor, Name: utf16("ununemploy-window")}
	class.Size = uint32(unsafe.Sizeof(class))
	atom, _, err := user32.NewProc("RegisterClassExW").Call(uintptr(unsafe.Pointer(&class)))
	if atom == 0 {
		return err
	}
	menu, _, _ := user32.NewProc("CreateMenu").Call()
	file, _, _ := user32.NewProc("CreatePopupMenu").Call()
	user32.NewProc("AppendMenuW").Call(file, 0, commandQuit, uintptr(unsafe.Pointer(utf16("Quit ununemploy"))))
	user32.NewProc("AppendMenuW").Call(menu, 0x10, file, uintptr(unsafe.Pointer(utf16("File"))))
	w := &nativeWindow{origin: origin, tasks: make(chan func(), 16), closed: make(chan struct{})}
	native = w
	defer func() {
		s.mu.Lock()
		s.show, s.quit = nil, nil
		s.mu.Unlock()
		w.closeOnce.Do(func() { close(w.closed) })
		native = nil
	}()
	hwnd, _, err := user32.NewProc("CreateWindowExW").Call(0, uintptr(unsafe.Pointer(class.Name)), uintptr(unsafe.Pointer(utf16("ununemploy"))), 0x00cf0000, 0x80000000, 0x80000000, 1400, 900, 0, menu, uintptr(instance), 0)
	if hwnd == 0 {
		return err
	}
	w.hwnd = hwnd
	chromium := edge.NewChromium()
	chromium.DataPath = filepath.Join(s.data, "webview2")
	// Opt-in local verification only; ordinary launches expose no debugging port.
	if port, err := strconv.Atoi(os.Getenv("JH_DESKTOP_DEBUG_PORT")); err == nil && port > 1024 && port < 65536 && os.Getenv("JH_DESKTOP_DATA_DIR") != "" {
		chromium.AdditionalBrowserArgs = []string{fmt.Sprintf("--remote-debugging-port=%d", port), "--remote-debugging-address=127.0.0.1"}
	}
	chromium.SetGlobalPermission(edge.CoreWebView2PermissionStateDeny)
	chromium.SetPermission(edge.CoreWebView2PermissionKindClipboardRead, edge.CoreWebView2PermissionStateAllow)
	if !chromium.Embed(hwnd) {
		user32.NewProc("DestroyWindow").Call(hwnd)
		return fmt.Errorf("Microsoft Edge WebView2 Runtime is required. Install it, then reopen ununemploy.")
	}
	w.browser = chromium
	defer func() {
		chromium.ShuttingDown()
		controller := chromium.GetController()
		obj := (*webObject)(unsafe.Pointer(controller))
		obj.vtable[24].Call(uintptr(unsafe.Pointer(obj)))
	}()
	raw, err := chromium.GetController().GetCoreWebView2()
	if err != nil {
		return err
	}
	w.web = (*webObject)(unsafe.Pointer(raw))
	defer w.web.vtable[2].Call(uintptr(unsafe.Pointer(w.web)))
	if err := w.installNavigationPolicy(); err != nil {
		return err
	}
	if err := w.installDownloads(); err != nil {
		return err
	}
	settings, err := chromium.GetSettings()
	if err != nil {
		return err
	}
	_ = settings.PutAreDevToolsEnabled(false)
	_ = settings.PutAreHostObjectsAllowed(false)
	_ = settings.PutIsWebMessageEnabled(false)
	_ = chromium.PutIsGeneralAutofillEnabled(false)
	_ = chromium.PutIsPasswordAutosaveEnabled(false)
	chromium.Navigate(origin)
	chromium.Resize()
	if err := chromium.Show(); err != nil {
		return err
	}
	s.mu.Lock()
	s.show = func() { w.dispatch(w.show) }
	s.quit = func() { w.dispatch(w.requestQuit) }
	s.mu.Unlock()
	go func() {
		if err := s.wait(); err != nil {
			w.dispatch(func() { nativeError(err.Error()); user32.NewProc("DestroyWindow").Call(hwnd) })
		}
	}()
	w.show()
	var message winMessage
	for {
		result, _, err := user32.NewProc("GetMessageW").Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0)
		if int32(result) == -1 {
			return err
		}
		if result == 0 {
			break
		}
		user32.NewProc("TranslateMessage").Call(uintptr(unsafe.Pointer(&message)))
		user32.NewProc("DispatchMessageW").Call(uintptr(unsafe.Pointer(&message)))
	}
	runtime.KeepAlive(w.handlers)
	return nil
}

// The binding's generated string getters pass an incorrect output pointer.
// These small ABI adapters use the documented ICoreWebView2 COM vtable directly.
type webObject struct{ vtable *[128]edge.ComProc }
type comHandler struct {
	vtable *[4]uintptr
	iid    windows.GUID
	invoke func(uintptr, uintptr) uintptr
}

// IDs from the Microsoft WebView2 SDK. Keep handlers pinned in nativeWindow
// until the controller closes; COM must not see Go objects collected early.
var iidUnknown = windows.GUID{Data4: [8]byte{0xc0, 0, 0, 0, 0, 0, 0, 0x46}}
var iidNavigation = mustGUID("{9adbe429-f36d-432b-9ddc-f8881fbd76e3}")
var iidNewWindow = mustGUID("{d4c185fe-c81c-4989-97af-2d3fa7ab5651}")
var iidScriptCompleted = mustGUID("{49511172-cc67-4bca-9923-137112f4c4cc}")

func mustGUID(value string) windows.GUID {
	id, err := windows.GUIDFromString(value)
	if err != nil {
		panic(err)
	}
	return id
}

var handlerVTable = [4]uintptr{
	windows.NewCallback(func(this, iid, out uintptr) uintptr {
		if out == 0 {
			return 0x80004003
		}
		*(*uintptr)(unsafe.Pointer(out)) = 0
		if iid == 0 {
			return 0x80004003
		}
		requested := *(*windows.GUID)(unsafe.Pointer(iid))
		if requested != iidUnknown && requested != (*comHandler)(unsafe.Pointer(this)).iid {
			return 0x80004002 // E_NOINTERFACE
		}
		*(*uintptr)(unsafe.Pointer(out)) = this
		return 0
	}),
	windows.NewCallback(func(uintptr) uintptr { return 1 }),
	windows.NewCallback(func(uintptr) uintptr { return 1 }),
	windows.NewCallback(func(this, a, b uintptr) uintptr { return (*comHandler)(unsafe.Pointer(this)).invoke(a, b) }),
}

func newCOMHandler(iid windows.GUID, fn func(uintptr, uintptr) uintptr) *comHandler {
	return &comHandler{vtable: &handlerVTable, iid: iid, invoke: fn}
}
func comString(object uintptr, index int) (string, error) {
	obj := (*webObject)(unsafe.Pointer(object))
	var result *uint16
	hr, _, _ := obj.vtable[index].Call(object, uintptr(unsafe.Pointer(&result)))
	if int32(hr) < 0 {
		return "", fmt.Errorf("WebView2 string lookup failed: %x", hr)
	}
	defer windows.CoTaskMemFree(unsafe.Pointer(result))
	return windows.UTF16PtrToString(result), nil
}
func comBool(object uintptr, index int) bool {
	obj := (*webObject)(unsafe.Pointer(object))
	var result int32
	hr, _, _ := obj.vtable[index].Call(object, uintptr(unsafe.Pointer(&result)))
	return int32(hr) >= 0 && result != 0
}
func sameOrigin(raw, origin string) bool {
	parsed, err := url.Parse(raw)
	base, e := url.Parse(origin)
	return err == nil && e == nil && parsed.User == nil && parsed.Scheme == base.Scheme && parsed.Host == base.Host
}
func allowedFrame(raw, origin string) bool {
	return sameOrigin(raw, origin) || raw == "about:blank" || strings.HasPrefix(raw, "data:") || strings.HasPrefix(raw, "blob:"+origin+"/")
}
func openExternal(raw string) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.User != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return
	}
	shell32.NewProc("ShellExecuteW").Call(0, uintptr(unsafe.Pointer(utf16("open"))), uintptr(unsafe.Pointer(utf16(raw))), 0, 0, 1)
}
func (w *nativeWindow) installNavigationPolicy() error {
	add := func(index int, iid windows.GUID, fn func(uintptr, uintptr) uintptr) error {
		handler := newCOMHandler(iid, fn)
		w.handlers = append(w.handlers, handler)
		var token int64
		hr, _, _ := w.web.vtable[index].Call(uintptr(unsafe.Pointer(w.web)), uintptr(unsafe.Pointer(handler)), uintptr(unsafe.Pointer(&token)))
		if int32(hr) < 0 {
			return fmt.Errorf("Could not restrict WebView2 navigation: %x", hr)
		}
		return nil
	}
	if err := add(7, iidNavigation, func(_ uintptr, args uintptr) uintptr {
		raw, err := comString(args, 3)
		if err != nil || (!sameOrigin(raw, w.origin) && !stringsHasLocalBlob(raw, w.origin)) {
			obj := (*webObject)(unsafe.Pointer(args))
			obj.vtable[8].Call(args, 1)
			if err == nil && comBool(args, 4) && !comBool(args, 5) {
				openExternal(raw)
			}
		}
		return 0
	}); err != nil {
		return err
	}
	if err := add(17, iidNavigation, func(_ uintptr, args uintptr) uintptr {
		raw, err := comString(args, 3)
		if err != nil || !allowedFrame(raw, w.origin) {
			obj := (*webObject)(unsafe.Pointer(args))
			obj.vtable[8].Call(args, 1)
		}
		return 0
	}); err != nil {
		return err
	}
	return add(44, iidNewWindow, func(_ uintptr, args uintptr) uintptr {
		obj := (*webObject)(unsafe.Pointer(args))
		obj.vtable[6].Call(args, 1) // Handled: never embed remote windows.
		if raw, err := comString(args, 3); err == nil && comBool(args, 8) {
			openExternal(raw)
		}
		return 0
	})
}
