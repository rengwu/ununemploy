---
title: Sidebar controls — 7 October 2026
section: Verification runs
updated: 2026-10-07
result: Untested
---
# Sidebar controls — 7 October 2026

## Scope

[FEAT-job-inbox](../../features/job-inbox.md) shared navigation and appearance: move expand/collapse to the sidebar header and light/dark selection to Settings. The installed [desktop app](../../features/desktop.md) was rebuilt and updated.

## Build and environment

Revision `4ec343f72bb38c1839cc7dd67c94dd7eee08d078`, dirty tree, macOS arm64/WKWebView. [Source and built asset fingerprints, installation comparison and sanitized observations](../../evidence/2026-10-07T122444Z-sidebar-controls/observations.json). Every installed frontend asset matches the built dist; the running loopback server returns the same index. Canonical appdata was reused.

## Results

| Scenario | Expected | Observed | Result |
| --- | --- | --- | --- |
| Build and install | TypeScript, Vite and signed Mac bundle succeed | `npm run desktop:build -- --reuse-runtimes`, `npm run desktop:install` and deep strict codesign verification succeeded; existing chunk-size advisory remains | Passed |
| Expanded header and footer | Toggle beside app name; Settings alone in footer | Native Settings screen visually inspected; accessibility tree places Toggle navigation after app name, before navigation links | Passed |
| Settings appearance and upgrade | Theme selector displays existing preference | Opened Settings using footer button; Appearance contains accessible Theme selector, value Dark, matching pre-update dark mode | Passed |
| Runtime after update | API and worker running | Health returned ok with fresh worker heartbeat | Passed |
| Collapse/expand, keyboard and new theme persistence | Both sidebar states work; changing theme applies and survives reopening | UI automation failed with native pipe startup errors before these interactions; repeated reconnect and fresh session failed; no browser available | Untested |

## Limits and follow-up

Overall Untested records incomplete interaction checks, not an observed app failure. The expanded layout and existing preference after upgrade were observed. Collapsed layout, keyboard toggle activation, switching themes and persistence of a newly selected theme remain to be exercised when UI automation reconnects. Mobile behavior and unrelated settings/scanning were outside this run. No new provider requests were triggered for verification; existing configured services remain running.

No private candidate, application or credential data was copied into evidence. The updated app was left open on Settings with the original dark preference. No new commit was created for this change.
