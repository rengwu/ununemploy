---
title: Country timezone range filter
section: Verification
updated: 2026-10-18
result: Passed
---
# Country timezone range filter

## Scope and build

[FEAT-job-inbox](../../features/job-inbox.md): add an inclusive country UTC-offset range next to Location in Jobs and Saved. macOS arm64, Node 22.19.0 (ICU timezone rules 2025b), IANA country mapping 2026e, Base UI Slider 1.8.0. Dirty base `169dca657a18b142fbcfabba2e965d9358c972c6`; the [source manifest](../../evidence/2026-10-18-timezone-filter/source-manifest.json) identifies the tested changed/untracked implementation, including the preceding inbox fix. Pi evaluation tooling is separate from the installed runtime.

## Results

| Scenario | Expected | Observed | Outcome |
| --- | --- | --- | --- |
| API and country matching | Inclusive range; multiple country zones; fractional and seasonal offsets | Malaysia UTC+08, India +05:30, Nepal +05:45, Kiribati +14, multi-zone US, UK winter/summer and invalid/unknown input checked | Passed |
| Filter composition | Combine with locations, Jobs/Saved and pagination | API fixtures retain matching countries, reject reversed/out-of-range/non-quarter-hour values and filter Saved; no filter keeps existing behavior | Passed |
| Two-handle slider | Pointer and keyboard control with noncrossing endpoints | Pointer drag, arrows and Page Up/Down set UTC+05:45 through +08:00; only Nepal/Malaysia fixtures remain | Passed |
| Persistence and recovery | Retain selection after reload and navigation; clear restores all | Reload and Saved retain two results; Clear timezone returns all four fixture jobs; Escape restores trigger focus | Passed |
| Responsive interface | Popup and handles remain usable on narrow screens | 1280×850 and 390×844 captures inspected; popup stays within mobile viewport; no page exceptions | Passed |
| Existing regression | Existing workflows still pass | 193 tests passed, one Windows-only test skipped; production TypeScript/Vite and native build passed | Passed |
| Native installation | Update executable/UI while preserving canonical records | Database and configuration unchanged across install; strict signature/file identity checks passed. WKWebView exposed both handles, Arrow Right moved the minimum by 15 minutes, and Clear restored unrestricted results. | Passed |

[Browser results](../../evidence/2026-10-18-timezone-filter/results.json), [desktop screenshot](../../evidence/2026-10-18-timezone-filter/desktop.png), [mobile screenshot](../../evidence/2026-10-18-timezone-filter/mobile.png), [installation evidence](../../evidence/2026-10-18-timezone-filter/install-results.json), and [native controls](../../evidence/2026-10-18-timezone-filter/native-controls.json).

An initial API assertion omitted an existing Taiwan fixture, which correctly matched UTC+08; the expectation was corrected. Browser-driver retries fixed hidden-filter lookup after reload, an ambiguous Saved button and asynchronous focus return. These were fixture/driver corrections; the final described checks passed.

## Limits and cleanup

This is country-level filtering, not city-level scheduling or an inference about required working hours. Any real offset in any resolved country can match. Worldwide/region-only/unknown countries are excluded while active. Current offset rules depend on the bundled Node runtime; political rule changes newer than its tzdb require a runtime update. Snapshot minute expiry refreshes seasonal offsets. No new external runtime service or package dependency was added.

Tests use synthetic jobs and temporary SQLite databases with collection and inference disabled. Their browsers, servers and databases were removed; evidence contains no private candidate or job records. Installed appdata and existing authentication remain in place. Windows native interaction and touch-device interaction were not selected for this Mac run.
