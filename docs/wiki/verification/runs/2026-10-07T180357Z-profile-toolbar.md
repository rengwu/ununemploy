---
title: Profile toolbar consolidation — 8 October 2026
section: Verification runs
updated: 2026-10-08
result: Passed
---
# Profile toolbar consolidation — 8 October 2026

## Scope

[FEAT-profile](../../features/profile.md): combine readiness, version selection/restoration and assistant action above the facts; remove the redundant Profile facts heading and separate footer. Selected checks cover responsive layout, restore and readiness variants.

## Build and environment

Revision `4ec343f72bb38c1839cc7dd67c94dd7eee08d078`, dirty tree on macOS arm64. [Source and frontend fingerprints](../../evidence/2026-10-07T180357Z-profile-toolbar/build-identity.json). Isolated Playwright Chromium used fictional profile revisions, a temporary database, disabled sources and no worker/model inference. A scheduling flag was changed only inside the fixture to exercise status text. The local date is 8 October; the run ID is UTC. Earlier uncommitted UI changes remain in this build.

## Results

| Scenario | Expected | Observed | Result |
| --- | --- | --- | --- |
| Desktop layout | One toolbar above the facts | At 1440×900, readiness and all actions share a line; redundant heading/footer absent; facts begin immediately below the toolbar | Passed |
| Mobile and themes | Controls wrap within the toolbar without horizontal overflow | At 390×844 all controls remained inside the toolbar; both light/dark desktop/mobile checks passed | Passed |
| Restore controls | Disabled until selected; restore preserves revision history | Selected the original fixture revision on mobile; Restore returned 200, restored its facts and created a new revision | Passed |
| Assistant action | Edit with assistant opens global drawer | Actual button opened the composer and Hide closed it | Passed |
| Status variants | Preserve useful paused/incomplete messages | Paused scheduling text remained visible; empty profile displayed missing fields and Build profile without page overflow | Passed |
| Installed update | Signed app runs matching frontend | TypeScript/Vite/native build, install, signature verification and asset comparisons passed; running API/worker healthy | Passed |

[Measured layouts and checks](../../evidence/2026-10-07T180357Z-profile-toolbar/browser-checks.json) contain zero page errors. [Desktop screenshot](../../evidence/2026-10-07T180357Z-profile-toolbar/desktop.png) and [mobile screenshot](../../evidence/2026-10-07T180357Z-profile-toolbar/mobile.png) contain only reviewed synthetic facts.

## Recipe and limits

The one-off [driver](../../evidence/2026-10-07T180357Z-profile-toolbar/driver.txt) can be saved as a `.mts` file under `.local-data/verification/` and executed with `npx tsx` after building. It cleans its temporary database/browser. The initial measurement attempt compared rectangles across the sidebar's responsive transition. Waiting for the mobile page width to settle fixed the harness; the same product build passed the rerun.

The native frontend matches the tested browser build; no new native interactive check is claimed while computer automation is unavailable. Inference quality, restore-conflict recovery, live scans and unrelated workflows were not selected. User facts and document versions were not modified by these checks. Existing appdata is retained and the Mac app is running. The existing Vite chunk-size advisory remains; no commit was created.
