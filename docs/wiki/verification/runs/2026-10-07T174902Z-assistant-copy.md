---
title: Assistant copy cleanup — 8 October 2026
section: Verification runs
updated: 2026-10-08
result: Passed
---
# Assistant copy cleanup — 8 October 2026

## Scope

[FEAT-assistant](../../features/assistant.md): remove the composer keyboard hint and page-context/model strip, retain internal context and existing keyboard behavior. Confirm and document the [desktop data locations](../../features/desktop.md#data-locations).

## Build and environment

Revision `4ec343f72bb38c1839cc7dd67c94dd7eee08d078`, dirty tree on macOS arm64. [Source and asset fingerprints](../../evidence/2026-10-07T174902Z-assistant-copy/build-identity.json). Isolated Playwright Chromium used a fictional profile, temporary SQLite database, disabled sources/scheduling, no worker and no model inference. The local timestamp is 8 October; the run ID uses UTC. Desktop packaging retains prior uncommitted UI changes.

## Results

| Scenario | Expected | Observed | Result |
| --- | --- | --- | --- |
| Removed copy | No context/model strip or keyboard hint | Both absent from the rendered Assistant drawer | Passed |
| Header geometry | Preserve exact shared header height | Both headers remained 58px at 1440×900, 900×540 and 390×844 in both themes | Passed |
| Composer | Send aligned right; newline shortcut unchanged | Send right edge matched its action container; Shift+Enter produced a newline in the actual editor | Passed |
| Internal context | Removing labels does not remove request context | Sent synthetic text locally; request still contained context.page = saved, endpoint returned 202 and Stop appeared; no inference started | Passed |
| Build/install | Updated app runs matching frontend | TypeScript/Vite/native packaging, install, signature verification, all asset hashes and served-index comparison passed; API and worker healthy | Passed |
| Data-location answer | Describe actual installed storage without exposing contents | Confirmed canonical Application Support folder, database and top-level storage names; Codex home is separate; WebKit storage and native preferences paths exist | Passed |

[Sanitized browser results](../../evidence/2026-10-07T174902Z-assistant-copy/browser-checks.json) contain zero page errors. [One-off driver](../../evidence/2026-10-07T174902Z-assistant-copy/driver.txt) can be placed as a `.mts` file under `.local-data/verification/` and run with `npx tsx` after building; it cleans its fixture resources.

## Limits and follow-up

The first helper attempt expected HTTP 200 for queued submission, but the endpoint correctly returned its documented 202. Correcting that test expectation produced a passing rerun with no product changes. Native interactive verification remains limited by the earlier computer-automation outage; the installed frontend matches the browser-tested assets. Model generation, document editing and unrelated workflows were not selected. No raw credentials, candidate evidence or application records were copied into this report.

Existing appdata remains in place and the native app is running. The usual Vite chunk-size advisory remains. No commit was created.
