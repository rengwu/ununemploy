---
title: Native desktop app
section: Features
updated: 2026-10-23
---
# Native desktop app

Feature ID: `FEAT-desktop`

## Intent and basis

Open ununemploy as a native macOS or Windows app without starting a development server. The user requested a Go webview wrapper on 7 October 2026 and selected **keep running until Quit**. Windows implementation was authorized and resumed on 17 October. [Accepted decision](../decisions/index.md), [macOS journal](../journal/2026-10-07-desktop.md), and [Windows journal](../journal/2026-10-17-windows-port.md).

## Entry points and prerequisites

The macOS contract follows below; [Windows](#windows-11-x64) uses platform-specific window, lifecycle, compiler isolation and installation behavior.

Open `~/Applications/ununemploy.app` from Finder or Spotlight. Closing the window keeps the app and worker running; opening the app again brings back its window. **ununemploy → Quit ununemploy** or Command-Q stops the API, worker and descendant processes. Unsaved document edits show a Cancel / Quit Without Saving dialog.

The currently built package targets this Mac's Apple silicon architecture. It includes Node, production server dependencies, the React frontend, a bundled OpenAI-only pi-ai module, portable Tectonic with generic packages, and Playwright's headless Chromium for HTML PDF exports. Go uses Cocoa/WKWebView through a small cgo adapter. It does not rewrite the backend in Go. macOS 13 is the declared wrapper deployment target; other OS releases and Intel packaging need separate testing. No app login or cloud service is added.

Pi uses an app-owned ChatGPT connection under appdata; existing Codex authentication is untouched; an unavailable sign-in, model or subscription allowance remains visible through the existing runtime state. Provider credentials and configured budgets remain prerequisites for their collectors.

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

Pi authentication lives in `pi-auth/` under canonical appdata. Existing official Codex authentication at `~/.codex` remains untouched and is not imported. Browser preferences such as theme belong to WKWebView's website store at `~/Library/WebKit/local.ununemploy.desktop/WebsiteData/`; an unsent assistant draft uses browser session storage rather than SQLite. Native window preferences are in `~/Library/Preferences/local.ununemploy.desktop.plist`. Downloaded documents go wherever the user chooses in the Save dialog. Replacing the `.app` bundle leaves these data locations intact. See [backups and restore](../guides/backups.md) for consistent database snapshots.

## Verification recipe

Build prerequisites: current project Node/dependencies, Go, Xcode Command Line Tools and npm dependencies for the current Mac. Initial packaging downloads checksum-pinned Tectonic and generic packages, plus the version-matched Playwright headless browser.

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

The user chose to implement/evaluate a lighter Pi runtime on Mac first on 18 October. The [package-size assessment and handoff](../journal/2026-10-18-pi-runtime-handoff.md) records the original Windows payload and proposed `pi-ai` starting point. Mac implementation followed on 19 October and [Windows verification](../verification/runs/2026-10-20-windows-pi.md) on 20 October. The current compact Windows package is described below. See [AI runtime](ai-runtime.md).

The macOS bundle is approximately 1.1 GB because it includes the model/runtime and document-export dependencies. Its native UI uses the system webview. The Mac build is locally ad-hoc signed, not Developer ID signed or notarized for distribution. No Linux desktop package, automatic update system, login item, or tray icon is provided. Unraid remains an independent hosting target; no server deployment is implied.

The [Windows and Linux assessment](../journal/2026-10-16-desktop-portability.md) records the original plan. The [paused checkpoint](../journal/2026-10-17-windows-checkpoint.md) is historical: the user subsequently authorized resuming. The Windows local build now includes its runtimes and installer. Clean-machine distribution remains unverified; Linux desktop remains unimplemented.

Window routing/filter state is tied to the saved local origin. If another application occupies its port, a new port is used and origin-specific browser preferences may start afresh; SQLite records remain intact. Service failure requires quitting/reopening the app after the displayed error. Existing startup recovery preserves queued work and pauses interrupted model jobs.

## Verification history

[Large-inbox fix and macOS reconciliation — 18 October 2026](../verification/runs/2026-10-18-inbox-performance.md) checks the combined Windows checkpoint and local fix: macOS Go race tests, packaged lifecycle, build/install and native inbox startup. Windows execution was not repeated on Mac.

[Windows installer integrity — 17 October 2026](../verification/runs/2026-10-17-windows-installer.md) covers package completeness, replacement failures and prerequisite checks after the local port.

[Windows local build — 17 October 2026](../verification/runs/2026-10-17-windows-port.md) records Windows lifecycle, compiler isolation, document workflows, official Codex and installation checks, with release limits kept separate.

[Windows prototype checkpoint — 17 October 2026](../verification/runs/2026-10-17-windows-checkpoint.md): build and early lifecycle fixtures passed; actual WebView2 screenshot capture timed out and later native scenarios remain untested. Development paused at user request.

[Cursor-inspired UI redesign — 16 October 2026](../verification/runs/2026-10-16-cursor-redesign.md) records the replacement controls, responsive/theme checks, preserved workflows and native installation.

[Lean cleanup installation — 16 October 2026](../verification/runs/2026-10-16-lean-native-install.md) records the successful rebuild/install, unchanged canonical records, passing packaged lifecycle and healthy reopened app. The existing large-inbox refresh timeout remains unresolved.

[ZIP backups and LaTeX-only CV — 8 October 2026](../verification/runs/2026-10-07T182813Z-backups.md) records archive validation/replacement, the two-button browser and native flows, LaTeX/assistant checks and installation.

[Desktop portability follow-up — 7 October 2026](../verification/runs/2026-10-07T114528Z-desktop-portable.md) passed the corrected bundle audit, 175-test suite, packaged lifecycle and final startup.

[Native desktop verification — 7 October 2026](../verification/runs/2026-10-07T113853Z-desktop.md) records the packaging, lifecycle, native workflow and installation checks. These expectations are not a claim that every provider, model invocation or document layout was reverified during packaging.

## Windows 11 x64

The user approved smaller packaging and smooth installation on 23 October. The [delivery journal](../journal/2026-10-21-windows-delivery.md) retains the initial measurements and accepted direction. Download the versioned **setup.exe** from [GitHub Releases](https://github.com/rengwu/ununemploy/releases), run it, and open **ununemploy** from the Start menu. Testers need no ZIP, source checkout, Node, npm, Go or manual folder copying.

The intermediate build lives in `build/desktop/windows`; setup installs it together. The Go host uses Win32 and go-webview2 v1.0.23 with Microsoft Edge WebView2 Evergreen. Close hides the window and leaves services running; reopening activates the same instance. **File > Quit ununemploy** checks unsaved edits before stopping services. Downloads use native Save As. Explicit HTTP(S) links use target=_blank and the user-initiated new-window handler to open the default browser. Remote top-level navigation is always cancelled and cannot open an external browser or replace the application. External browsers belong to the user and are not terminated when the app quits.

Personal data remains in `%LOCALAPPDATA%\ununemploy`, outside the installation: SQLite, desktop.env, logs, instance state, webview2 and pi-auth. Ordinary new databases start empty. Existing Codex credentials remain separate. `JH_DESKTOP_DATA_DIR` selects isolated test data. No credentials or candidate records enter packages.

Windows uses LockFileEx for one instance per data directory. A plain Node bootstrap waits for Job Object ownership before importing application code. The API binds loopback, falls back from an occupied preferred port and publishes readiness privately. Worker IPC supplies graceful shutdown; the Job Object reaps descendants on Quit or launcher death.

### Runtime package

The package includes Node, compiled API/worker code with the selected Pi provider, PDF.js and its Windows native dependency, checksum-pinned Tectonic 0.15.0, generic offline TeX assets and the compiler isolation helper. Frontend dependencies are compiled into web assets. Runtime compilation tools, development source trees and a separate Chromium are absent. Explicit assets include migrations, geography/timezones, the profile skill and LaTeX starter. Third-party notices accompany bundled code.

Cover-letter and legacy HTML CV PDF exports use a short-lived invisible WebView2 with a fresh temporary profile, disabled scripts/host bridges and blocked resource requests/navigation. Only a fixed print operation is exposed, with no debugging port. Native Save As is unchanged. Browser/Unraid and macOS retain Playwright PDF export. PDF attachment extraction runs in a bounded Node child process so a native parser crash cannot terminate the API.

LaTeX remains offline through the bundled compiler/cache. Its Windows AppContainer has no network capabilities, private compiler/cache copies, an isolated work directory and an atomically attached one-process Job Object. Only a bounded PDF returns. Failures preserve saved source. The generic profile is named ununemploy.tex; private input/output stays in temporary directories. The native launcher resolves the per-user Windows LocalAppData known folder for compiler temporary files, independently of inherited TEMP aliases or custom parent folders; each isolated work directory is removed after use. See [LaTeX CV](master-cv.md).

### Build, install and update

Build on Windows x64 with Node 22.19+, npm dependencies, Go 1.24+ and Inno Setup. The release workflow pins Node 22.23.3 and Go 1.26.5; pi-ai remains 1.3.0. Initial builds download generic TeX resources and retain them under build/desktop/windows-compiler.

```powershell
npm ci
npm run desktop:build:windows
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows-builder.ps1
npm run desktop:setup:windows
node --import tsx scripts/verify-windows-setup.ts
node --import tsx scripts/verify-windows-pdf.ts
```

The builder stages a complete package and refuses to replace a running built app. It bundles from the current installed lockfile dependencies on every build. Build metadata records version, source revision and hashes; Settings > General displays version/revision and links to downloads.

Setup output is `build/releases/ununemploy-<version>-windows-x64-setup.exe`, a SHA-256 file and windows-release.json with measured sizes. The builder helper downloads Inno Setup 7.1.0 from its immutable official release, checks SHA-256 and publisher signature, and installs it under build/tools/inno. Alternatively set ISCC to an existing compiler. Testers do not need this tooling.

Setup installs per user under `%LOCALAPPDATA%\Programs\ununemploy`, creates a Start menu shortcut and registers a Windows uninstaller. Quit before updating: closing the window keeps services running. No elevated installation or application login is required. Setup verifies checksums before changing files, stages the complete package, and uses same-volume directory renames with rollback. The previous package is retained until setup finishes; cancellation or an installation error restores it. Uninstall checks running processes and unsafe paths before removing application files. Both preserve personal data; use Settings ZIP export/import for deliberate data transfer.

The inventory records every package file's relative path, length and SHA-256. Missing, altered or unlisted files, duplicate/traversing paths and junctions are rejected. Older packages can be repaired without requiring their original hashes. Checksums detect incomplete copies and accidental changes, not publisher authenticity. Failed cleanup after a successful update reports the retired directory.

The compiled setup checks Microsoft's per-user/per-machine Evergreen registrations. If absent, it downloads the official WebView2 bootstrapper, validates its Microsoft publisher signature, installs per user and checks readiness. That step needs internet access. A failed prerequisite leaves an actionable setup error. Existing WebView2 requires no additional browser download. See [Microsoft's distribution guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution).

The lower-level `npm run desktop:install` PowerShell path remains available for developers; it requires WebView2 already installed. Its `-Destination`, `-NoShortcut` and `-Check` options support diagnostics and isolated checks. It does not repoint the development .env or touch personal data.

### Release automation and limits

`.github/workflows/windows-release.yml` builds on Windows from a version tag or manual run, tests code and the installed native application, retains the setup artifact, and publishes tag builds as prereleases after checks pass. Tags must match package.json. The [release notes](https://github.com/rengwu/ununemploy/releases) identify the exact delivered build.

The installer is an unsigned beta; Windows may show a publisher/reputation prompt. A separate clean Windows machine, missing-WebView2 provisioning, completed interactive ChatGPT sign-in and live inference remain unverified locally. ARM64, signing and automatic/delta updates are outside this delivery. Windows changes do not reverify macOS.

[Compact Windows setup - 23 October 2026](../verification/runs/2026-10-23-windows-delivery.md) records the size reduction, installed native checks, update/uninstall retention, PDF export/isolation, and remaining live-machine limits.

[Windows Pi verification - 20 October 2026](../verification/runs/2026-10-20-windows-pi.md) records the earlier 678 MiB package, credential ACL/CRLF repairs and native regressions. [Pi runtime and attachments - 19 October](../verification/runs/2026-10-19-pi-attachments.md) records the Mac migration. These are historical builds, not current package measurements.
