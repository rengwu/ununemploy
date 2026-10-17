---
title: Windows port paused checkpoint — 17 October 2026
section: Journal
updated: 2026-10-17
status: Historical checkpoint — resumed
---
# Windows port paused checkpoint — 17 October 2026

The user authorized starting the [Windows handoff](2026-10-16-desktop-portability.md#windows-handoff-17-october-2026), then explicitly requested: “pause development at a safe checkpoint. await further instructions.” This page preserves that stopping point. The user subsequently said “you may continue”; see the [resumed Windows work](2026-10-17-windows-port.md). Statements below describe the earlier pause, not the current implementation.

## Working tree and environment

Base revision: `a7d9d6433a7f2db962be1f1a9aebfb9c19f20efd`. Changes are uncommitted. The sibling `../jstack` checkout is now available and its shared contract and relevant skills were read. The machine is Windows x64, OS build 26200, with Go 1.26.5 and GCC. Node 22.23.3 was downloaded from nodejs.org, checked against its published SHA-256, and extracted locally under `.local-data/tools/node-v22.23.3-win-x64`; it was not installed globally. Dependencies were installed with `npm ci`.

The prototype is `build/desktop/windows/ununemploy.exe` with a `resources/` directory beside it. It bundles Node and application code only. It is not a complete Windows release and has not been installed into the user's application directories. No personal database was migrated or opened. Tests used synthetic temporary appdata with scans and inference disabled. At the pause checkpoint, no matching launcher/service/test processes or `ununemploy-windows-*` temporary fixture directories remained.

## Work present

- Shared supervisor now delegates locking, service launch and termination to macOS/Windows files. Existing macOS tests are platform-tagged; macOS behavior has not been rerun here.
- Windows uses a file lock, a plain-Node startup gate before application imports, loopback binding with a preferred-port fallback, a readiness file, and a kill-on-close Job Object for owned services. Desktop shutdown uses worker IPC.
- A Go/WebView2 window uses native Windows chrome, Close-to-hide, File → Quit, duplicate-launch activation and a local-origin navigation policy. Ordinary launches do not expose a debugging port. An explicit debug port plus an explicit data directory supports isolated verification.
- `npm run desktop:build:windows` creates the prototype. `scripts/verify-desktop-windows.ts` and `scripts/desktop-window.ps1` are the new integration driver and native-window helper.
- Five Windows Go tests passed with the race detector during development. The production frontend/package build passed. Later wrapper changes compiled successfully. These observations do not certify the final whole tree.

## Exact stopping point

The latest packaged integration attempt reached healthy API/worker startup, added and saved a fictional job with notes, connected Playwright to the actual WebView2 process, found Open assistant, checked absence of the macOS inset, and confirmed that the native window was visible. `page.screenshot()` then timed out. The driver stopped and cleaned up. There is no completed passing integration result or screenshot.

An earlier attempt exposed a transient access-denied error replacing `desktop-instance.json`. A bounded rename retry was added; later startup succeeded. An earlier debugging attachment failure was resolved by passing explicit WebView2 browser arguments. Screenshot timeout remains unresolved; it must not be assumed to prove either a blank app or correct rendered layout. See the [checkpoint verification record](../verification/runs/2026-10-17-windows-checkpoint.md).

## Resume after further instructions

1. Inspect the retained diff and rerun TypeScript validation against the final new scripts. Review Win32/COM callback and lifecycle code, including the small direct-vtable adapters; they still need a final implementation review.
2. Diagnose WebView2 screenshot capture or use another reliable native capture method. Complete actual UI Close/reopen, dirty-edit Quit cancellation, explicit Quit, restart/persistence and forced-exit scenarios. The latest driver did not reach those later steps.
3. Rerun affected Go tests after the final wrapper edits and verify macOS on a Mac. Review packaging failure/replacement behavior before treating the prototype builder as an installer.
4. Continue the handoff's runtime/document milestones: official Codex packaging and Windows environment/authentication, Chromium PDF exports, isolated Windows LaTeX compilation, native downloads/imports, installer/signing and clean-machine checks. Windows LaTeX remains unsupported and must continue to fail closed.

Private fixture diagnostics remain at `.local-data/verification/windows/failed-desktop.log`. They are not included in the wiki. No commit, deployment, source scan, model inference or external communication was performed.
