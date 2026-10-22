---
title: Verification setup
section: Verification
updated: 2026-10-23
---
# Verification setup

Run commands from the repository root. Product verification should exercise only the selected scenarios and record their exact build; documentation validation alone does not certify the app.

## Environment and readiness

Use Node 22.19+, installed project dependencies, and Playwright Chromium; see [local development](../guides/local-development.md). `npm run build` prepares the static UI required by isolated browser drivers. LaTeX scenarios need a prepared Tectonic/package cache; `npm run setup:latex` may download generic compiler packages.

The existing dev UI defaults to `http://127.0.0.1:2839`; this workspace uses API port 4317, while a fresh installation defaults to 3000. `GET /api/health` succeeds only with a recent worker heartbeat. Check the configured port without disclosing `.env` contents. Do not start another API/worker against the user's live database. `npm run dev` starts the configured scheduler and can perform real collection.

For build identity, record `git rev-parse HEAD`, whether the tree is dirty, and a SHA-256 content manifest or patch fingerprint including relevant untracked files. A revision alone does not identify a dirty tree. Exclude `.env`, appdata, credentials and candidate evidence from public manifests and logs.

## Isolation, effects and cleanup

`npm test` uses temporary databases, fictional profile fixtures and mocked provider/runtime responses. Most browser drivers start an isolated server on an ephemeral loopback port; inspect the selected script before execution. `verify-dashboard.ts` and `verify-matching-ui.ts` use the live app, intercept Seen writes, and depend on existing listings. They are not fixture-independent guarantees. Never use candidate data to create public evidence.

Real generation drivers consume subscription allowance. Live scans consume provider/request budgets. Those checks are distinct from offline fixture tests and should be selected deliberately. Do not enable new sources or change the live profile for a documentation check.

Existing drivers store artifacts under `.local-data/verification/`. Keep raw/private artifacts there. Copy only reviewed, sanitized or synthetic evidence into `docs/wiki/evidence/<run-id>/`. Preserve run evidence; remove only temporary databases, browser contexts, processes and containers created by the check. Most isolated drivers use `finally` cleanup; inspect leftovers after failures.

## Existing checks and tools

### Windows desktop

Build with `npm run desktop:build` on Windows x64. `npm run desktop:test` runs the platform Go tests, including AppContainer denial and process cleanup probes; the race detector needs a C compiler. `node --import tsx scripts/verify-desktop-windows.ts [path-to-ununemploy.exe]` seeds isolated synthetic appdata with discovery/inference disabled, waits for the real worker/API, and drives WebView2 through a loopback CDP port. It checks UI, dirty Quit cancellation, offline CV preview/Save/native download, cover-letter PDF export, ZIP restore, Close/reopen, Quit, restart and crash cleanup. It leaves reviewed-output candidates in `.local-data/verification/windows/` and removes its temporary data/processes. `--verify-installer` additionally checks that the built installer rejects replacement of a running separately installed fixture.

Use `noDefaults:true` when attaching Playwright so it does not replace native download behavior. Native captures use CDP `Page.captureScreenshot` with `fromSurface:false`. Only explicit `JH_DESKTOP_DEBUG_PORT` plus `JH_DESKTOP_DATA_DIR` enables the host's test endpoint and native download diagnostics; ordinary launches expose no debugging port or document-path trace. The Win32 driver activates the launched fixture, checks foreground ownership/focus, types the filename with native keyboard input, verifies it and clicks Save. Setting the legacy Edit control's displayed text alone does not reliably update the shell dialog's filename model. `JH_WINDOWS_SAVE_DELAY_MS` optionally delays entering the destination to exercise a slower user interaction.

The Windows driver also asserts the opening Jobs heading, checks timezone-map keyboard input, starts/cancels the actual bundled Pi OAuth flow twice without opening the external sign-in page, checks private host-ID permissions, and attaches its downloaded synthetic PDF to verify extraction and draft reload. `JH_WINDOWS_VERIFY_OUTPUT` selects an alternative local evidence directory. It does not complete account authentication or send model requests.

