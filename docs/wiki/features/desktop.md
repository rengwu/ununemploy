---
title: Native desktop app
section: Features
updated: 2026-10-18
---
# Native desktop app

Feature ID: `FEAT-desktop`

## Intent and basis

Open ununemploy as a native macOS or Windows app without starting a development server. The user requested a Go webview wrapper on 7 October 2026 and selected **keep running until Quit**. Windows implementation was authorized and resumed on 17 October. [Accepted decision](../decisions/index.md), [macOS journal](../journal/2026-10-07-desktop.md), and [Windows journal](../journal/2026-10-17-windows-port.md).

## Entry points and prerequisites

The macOS contract follows below; [Windows](#windows-11-x64) uses platform-specific window, lifecycle, compiler isolation and installation behavior.

Open `~/Applications/ununemploy.app` from Finder or Spotlight. Closing the window keeps the app and worker running; opening the app again brings back its window. **ununemploy → Quit ununemploy** or Command-Q stops the API, worker and descendant processes. Unsaved document edits show a Cancel / Quit Without Saving dialog.

The currently built package targets this Mac's Apple silicon architecture. It includes Node, production server dependencies, the React frontend, the official Codex executable, portable Tectonic with generic packages, and Playwright's headless Chromium for HTML PDF exports. Go uses Cocoa/WKWebView through a small cgo adapter. It does not rewrite the backend in Go. macOS 13 is the declared wrapper deployment target; other OS releases and Intel packaging need separate testing. No app login or cloud service is added.

Codex uses its own existing ChatGPT authentication; an unavailable sign-in, model or subscription allowance remains visible through the existing runtime state. Provider credentials and configured budgets remain prerequisites for their collectors.

## Expected outcomes

- The launcher reserves a loopback socket, starts the API and its separate worker, and loads the native window after health succeeds. A persisted port is preferred, with an available port selected on conflict.
- One desktop instance owns each data directory. A second launch activates the first instance. Quit terminates the owned process group; unexpected parent termination closes a pipe that shuts down the services. Startup/runtime failure shows a native error with the local diagnostic log path.
- Default appdata is `~/Library/Application Support/ununemploy`. The installer imports the former SQLite database with the backup API, verifies integrity, retains private assets/credentials locally, and preserves the original source data. Later installs do not overwrite an existing desktop database. Build and installation checks reject broken links or links that escape the application bundle. The local development `.env` is repointed to the same canonical data directory after installation.
- The app bundle contains code and generic runtime assets, never the user's database, credentials or CVs. Copying the app alone to another Mac does not copy personal data or authentication.
- Native Save dialogs handle downloads. A local-origin file input uses a native Open dialog for ZIP import. Explicit external HTTP(S) links open in the user's browser. Remote top-level pages do not replace the local app; no unrestricted native JavaScript bridge is exposed.
- Existing scanning, model serialization, saved-job behavior and manual application boundaries remain in effect. Scanning requires the app to be running and the Mac awake. It does not start at login or wake a sleeping computer.

The 16 October redesign uses a 44px unified header with real traffic lights and a transparent title bar. The app-name region supports native dragging and double-click zoom, while the page and assistant controls remain interactive. Browser-only instances omit the native inset. See the [current UI specification](../decisions/dashboard-ui.md).

## Data locations

The installed app keeps its canonical data in `~/Library/Application Support/ununemploy/`, outside the application bundle:

- `job-hunter.db`: jobs, saved status, notes, profile revisions, CV/cover-letter versions, assistant history, application settings, scan checkpoints and budget counters. LaTeX source versions and compiled PDF previews also live in SQLite.
- `cv-sources/` and `resume/`: imported original evidence and legacy document files.
- `secrets/` and `desktop.env`: locally retained provider credentials and runtime configuration.
- `backups/`: database snapshots; `desktop.log`: runtime diagnostics. Other files track the active process and preferred local port.

The current Mac installation uses the existing official Codex authentication home at `~/.codex`, separate from application records. Browser preferences such as theme belong to WKWebView's website store at `~/Library/WebKit/local.ununemploy.desktop/WebsiteData/`; an unsent assistant draft uses browser session storage rather than SQLite. Native window preferences are in `~/Library/Preferences/local.ununemploy.desktop.plist`. Downloaded documents go wherever the user chooses in the Save dialog. Replacing the `.app` bundle leaves these data locations intact. See [backups and restore](../guides/backups.md) for consistent database snapshots.

## Verification recipe

Build prerequisites: current project Node/dependencies, Go, Xcode Command Line Tools and an installed official `@openai/codex` npm package for the current Mac. Initial packaging downloads checksum-pinned Tectonic and generic packages, plus the version-matched Playwright headless browser.

```sh
npm run desktop:build
npm run desktop:test
npx tsx --test tests/desktop.test.ts
npx tsx scripts/verify-desktop.ts
```

For a source-only iteration with unchanged Node/architecture, `npm run desktop:build -- --reuse-runtimes` reuses the previously built generic runtime payload. A normal build refreshes that payload. The native lifecycle driver creates a synthetic isolated database with scans/inference disabled, runs with a minimal PATH, tests duplicate launch, Quit, relaunch, forced termination and counter persistence, and removes its temporary instance. Results are written privately under `.local-data/verification/`.

Install the built bundle and import existing local appdata with `npm run desktop:install`. Quit any running desktop/development instance first. The installer refuses active leases and does not overwrite an existing desktop database. Installation updates the local `.env`; it is not a disposable fixture command.

Native UI checks: open the app, edit/save a synthetic LaTeX CV, compile and inspect its selectable PDF preview, download using the native Save panel, verify unsaved-edit cancellation on Quit, close the window, confirm a fresh worker heartbeat, reopen, then Quit and confirm the entire service process group exits. Use [shared setup](../verification/setup.md) and keep personal data out of screenshots.

## Coverage and limitations

The user chose to implement/evaluate a lighter Pi runtime on Mac first on 18 October. The [package-size assessment and handoff](../journal/2026-10-18-pi-runtime-handoff.md) records the measured Windows payload and the proposed `pi-ai` starting point. Neither platform has migrated to Pi; the runtime descriptions here remain current implementation behavior.

The macOS bundle is approximately 1.1 GB because it includes the model/runtime and document-export dependencies. Its native UI uses the system webview. The Mac build is locally ad-hoc signed, not Developer ID signed or notarized for distribution. No Linux desktop package, automatic update system, login item, or tray icon is provided. Unraid remains an independent hosting target; no server deployment is implied.

The [Windows and Linux assessment](../journal/2026-10-16-desktop-portability.md) records the original plan. The [paused checkpoint](../journal/2026-10-17-windows-checkpoint.md) is historical: the user subsequently authorized resuming. The Windows local build now includes its runtimes and installer. Clean-machine distribution remains unverified; Linux desktop remains unimplemented.

Window routing/filter state is tied to the saved local origin. If another application occupies its port, a new port is used and origin-specific browser preferences may start afresh; SQLite records remain intact. Service failure requires quitting/reopening the app after the displayed error. Existing startup recovery preserves queued work and pauses interrupted model jobs.

## Verification history

[Windows installer integrity — 17 October 2026](../verification/runs/2026-10-17-windows-installer.md) covers package completeness, replacement failures and prerequisite checks after the local port.

[Windows local build — 17 October 2026](../verification/runs/2026-10-17-windows-port.md) records Windows lifecycle, compiler isolation, document workflows, official Codex and installation checks, with release limits kept separate.

[Windows prototype checkpoint — 17 October 2026](../verification/runs/2026-10-17-windows-checkpoint.md): build and early lifecycle fixtures passed; actual WebView2 screenshot capture timed out and later native scenarios remain untested. Development paused at user request.

[Cursor-inspired UI redesign — 16 October 2026](../verification/runs/2026-10-16-cursor-redesign.md) records the replacement controls, responsive/theme checks, preserved workflows and native installation.

[Lean cleanup installation — 16 October 2026](../verification/runs/2026-10-16-lean-native-install.md) records the successful rebuild/install, unchanged canonical records, passing packaged lifecycle and healthy reopened app. The existing large-inbox refresh timeout remains unresolved.

[ZIP backups and LaTeX-only CV — 8 October 2026](../verification/runs/2026-10-07T182813Z-backups.md) records archive validation/replacement, the two-button browser and native flows, LaTeX/assistant checks and installation.

[Desktop portability follow-up — 7 October 2026](../verification/runs/2026-10-07T114528Z-desktop-portable.md) passed the corrected bundle audit, 175-test suite, packaged lifecycle and final startup.

[Native desktop verification — 7 October 2026](../verification/runs/2026-10-07T113853Z-desktop.md) records the packaging, lifecycle, native workflow and installation checks. These expectations are not a claim that every provider, model invocation or document layout was reverified during packaging.

## Windows 11 x64

The local Windows package is `build/desktop/windows/ununemploy.exe`, with `resources/` beside it. Keep the directory together. The Go host uses Win32 and `github.com/wailsapp/go-webview2` v1.0.23 with the installed Microsoft Edge WebView2 Evergreen Runtime. It has ordinary Windows window controls and **File → Quit ununemploy**, without the macOS traffic-light inset. Close hides the window and leaves services running; reopening activates the same instance. Quit checks unsaved edits before stopping services. Local HTTP/blob downloads use native Save As; explicit external HTTP(S) links open the default browser. Scripted remote navigation cannot replace the application.

Default personal data is `%LOCALAPPDATA%\ununemploy`, including SQLite, `desktop.env`, local logs, instance state, and the `webview2/` browser store. It is outside the installation. `JH_DESKTOP_DATA_DIR` selects isolated data for tests; ordinary new databases start empty. The official Codex runtime retains its own existing authentication separately. No credentials or personal records are included in the package.

Windows uses `LockFileEx` for one instance per data directory. A plain Node bootstrap waits for the launcher to attach a kill-on-close Job Object before importing application code. The Node API binds loopback, falls back from an occupied preferred port, and publishes its actual address through a private readiness file. Worker IPC provides graceful shutdown; the Job Object reaps remaining descendants on Quit or launcher death. No Unix socket inheritance or process-group signal is assumed on Windows.

The package includes Node, official Codex, checksum-pinned Tectonic 0.15.0, generic offline TeX assets, the Windows compiler isolation helper, and Playwright's headless Chromium. LaTeX uses a Windows AppContainer without network capabilities, private copies of the compiler/cache, an isolated writable work directory, and an atomically attached one-process Job Object. Only the expected bounded PDF returns to the caller. Compiler failure, timeout or unavailable isolation preserves saved source. The generic AppContainer profile is named `ununemploy.tex`; compiler inputs and outputs stay in temporary directories, not that profile. See [LaTeX CV](master-cv.md).

### Build, install and update

Build on Windows x64 with Node 22.19+, npm dependencies, Go 1.24+ and the official Codex executable on PATH. Go race tests additionally need a compatible C compiler. An explicit `JH_DESKTOP_CODEX_SOURCE` may point to the official `codex.exe`. The developer's current installation verified Node 22.23.3, Go 1.26.5 and Codex CLI 0.163.0. Initial build downloads generic compiler/browser resources.

```powershell
npm ci
npm run desktop:build
npm run desktop:test
node --import tsx scripts/verify-desktop-windows.ts
npm run desktop:install
```

`desktop:build:windows` is an explicit equivalent. `--reuse-runtimes` reuses matching production npm dependencies; compiler/browser download caches are retained under `build/desktop/`. Building stages a complete package before replacement and refuses to replace a running built app. Build metadata records runtime versions and executable hashes in `resources/build.json`.

`desktop:install` runs the package's `install.ps1`. It installs per user under `%LOCALAPPDATA%\Programs\ununemploy` and creates a Start-menu shortcut. Quit the installed app before updating. Installation stages the complete directory and uses same-volume directory renames, restoring the previous package if publication fails. Locked files cannot cause a partial recursive move. It never imports, overwrites or deletes personal records. The Windows installer does not repoint the development `.env`. Use Settings ZIP export/import for deliberate personal-data transfer. From an extracted package, run `powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1`; `-Destination <directory> -NoShortcut` supports isolated installation tests. Keep installation and appdata separate.

The builder records every package file's path, size and SHA-256 in `resources/package-files.json`, excluding the inventory itself. Installation validates the source and staged copy before replacing an application. Missing, altered or unlisted files, duplicate/traversing inventory paths, and package or installation-path junctions are rejected. Existing older packages can be replaced or repaired without requiring the new inventory. The inventory detects incomplete copies and accidental changes; it does not authenticate an unsigned publisher. If cleanup of retired application files fails after a successful publication, installation reports their retained path rather than claiming the update failed.

Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Check` from the package directory for a read-only checksum/prerequisite check. The installer checks Windows x64 and Microsoft's documented per-user/per-machine Evergreen WebView2 registrations before modifying the destination. If WebView2 is missing, it supplies the official download URL; no runtime is silently downloaded or installed. [Microsoft's distribution guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution) describes these registry checks and the manual-install option.

The Windows package is unsigned. WebView2 must already be installed. Clean-machine installation, Windows versions other than the tested Windows 11 x64 build, ARM64, signing, automatic updates and a newly signed-out interactive login remain unverified. This local port does not establish a supported public release or reverify macOS.
