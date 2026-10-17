---
title: Windows and Linux desktop assessment — 16 October 2026
section: Journal
updated: 2026-10-17
---
# Windows and Linux desktop assessment — 16 October 2026

The user asked how difficult Windows and Linux native releases would be, then requested that the assessment be documented. The initial assessment records proposed scope rather than a release commitment. On 17 October the user requested a committed handoff and said they would continue the Windows port on a Windows machine; see the dated handoff below. No port is implemented by this documentation change. The [native desktop specification](../features/desktop.md) remains authoritative for implemented behavior.

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

## Windows handoff — 17 October 2026

The user intends to continue Windows porting on a Windows machine. Source was rechecked at clean revision `8ca152b`; the portability constraints above remain present. This handoff adds no runtime changes and makes no Windows compatibility claim.

Suggested first target: **Windows 11 x64**, retaining the React UI, Node backend and Go launcher with platform-specific implementations. This is a recommendation, not a confirmed support matrix. Confirm the development machine's architecture before selecting bundled binaries. A Windows build environment and an interactive Windows machine or VM are needed; a successful cross-compile alone would not verify installation or native workflows.

### Implementation order

1. **Separate portable supervision from OS-specific operations.** Start with `desktop/supervisor.go`, `desktop/main_darwin.go` and `scripts/desktop-service.ts`. Supply Windows single-instance locking, startup communication and graceful shutdown. Replace the inherited file descriptor 3 mechanism for Windows. Investigate Windows [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) for owned process-tree cleanup on Quit/crash; they manage groups of processes and support termination when the last job handle closes. They are not a substitute for compiler filesystem/network isolation. Preserve the working macOS implementation and lifecycle contract.
2. **Add the Windows window and local persistence.** Implement a WebView2 host, native window controls, dialogs, external links and downloads. Retain the domain UI without macOS traffic-light spacing. Use a Windows user-local appdata directory outside the installation. Preserve single-instance activation, port-conflict handling and the distinction between closing the window and explicit Quit. Account for the WebView2 Runtime using [Microsoft's deployment guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution).
3. **Reach the first milestone.** A Windows executable opens the existing UI, starts the local API/worker, saves fixture records across restarts and stops its owned processes reliably. Use isolated synthetic appdata; do not point initial porting tests at personal records.
4. **Integrate the bundled runtimes.** Adapt `scripts/build-desktop.ts`, runtime environment construction and executable paths for Windows Node, official Codex, Tectonic and Chromium. Verify fresh authentication and subscription/model availability through the existing runtime contract. Keep authentication out of release artifacts and preserve serialization and visible failures.
5. **Complete document generation.** Extend `core/latex/setup.ts`, `core/latex/runtime.ts` and `core/latex/compile.ts` for Windows compiler installation and isolation. Windows LaTeX isolation is the largest unresolved technical risk. Verify actual CV compilation, previews, cover-letter PDFs, cancellation and cleanup before calling the port feature-complete.
6. **Package and verify distribution.** Choose an installer and signing approach, build with the correct Windows runtimes and test on a clean Windows environment. Run the release scenarios above, including backup/restore and updates that preserve data. Record Windows outcomes in a new verification run rather than extending the macOS passing claim.

The existing `npm run desktop:build` is macOS-only and `npm run desktop:test` includes Unix-specific code. These are porting targets, not working Windows setup commands. The current project requires Node 22.19 or newer and its desktop Go module declares Go 1.24; verify the chosen Windows webview binding's additional build requirements after selecting it.

### Estimate and remaining choices

The Windows-specific estimate discussed on 17 October is approximately **one week for a working prototype and 2–3 weeks total for a dependable Windows release**, assuming access to the target environment and no major compiler-isolation or bundled-runtime obstacles. This refines the Windows scope of the earlier combined Windows/Linux estimate; neither is a measured schedule or commitment.

Still to resolve during implementation: confirmed Windows versions/architectures, webview binding, installer/signing method, compiler isolation approach and clean-machine test coverage. Linux remains an assessed future option; it is not part of this Windows handoff. Keep the existing local-only, private-drafting and no-submission boundaries throughout the port.