For the full Node suite, install the development Playwright Chromium with `npx playwright install chromium`; the compact Windows package no longer ships a separate browser. Set `JH_TECTONIC_BIN`, `JH_LATEX_CACHE` and `JH_LATEX_SANDBOX` to their `build/desktop/windows/resources/` paths, then run `npm test`. Windows tests use real filesystem URLs, a synthetic Pi transport response and ACL assertions; the Homebrew-only scenario skips on Windows. To separately verify actual subscription/model access, `JH_PI_VERIFY_CREDENTIALS=/private/path/credentials.json npx tsx scripts/verify-pi-app.ts` exercises the current runtime with synthetic PDF/image data (set `JH_PI_VERIFY_APP` to a built app root to verify its bundle) and consumes ChatGPT allowance. It sends no candidate facts and does not switch model or billing method.

For installation tests, run the built `install.ps1` with a fresh workspace-local `-Destination` and `-NoShortcut`, then pass its executable to the native driver. Repeat installation only after Quit and verify replacement hashes and separate fixture-data retention. These tests do not establish clean-machine or fresh-login support.

`node --import tsx --test tests/windows-installer.test.ts` runs Windows-only synthetic package checks through the PowerShell installer: first installation/replacement, same-size corruption, missing dependencies, extra files, inventory errors, junctions and locked files. It also explicitly simulates missing WebView2 registration and publication failure; those two injections do not establish behavior on a clean OS. The test uses a temporary `LOCALAPPDATA` for synthetic records and deletes only its own fixture tree. Check the actual built payload with `powershell -NoProfile -ExecutionPolicy Bypass -File build/desktop/windows/install.ps1 -Check`; this requires the installed WebView2 Runtime but no developer Node or Go on PATH.

### Shared browser and API

`npx tsx scripts/verify-assistant-onboarding.ts` uses an empty temporary database with scanning disabled. It exercises the initial open assistant, PDF file picker/extraction, a natural ownership follow-up, correction progress after a simulated empty-action response, save receipts, reload and visible canonical facts. Model inference is simulated. It writes synthetic evidence under `.local-data/verification/assistant-onboarding/` and closes its browser/server/database. On Windows, the packaged `build/desktop/windows/resources/bin/node.exe --import tsx` can replace `npx tsx` when running from this checkout with development dependencies installed. This browser driver requires a separate development Playwright Chromium installation; the compact application uses system WebView2.

`npx tsx scripts/verify-timezone-ui.ts` uses synthetic Malaysia, Nepal, US and Worldwide jobs with scanning/inference disabled. It checks pointer and keyboard range/offset input, fixed handle coordinates with effective rotated labels, wrapped map geometry, identical full-turn endpoints, matching map countries, filtering, independent range/offset reload/Saved persistence, Escape focus return, light/dark/mobile layout, map error/retry and clearing. Build first. Evidence goes to `.local-data/verification/timezone-labels/`; the driver removes its temporary database and browser/server. `tests/timezones.test.ts` checks seasonal offsets, multi-zone countries, shared map/server matching, date-line equivalence and unresolved locations; `tests/job-query.test.ts` checks API composition, serialized offsets, wrapped rotation and invalid inputs.

`npx tsx scripts/verify-inbox-loading.ts` uses synthetic data and holds a jobs request past the real 15-second deadline, then checks the failure label, Retry, empty results and bootstrap revision header. Build first.

`npx tsx scripts/verify-inbox-performance.ts /path/to/job-hunter.db` opens the supplied database read-only and backs it up into a disposable temporary directory before importing application code. Use a collection of at least 30,000 jobs. It checks cold/warm API requests, ETags, document choices, refresh reuse across a second connection’s writes, minute expiry and filters against a 10-second per-request budget. It starts no worker, scans or inference and deletes the working copy on completion. Run without other heavy workloads for comparable timings. Both drivers write reviewed-output candidates under `.local-data/verification/inbox-performance/`; never publish the source database or raw logs.

