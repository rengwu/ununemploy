---
title: Assistant header alignment — 7 October 2026
section: Verification runs
updated: 2026-10-07
result: Passed
---
# Assistant header alignment — 7 October 2026

## Scope

[FEAT-assistant](../../features/assistant.md): match the drawer header to the outside page header exactly. Only height, border alignment and containment of controls are selected.

## Build and environment

Revision `4ec343f72bb38c1839cc7dd67c94dd7eee08d078`, dirty tree. [Source and frontend asset fingerprints](../../evidence/2026-10-07T130816Z-assistant-header/build-identity.json). macOS arm64; isolated Playwright Chromium, fixture profile, temporary SQLite database, disabled sources/scheduling and no model turn. Desktop packaging includes the prior uncommitted UI changes.

## Results

| Scenario | Expected | Observed | Result |
| --- | --- | --- | --- |
| Desktop, short window and mobile, both themes | Header top, bottom and height match | At 1440×900, 900×540 and 390×844 in light/dark, both headers have top 0, bottom 58 and height 58 CSS pixels; [measurements](../../evidence/2026-10-07T130816Z-assistant-header/geometry.json) | Passed |
| Header controls | New chat/Hide controls fit inside header | Controls remain vertically inside the 58px header at all six combinations; no page errors | Passed |
| Build and installation | Updated signed app runs matching frontend | TypeScript/Vite/native build, install, codesign verification and comparison of all installed frontend assets passed; running index matches; API and worker healthy | Passed |

## Recipe and limits

The local one-off [geometry driver](../../evidence/2026-10-07T130816Z-assistant-header/driver.txt) is retained as text for reproducibility. Execute it as a `.mts` file under `.local-data/verification/` with `npx tsx` after building. It opens the real assistant control, measures both headers and cleans its isolated database and browser.

The first harness attempt failed before measuring geometry because the TypeScript loader injected an unavailable helper into a browser-evaluated nested function. The driver was corrected to use locator bounding boxes and rerun successfully without product changes. This was a test-harness error, not an observed layout failure.

Native interactive checks remain unavailable due to the earlier computer-automation outage; the installed frontend matches the browser-verified build. Assistant generation, document edits and unrelated UI workflows were not rerun for this CSS-only change. Existing appdata is retained and the Mac app is running. The earlier Vite chunk-size advisory remains. No commit was created.
