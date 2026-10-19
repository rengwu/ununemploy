---
title: Wrapping timezone offset
section: Verification
updated: 2026-10-18
result: Passed
---
# Wrapping timezone offset

## Scope and build

[FEAT-job-inbox](../../features/job-inbox.md): the user requested rotation through the map seam instead of moving the selected range values. This supersedes the clamped offset in the [initial map run](2026-10-18-timezone-map.md). Offset is now an independent persisted coordinate rotation; filtering and highlighting share 24-hour modular matching.

Dirty base `169dca657a18b142fbcfabba2e965d9358c972c6`, macOS arm64 / Node 22.19.0, Chromium fixture browser and native WKWebView. The [source fingerprint](../../evidence/2026-10-18-timezone-wrap/source-manifest.json) identifies the tested tree, including preceding inbox/timezone work. No package dependency or production AI runtime change was made.

## Results

| Scenario | Expected | Observed | Outcome |
| --- | --- | --- | --- |
| Wrapped matching | Cross the date line, preserve inclusive fractional offsets and country semantics | 23 focused tests passed: date-line overlap, +14/−10 clock equivalence, quarter-hours, multi-zone/DST parity, full range, unknown countries, valid/invalid persisted and API rotation values | Passed |
| Fixed selection during rotation | Offset never modifies either range endpoint | Pointer and keyboard adjustments retain +05:45/+08. A +01 offset removes Nepal and retains Malaysia in both highlights and results | Passed |
| Map seam and complete turn | Map translates and repeats through its horizontal edge | At ±12 hours the map is translated by −360 SVG units and displays identical country matches; US fixture replaces Malaysia, while handles remain fixed | Passed |
| Persistence and clearing | Persist independent offset and range; clear both | Reload and Saved retain +05:45/+08 with +01 offset and one matching job; reopening retains the offset; Clear returns all four fixtures | Passed |
| Responsive rendering and recovery | Country highlights render in both appearances; mobile popup fits; retry recovers | Light/dark, half-turn and 390×844 mobile captures inspected; failure hides the map and Retry restores it; no page exceptions | Passed |
| Builds and installed identity | Build successfully and preserve canonical appdata | TypeScript/Vite and native builds passed. Database/configuration hashes unchanged across installation; 18 built/installed file checks and strict code signature passed | Passed |
| Native behavior and restoration | Rotation works in WKWebView without changing the selection | Offset is enabled even at full width. After restoring the previous user range, ±12 offsets retain both handles and show the same 54 matching countries. Zero offset and the original range were restored afterward | Passed |

[Browser results](../../evidence/2026-10-18-timezone-wrap/results.json), [test/build results](../../evidence/2026-10-18-timezone-wrap/test-results.json), [light screenshot](../../evidence/2026-10-18-timezone-wrap/desktop.png), [dark screenshot](../../evidence/2026-10-18-timezone-wrap/dark.png), [half-turn map](../../evidence/2026-10-18-timezone-wrap/wrapped.png), [mobile screenshot](../../evidence/2026-10-18-timezone-wrap/mobile.png), [installation evidence](../../evidence/2026-10-18-timezone-wrap/install-results.json), and [native observations](../../evidence/2026-10-18-timezone-wrap/native-controls.json).

An initial visual check exposed lost highlight styling when reusing country shapes through SVG `use`. Ordinary repeated country groups replaced that approach; the final screenshots confirm distinct matching colors after rotation. The mobile capture now waits for the lazy map to render before checking its bounds.

## Limits and cleanup

Rotation uses clock positions, not calendar dates: UTC+14 and UTC−10 are equivalent positions. Ranges at least 24 hours wide include every recognized country; a null range remains unrestricted regardless of the map rotation. The geographic map is not an exact drawing of timezone boundaries. Country-level matching still accepts any actual zone in a listed country.

Synthetic fixtures disable inference and collection, block external requests, and remove their temporary server/browser/database. Wiki evidence contains synthetic jobs and sanitized native checks only. The native app remains running with the previous user selection restored and personal records/authentication preserved. Windows interaction, touch hardware and screen-reader narration were not selected for this Mac increment; no new full-suite claim is made.
