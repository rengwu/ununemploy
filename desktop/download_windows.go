package main

import (
	"fmt"
	"log"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

type openFilename struct {
	Size                         uint32
	Owner, Instance              uintptr
	Filter, CustomFilter         *uint16
	MaxCustomFilter, FilterIndex uint32
	File                         *uint16
	MaxFile                      uint32
	FileTitle                    *uint16
	MaxFileTitle                 uint32
	InitialDirectory, Title      *uint16
	Flags                        uint32
	FileOffset, ExtensionOffset  uint16
	DefaultExtension             *uint16
	CustomData, Hook             uintptr
	Template                     *uint16
	Reserved                     uintptr
	Reserved2, FlagsEx           uint32
}

func (w *nativeWindow) installDownloads() error {
	iid := mustGUID("{20d02d59-6df2-42dc-bd06-f98a694b1302}")
	var web4 *webObject
	hr, _, _ := w.web.vtable[0].Call(uintptr(unsafe.Pointer(w.web)), uintptr(unsafe.Pointer(&iid)), uintptr(unsafe.Pointer(&web4)))
	if int32(hr) < 0 {
		return fmt.Errorf("Please update the Microsoft Edge WebView2 Runtime to enable downloads")
	}
	defer web4.vtable[2].Call(uintptr(unsafe.Pointer(web4)))
	handler := newCOMHandler(mustGUID("{efedc989-c396-41ca-83f7-07f845a55724}"), func(_ uintptr, args uintptr) uintptr {
		obj := (*webObject)(unsafe.Pointer(args))
		cancel := func() uintptr { obj.vtable[5].Call(args, 1); return 0 }
		obj.vtable[9].Call(args, 1) // We own the Save As UI.
		var operation *webObject
		hr, _, _ := obj.vtable[3].Call(args, uintptr(unsafe.Pointer(&operation)))
		if int32(hr) < 0 || operation == nil {
			log.Printf("Download operation unavailable: %x", hr)
			return cancel()
		}
		uri, err := comString(uintptr(unsafe.Pointer(operation)), 9)
		if w.debug {
			w.traceDownload(operation)
		}
		operation.vtable[2].Call(uintptr(unsafe.Pointer(operation)))
		if err != nil || (!sameOrigin(uri, w.origin) && !stringsHasLocalBlob(uri, w.origin)) {
			log.Print("Download origin rejected")
			return cancel()
		}
		filename, err := comString(args, 6)
		if err != nil {
			return cancel()
		}
		var deferral *webObject
		hr, _, _ = obj.vtable[10].Call(args, uintptr(unsafe.Pointer(&deferral)))
		if int32(hr) < 0 || deferral == nil {
			log.Printf("Download deferral unavailable: %x", hr)
			return cancel()
		}
		obj.vtable[1].Call(args)
		// Exit the COM event before opening a modal dialog (WebView2 reentrancy).
		w.dispatch(func() {
			defer obj.vtable[2].Call(args)
			defer deferral.vtable[2].Call(uintptr(unsafe.Pointer(deferral)))
			defer func() {
				hr, _, _ := deferral.vtable[3].Call(uintptr(unsafe.Pointer(deferral)))
				if w.debug {
					log.Printf("Download deferral completed: %x", hr)
				}
			}()
			buffer := make([]uint16, 32768)
			name, _ := windows.UTF16FromString(filepath.Base(filename))
			copy(buffer, name)
			dialog := openFilename{Owner: w.hwnd, File: &buffer[0], MaxFile: uint32(len(buffer)), Title: utf16("Save As"), Flags: 0x2 | 0x8 | 0x800 | 0x80000}
			dialog.Size = uint32(unsafe.Sizeof(dialog))
			ok, _, _ := windows.NewLazySystemDLL("comdlg32.dll").NewProc("GetSaveFileNameW").Call(uintptr(unsafe.Pointer(&dialog)))
			if ok == 0 {
				cancel()
				code, _, _ := windows.NewLazySystemDLL("comdlg32.dll").NewProc("CommDlgExtendedError").Call()
				if code != 0 {
					nativeError(fmt.Sprintf("Could not open Save As (%x). Please retry the download.", code))
				}
			}
			if ok != 0 {
				hr, _, _ := obj.vtable[7].Call(args, uintptr(unsafe.Pointer(&buffer[0])))
				if w.debug {
					log.Printf("Download destination: %q; result: %x", windows.UTF16ToString(buffer), hr)
				}
				if int32(hr) >= 0 {
					obj.vtable[5].Call(args, 0)
				} else {
					cancel()
				}
			}
		})
		return 0
	})
	w.handlers = append(w.handlers, handler)
	var token int64
	hr, _, _ = web4.vtable[75].Call(uintptr(unsafe.Pointer(web4)), uintptr(unsafe.Pointer(handler)), uintptr(unsafe.Pointer(&token)))
	if int32(hr) < 0 {
		return fmt.Errorf("Could not install native Save As: %x", hr)
	}
	return nil
}

// Enabled only with the isolated native verification endpoint. Ordinary
// launches do not log document paths or retain diagnostic download handlers.
func (w *nativeWindow) traceDownload(operation *webObject) {
	handler := newCOMHandler(mustGUID("{81336594-7ede-4ba9-bf71-acf0a95b58dd}"), func(sender, _ uintptr) uintptr {
		obj := (*webObject)(unsafe.Pointer(sender))
		var state, reason int32
		obj.vtable[16].Call(sender, uintptr(unsafe.Pointer(&state)))
		obj.vtable[17].Call(sender, uintptr(unsafe.Pointer(&reason)))
		path, _ := comString(sender, 15)
		log.Printf("Download state: %d; interrupt: %d; path: %q", state, reason, path)
		return 0
	})
	w.handlers = append(w.handlers, handler)
	var token int64
	hr, _, _ := operation.vtable[7].Call(uintptr(unsafe.Pointer(operation)), uintptr(unsafe.Pointer(handler)), uintptr(unsafe.Pointer(&token)))
	if int32(hr) < 0 {
		log.Printf("Download diagnostics unavailable: %x", hr)
	}
}

func stringsHasLocalBlob(raw, origin string) bool {
	return len(raw) > 5 && raw[:5] == "blob:" && sameOrigin(raw[5:], origin)
}
