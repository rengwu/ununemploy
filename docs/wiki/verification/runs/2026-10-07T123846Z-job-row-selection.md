---
title: Full job-row selection — 7 October 2026
section: Verification runs
updated: 2026-10-07
result: Passed
---
# Full job-row selection — 7 October 2026

## Scope

[FEAT-job-inbox](../../features/job-inbox.md): clicking any part of a job row selects its detail pane in Jobs and Saved. Selected checks cover non-title areas, Seen persistence/filtering, keyboard activation, mobile details and no accidental save/generation.

## Build and environment

Revision `4ec343f72bb38c1839cc7dd67c94dd7eee08d078`, dirty tree on macOS arm64. [Source and frontend asset fingerprints](../../evidence/2026-10-07T123846Z-job-row-selection/build-identity.json). `npm run desktop:build -- --reuse-runtimes` passed TypeScript, Vite and native packaging. `npx tsx scripts/verify-seen-ui.ts` used isolated temporary SQLite data, fictional jobs/profile, disabled sources/scheduling and Playwright Chromium at 1440×1000 and 390×844. Fixtures were cleaned up by the driver; no live job state was used for interaction checks.

## Results

[Browser results](../../evidence/2026-10-07T123846Z-job-row-selection/browser-checks.json) record all selected checks with zero page errors.

| Scenario | Expected | Observed | Result |
| --- | --- | --- | --- |
| Full row target | Company, location, match, date and blank padding open the chosen job | Each area selected the correct title and detail heading | Passed |
| Existing title/keyboard | Title click, Enter and Space still select | Title clicks and both keyboard keys opened the correct details through the row handler | Passed |
| Seen tracking | Deliberate opens record Seen; initial preview does not | Company click recorded Seen, Unseen removed the row but retained details, filter/reload persisted Seen, simulated failure and keyboard retry recovered | Passed |
| Mobile | Row text opens details and records Seen | Location click at 390px opened the correct job; list/detail navigation worked without horizontal overflow | Passed |
| Saved | Non-title click selects a saved posting | Seeded Saved fixture location opened its details; no generation tasks queued | Passed |
| Side effects | Selection does not save jobs or queue letters | Jobs remained new until explicit fixture seeding; zero tasks throughout | Passed |
| Installed app | Built UI installed with healthy local services | Guarded shutdown, installation, relaunch, signature verification and asset comparison passed; API health reports a fresh worker heartbeat | Passed |

## Limits and follow-up

Native computer automation still reports a pipe startup failure, so interactive checks used the project's isolated browser verifier; this report does not claim a new WKWebView click check. The installed frontend matches the exercised build byte-for-byte. Full application regression, unsaved-note cancellation and live collection/model calls were not selected. The unchanged selection function continues to provide the existing unsaved-edit guard. Earlier sidebar/theme interaction limits remain in their separate report.

The installed app is running with existing canonical appdata. The existing Vite chunk-size advisory remains. No commit was created for these UI changes.
