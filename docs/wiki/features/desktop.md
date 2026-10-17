---
title: Native desktop app
section: Features
updated: 2026-10-17
---
# Native desktop app

Feature ID: `FEAT-desktop`

## Intent and basis

Open ununemploy as a native macOS app without starting a development server in Terminal. The user requested a Go webview wrapper on 7 October 2026 and selected **keep running until Quit**. [Accepted decision](../decisions/index.md) and [implementation journal](../journal/2026-10-07-desktop.md).

## Entry points and prerequisites

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

The bundle is approximately 1.1 GB because it includes the model/runtime and document-export dependencies. Its native UI uses the system webview. The build is locally ad-hoc signed, not Developer ID signed or notarized for distribution. No Windows/Linux desktop package, automatic update system, login item, or tray icon is provided. Unraid remains an independent supported hosting target; no server deployment is implied.

The [Windows and Linux assessment — 16 October 2026](../journal/2026-10-16-desktop-portability.md) records the observed portability blockers, proposed limited initial scope, rough effort estimates and required release checks. The user plans to continue Windows work on a Windows machine; the [17 October handoff](../journal/2026-10-16-desktop-portability.md#windows-handoff-17-october-2026) records implementation order and the first milestone. No Windows/Linux native port is implemented or verified here.

Window routing/filter state is tied to the saved local origin. If another application occupies its port, a new port is used and origin-specific browser preferences may start afresh; SQLite records remain intact. Service failure requires quitting/reopening the app after the displayed error. Existing startup recovery preserves queued work and pauses interrupted model jobs.

## Verification history

[Cursor-inspired UI redesign — 16 October 2026](../verification/runs/2026-10-16-cursor-redesign.md) records the replacement controls, responsive/theme checks, preserved workflows and native installation.

[Lean cleanup installation — 16 October 2026](../verification/runs/2026-10-16-lean-native-install.md) records the successful rebuild/install, unchanged canonical records, passing packaged lifecycle and healthy reopened app. The existing large-inbox refresh timeout remains unresolved.

[ZIP backups and LaTeX-only CV — 8 October 2026](../verification/runs/2026-10-07T182813Z-backups.md) records archive validation/replacement, the two-button browser and native flows, LaTeX/assistant checks and installation.

[Desktop portability follow-up — 7 October 2026](../verification/runs/2026-10-07T114528Z-desktop-portable.md) passed the corrected bundle audit, 175-test suite, packaged lifecycle and final startup.

[Native desktop verification — 7 October 2026](../verification/runs/2026-10-07T113853Z-desktop.md) records the packaging, lifecycle, native workflow and installation checks. These expectations are not a claim that every provider, model invocation or document layout was reverified during packaging.
