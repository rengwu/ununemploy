---
title: Redundant profile assistant button — 8 October 2026
section: Verification
updated: 2026-10-08
result: Passed
---
# Redundant profile assistant button — 8 October 2026

## Scope

[FEAT-profile](../../features/profile.md): remove Edit with assistant from the ready-profile toolbar as requested. The top-right assistant button remains the entry point; incomplete profiles retain Build profile. Preserve version restoration, readiness states and responsive layout.

## Build and environment

Revision `4ec343f72bb38c1839cc7dd67c94dd7eee08d078`, dirty tree with pre-existing changes, macOS arm64 and Node v22.19.0. [Selected source/frontend and desktop build identity](../../evidence/2026-10-07T183349Z-profile-button/build-identity.json) records content fingerprint `4900aa7e5f9e8f3c25c4375023f5eddbce27bc37616265bf838fd7e03c5a15e4`.

The [adapted existing toolbar driver](../../evidence/2026-10-07T183349Z-profile-button/driver.txt) ran from `.local-data/verification/profile-button-driver.mts` using Chromium, a temporary database and fictional profile revisions. Sources and inference were disabled. It cleaned up its browser, server and database. No real profile was edited or restored.

## Results

| Scenario | Expected | Observed | Result |
| --- | --- | --- | --- |
| Ready profile | Redundant button absent; version actions retained | Edit with assistant count was zero at desktop/mobile sizes in light/dark themes; restore controls remained in the toolbar without overflow | Passed |
| Header assistant | Composer remains accessible | Header button opened the composer; Escape closed it and returned focus | Passed |
| Existing profile actions | Restore still creates a revision; readiness remains useful | Fixture restoration returned 200 and advanced the revision; paused scanning and incomplete profile messages remained visible, including Build profile | Passed |
| Build and installed app | New frontend builds and is available in the native app | TypeScript/Vite and desktop build/install passed; installed assets match the tested build and native User profile shows the header assistant button without Edit with assistant | Passed |

[Browser checks](../../evidence/2026-10-07T183349Z-profile-button/browser-checks.json), [desktop fixture](../../evidence/2026-10-07T183349Z-profile-button/desktop.png), [mobile fixture](../../evidence/2026-10-07T183349Z-profile-button/mobile.png) and [installation checks](../../evidence/2026-10-07T183349Z-profile-button/installation.json) record the selected outcomes. No browser errors occurred.

## Limits and follow-up

This is a conditional button removal; no backend or profile-generation behavior changed. Live inference and the full regression suite were not rerun for this change. The existing Vite chunk-size advisory remains. The normal app quit/install/reopen retained canonical appdata; native verification was read-only.
