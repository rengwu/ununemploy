---
title: Desktop portability follow-up — 7 October 2026
section: Verification runs
updated: 2026-10-07
result: Passed
---
# Desktop portability follow-up — 7 October 2026

## Scope

[FEAT-desktop](../../features/desktop.md): correct external npm symlinks found after the [initial checks](2026-10-07T113853Z-desktop.md), rebuild/reinstall and rerun the packaged lifecycle. The previous report retains that failure and earlier native UI/import evidence.

## Build and environment

Revision `0f061483881ac7faa17ad9ca3d86d1b905d77e22`, dirty tree; macOS 27 arm64, Node v22.19.0, Go 1.26.4. [Source and signed installed binary fingerprints](../../evidence/2026-10-07T114528Z-desktop-portable/build-identity.json). The wrapper's pre-signing checksum is unchanged from the native UI check. Final installed executables match the built package.

## Results

| Scenario | Expected | Observed | Result |
| --- | --- | --- | --- |
| Portable copy | All links remain inside the app; invalid links fail | Relative symlinks preserved; regression test rejects an external link; all 18 installed links resolve internally, none broken. [Audit](../../evidence/2026-10-07T114528Z-desktop-portable/portability.json) | Passed |
| Build/tests | TypeScript/production build and tests pass | Rebuild passed; 175 tests passed, no failures/skips; existing chunk-size advisory remains | Passed |
| Packaged lifecycle | Minimal PATH startup, single instance, normal/forced Quit and durable restart | Final [lifecycle rerun](../../evidence/2026-10-07T114528Z-desktop-portable/desktop-lifecycle.json) passed every selected scenario | Passed |
| Installation update | Existing desktop data remains canonical | Installer reused the Application Support database without replacing it; original 22-table import audit retained in the prior run | Passed |
| Signature/identity | Installed artifact matches build | Deep strict ad-hoc signature verification and signed executable comparisons passed | Passed |
| Final native startup | User can open the app with healthy services | Native Jobs screen loaded; [status](../../evidence/2026-10-07T114528Z-desktop-portable/desktop-installed-final.json) shows API 200, fresh worker heartbeat, Codex gpt-5.6-sol/high ready, schedules enabled and X at 30/1,000 usage | Passed |

## Limits and follow-up

Native edit/download/close/reopen interactions and original migration checks remain in the prior report, not presented as newly exercised here. The wrapper input is unchanged by checksum. Real model generation and explicit live-provider checks were not selected; existing configured schedules resume on launch.

The app is installed under the user's Applications directory and intentionally left running. Original private appdata remains intact. Local ad-hoc signing, other-platform/OS limits and the existing synthetic empty-education LaTeX issue remain as recorded previously. No Unraid/cloud deployment occurred.
