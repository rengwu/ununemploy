---
title: Windows and Linux desktop assessment — 16 October 2026
section: Journal
updated: 2026-10-16
---
# Windows and Linux desktop assessment — 16 October 2026

The user asked how difficult Windows and Linux native releases would be, then requested that the assessment be documented. This is a feasibility assessment and proposed scope, not authorization to implement the ports or a release commitment. The [native desktop specification](../features/desktop.md) remains authoritative for implemented behavior.

## Assessment

Both ports are feasible. Most React UI and Node backend code can remain shared, but the current macOS package cannot be turned into Windows/Linux releases by changing a compiler target alone.

| Target | Relative difficulty | Main work |
| --- | --- | --- |
| Linux | Moderate | Native window and dialogs, platform data paths, desktop packaging, runtime dependencies and compilation isolation. |
| Windows | Higher | The same work, plus replacements for Unix process management, file locking and inherited-socket startup; Windows LaTeX setup and isolation. |

## Observed repository constraints

Source inspection on 16 October found:

- `desktop/main_darwin.go` and `desktop/native_darwin.m` implement the window through Cocoa/WKWebView. There are no Windows or Linux window implementations. Native dialogs, external links, window controls and lifecycle behavior need platform equivalents.
- `desktop/supervisor.go` uses Unix file locking, process groups/signals and an inherited listening socket. `scripts/desktop-service.ts` listens on file descriptor 3 and uses process-group termination. Windows needs a different implementation of these contracts, including reliable descendant cleanup after Quit or a crash.
- `scripts/build-desktop.ts` explicitly rejects platforms other than macOS and builds an `.app` bundle. Node, Codex, Tectonic and Chromium payloads, executable paths, installers and signing/distribution steps must be selected per platform and architecture.
- `core/latex/setup.ts` already describes macOS and Linux arm64/x64 compiler releases, but rejects Windows. `core/latex/compile.ts` has macOS and Linux isolation paths. Linux desktop packaging still needs to supply and verify its isolation helper; Windows compilation support needs implementation rather than bypassing isolation.
- Native appdata currently defaults to the macOS Application Support directory. Ports need platform-appropriate locations while preserving records outside the installed application.

No Windows or Linux native build or runtime verification was performed for this assessment. Existing Linux server/container support does not establish Linux desktop support.

## Proposed lean approach

Keep the shared frontend and backend. Introduce a small platform layer around the native shell, service lifecycle and packaging. Initially target Windows x64 and one explicitly selected Linux distribution/package format; broader distribution and architecture coverage can follow demonstrated demand. No framework or Linux package format has been selected.

A small shared webview library is one option: the upstream [webview project](https://github.com/webview/webview) documents Windows WebView2 and Linux GTK/WebKitGTK backends. Windows packaging must account for the WebView2 Runtime; [Microsoft's distribution guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution) describes the supported deployment choices. These are candidate building blocks, not adopted dependencies.

## Effort and release checks

Rough engineering estimates, assuming access to appropriate build and test machines:

- Linux prototype: several days.
- Windows prototype: roughly one week.
- Dependable releases for both: approximately 2–4 weeks total, including packaging and platform verification.

These are planning estimates from source inspection, not measured delivery times. Installer/signing requirements, Linux dependency coverage and Windows compilation isolation may change them.

Before claiming release support, verify on each target: clean-machine installation and first launch, Codex authentication, profile/job persistence, CV compilation and PDF preview/download, cover letters, backup/restore, application replacement, single-instance behavior, close-versus-Quit behavior and process cleanup after crashes. Build each package with the correct platform runtimes and ensure it contains no personal data or credentials. Record actual results in separate verification runs.

Follow-up: select the initial Windows/Linux versions, architecture, Linux package format and testing environments if implementation is requested. Track this in [open follow-up](../discussions/open-questions.md).