`npx tsx scripts/verify-ui-design.ts` checks the Cursor-inspired UI against a fresh synthetic database on an ephemeral loopback port. It covers System/explicit appearance, menus and keyboard location selection, dialog cancellation/focus return, Settings persistence, loading/error/empty states, all main pages, sidebar collapse, mobile navigation and reduced motion. It blocks external browser requests and writes synthetic screenshots and a concise result to `docs/wiki/evidence/2026-10-16-cursor-redesign/`. Build first and wait for completion; never replace `dist` while browser drivers are running because lazy chunks may still be requested. The script removes its temporary database and closes its own server/browser.


`npx tsx scripts/verify-backup-ui.ts` runs the ZIP download/import workflow against an isolated synthetic database and saves reviewed-output candidates under `.local-data/verification/backup/`. `npx tsx --test tests/backup.test.ts` covers validation, overwrite, concurrency, rollback and persistence. See [ZIP backups](../features/backups.md).


```sh
npm run check
npm test
npm run build
```

`npx tsx scripts/verify-assistant-ui.ts` checks the overlay, onboarding, jobs, document edits, preview refresh, unsaved text and desktop/mobile behavior with isolated synthetic data and simulated inference; PDF compilation is real. The old `verify-profile-ui.ts` command delegates to this workflow. `npx tsx scripts/verify-assistant-runtime.ts` performs an opt-in real Codex profile/LaTeX edit and PDF compilation with synthetic facts; it consumes subscription allowance. `verify-profile-runtime.ts` checks profile onboarding through the same app-wide assistant runtime with synthetic facts; it also consumes subscription allowance.

Tests use an isolated temporary database and mock source responses/Codex process output. `scripts/verify-generation.ts` performs a real subscription inference against an already-collected Linear posting without saving it to your job list. It consumes subscription allowance. `scripts/verify-exports.ts` retains checks for master and legacy resume exports. `scripts/verify-container.ts` exercises the amd64 image, PDF export, volume ownership, backup, and restart persistence with an isolated Docker volume, fixture data, and scheduling disabled.

`npx tsx scripts/verify-dashboard.ts` checks pagination, filtering, polling, retry behavior, unsaved notes and mobile layout against the local running app without saving jobs. `npx tsx scripts/verify-cv-workflow.ts` now runs the cover-letter save/edit/restore/download browser flow in an isolated temporary app with simulated generation. Add `--real-generation` to use the configured Codex subscription; this consumes allowance. The current driver uses only a fictional profile/job in both modes. The [lean cover-letter run](runs/2026-10-16-lean-cover-letters.md) checks the current plain-text editor, clipboard and PDF output with simulated generation. Earlier real-generation and Word-output checks are historical; see [verification history](history.md).



## Wiki checks

No extra package installation or server is needed:

```sh
node docs/wiki/_build.mjs
node docs/wiki/_build.mjs --check
node ../jstack/skills/verify-change/scripts/check-reports.mjs docs/wiki
```

Open `docs/wiki/index.html` locally. Verify navigation, search, source view and a narrow viewport with no network dependency when the reader changes. Use the existing Playwright installation or an available browser. The report metadata checker lives in the sibling jstack checkout; the reader builder is vendored and works without it. See [documentation maintenance](../guides/documentation.md).

## Windows setup and release verification

Build with `npm run desktop:build:windows`, install the pinned builder using `scripts/setup-windows-builder.ps1`, then `npm run desktop:setup:windows`. Run `node --import tsx scripts/verify-windows-setup.ts` in a Windows account without an existing registered Inno installation. It installs and updates the actual setup into a temporary path containing spaces, runs the native driver against that installed executable with only system directories on PATH, and uninstalls. A separate synthetic personal-data sentinel checks preservation. Setup logs remain private under `.local-data/verification/setup/`. Failures retain the isolated directory for diagnosis.

`node --import tsx scripts/verify-windows-pdf.ts` exercises actual WebView2 legacy/letter PDF export, four-page Unicode/selectable text, disabled scripts and zero resource requests to a local probe server. Generated synthetic documents remain local. `build/releases/windows-release.json` identifies installer SHA-256, source revision, file count and sizes. Fresh setup with WebView2 absent and complete live ChatGPT onboarding require a separate Windows account/machine; sign-in start/cancel and mocked inference do not prove those paths.
