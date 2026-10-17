---
title: Windows prototype checkpoint
section: Verification
updated: 2026-10-17
result: Failed
---
# Windows prototype checkpoint

## Scope

Initial Windows launcher work for [FEAT-desktop](../../features/desktop.md), following the [porting handoff](../../journal/2026-10-16-desktop-portability.md). The user paused development before integration verification was complete. The aggregate result is Failed because the selected native screenshot step timed out; this does not establish a rendering defect. It is not a Windows release claim.

## Build and environment

Windows x64, OS build 26200; Node 22.23.3, Go 1.26.5, GCC, system WebView2 and Playwright CDP. Dirty base revision `a7d9d6433a7f2db962be1f1a9aebfb9c19f20efd`. The [checkpoint manifest](../../evidence/2026-10-17-windows-checkpoint/source-manifest.json) fingerprints changed code and the final built wrapper. The prototype package's build metadata predates the last wrapper-only rebuild. The latest integration attempt used that rebuilt wrapper and the packaged Node/backend/frontend.

Temporary synthetic databases were seeded before launch; all sources, scheduling and inference were disabled. No personal appdata or authentication was imported. The tests used an explicit fixture directory and a loopback-only debugging port. Raw diagnostics remain local.

## Results

| Scenario | Expected | Observed | Outcome |
| --- | --- | --- | --- |
| TypeScript/frontend/package build | Build existing app and Windows prototype | TypeScript/Vite and prototype package completed before the final integration-driver additions; subsequent wrapper rebuild succeeded | Passed |
| Windows Go lifecycle fixtures | Conflict fallback, duplicate activation, failure reporting, owned descendant cleanup and environment/navigation checks | Five tests passed with `go test -race -v ./...` during development; later rename-retry/native-debug edits were not followed by another suite run | Passed |
| Initial instance-record replacement attempt | Publish ready state while status is polled | Rename returned Access denied; a bounded retry was added, and later launches succeeded | Failed |
| Latest packaged startup and writes | Start real API/worker and retain fictional job changes | Health passed; manual-add and Save APIs returned a saved job with notes; no inference enabled | Passed |
| Native UI attachment | Reach the local page in actual WebView2 | CDP connected; Open assistant found; native window visible; macOS inset absent | Passed |
| Native screenshot | Capture the rendered window contents | Playwright `page.screenshot()` timed out after fonts loaded, including the final 10-second attempt | Failed |
| Remaining real native lifecycle | Remote navigation block, Close/reopen, Quit, persisted records and forced-exit cleanup | The integration driver stopped at screenshot capture, before these steps | Untested |
| Final-tree regression and complete release | Recheck final source, macOS and document/runtime functionality | Paused at user request; Windows runtime/document packaging and distribution remain unfinished | Untested |

## Limits and cleanup

The Go fixture results apply to their earlier development snapshot, not the final entire tree. Native screenshot timeout could be a capture or rendering issue; its cause remains unestablished. Do not carry forward the earlier macOS passing reports as validation of the modified shared supervisor/service code.

The failed driver killed its owned launchers and removed its temporary fixture data. A read-only checkpoint inspection found no remaining matching ununemploy launcher/service/test processes or temporary Windows fixture directories. Source changes and build artifacts remain local and uncommitted. See the [paused checkpoint](../../journal/2026-10-17-windows-checkpoint.md) for exact resume steps; further development awaits user instructions.
