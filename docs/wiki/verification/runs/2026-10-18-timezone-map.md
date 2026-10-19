---
title: Timezone map and offset slider
section: Verification
updated: 2026-10-18
result: Passed
---
# Timezone map and offset slider

## Scope and build

[FEAT-job-inbox](../../features/job-inbox.md): the user requested highlighted countries in the timezone picker and confirmed that the offset slider should shift the matching window and update job results. Selected checks cover offline map rendering, the shared country predicate, width-preserving bounded shifts, pointer/keyboard input, persistence, error recovery, responsive appearance and the installed macOS app.

Dirty base `169dca657a18b142fbcfabba2e965d9358c972c6`, identified by the [source manifest](../../evidence/2026-10-18-timezone-map/source-manifest.json). macOS arm64, Node 22.19.0, existing Base UI Slider, Chromium browser fixtures and native WKWebView. The earlier inbox/timezone changes remain in this tree; Pi evaluation is separate from the installed runtime. Natural Earth map provenance is in the [geography reference](../../reference/geography.md).

## Results

| Scenario | Expected | Observed | Outcome |
| --- | --- | --- | --- |
| Country map and API agreement | Use the server's current offset sets, including DST and multi-zone countries | 21 focused tests passed; shared array/set matching agrees across winter/summer fixtures, API returns Malaysia +08 and Nepal +05:45 | Passed |
| Selection highlights | Country colors track the two-handle range | +05:45 through +08 highlights Malaysia, Nepal and Singapore, excludes US; fixture results contain Malaysia/Nepal | Passed |
| Offset shifts | Preserve width and update both highlights and results | Pointer drag preserves 135-minute width; +01:00 shifts endpoints to +06:45/+09, removes Nepal's highlight and leaves Malaysia's job | Passed |
| UTC endpoints and full width | Clamp without wrapping or shrinking; disable impossible movement | Home/End yield −12/−09:45 and +11:45/+14; full-range and Clear disable offset | Passed |
| Persistence and accessibility | Keep actual shifted range through reload/Saved; keyboard and Escape work | Reload/Saved retain +06:45/+09 and one job; reopening resets adjustment offset to zero; Escape returns trigger focus | Passed |
| Appearance and viewport | Map and controls fit desktop/mobile, light/dark | 1280×850 and 390×844 captures inspected; popup stays inside viewport | Passed |
| Map failure and retry | Avoid false highlights when offset lookup fails | Injected 503 hides map; Retry map restores it after successful response; no browser exceptions | Passed |
| Production packaging | Typecheck, frontend and native build succeed | Production build passed; map is an on-demand chunk without a new package dependency; native build passed | Passed |
| Native update and controls | Preserve personal records and expose working map/offset controls | Database/config hashes unchanged; 18 built/installed files match and strict code signature passes. WKWebView exposes map description and three sliders; narrowing enables offset, Left shifts both endpoints by −15 minutes. Clear restores unrestricted results. | Passed |

[Browser checks](../../evidence/2026-10-18-timezone-map/results.json), [focused test/build results](../../evidence/2026-10-18-timezone-map/unit-results.json), [light screenshot](../../evidence/2026-10-18-timezone-map/desktop.png), [dark screenshot](../../evidence/2026-10-18-timezone-map/dark.png), [mobile screenshot](../../evidence/2026-10-18-timezone-map/mobile.png), [installation checks](../../evidence/2026-10-18-timezone-map/install-results.json), and [native controls](../../evidence/2026-10-18-timezone-map/native-controls.json).

## Limits and cleanup

The map shows whole countries that have any matching timezone. It does not draw political timezone boundaries, infer working hours, or make a region/Worldwide-only posting eligible. Small-scale outlines are geographic context; ISO-less outlines cannot match. Offset shifts stop at supported UTC limits rather than creating a wrapped range. This is a map of the matching window, not a 3D globe renderer.

Synthetic browser fixtures disable collection/inference and block external requests. Their temporary database, server and browser were removed. Evidence contains only synthetic job records and sanitized native observations. The installed app retains canonical records and authentication, and was left running with the test filter cleared. Windows interaction, touch hardware, screen-reader narration and a fresh full regression suite were not selected for this UI increment; the earlier full-suite result remains in the [timezone filter run](2026-10-18-timezone-filter.md).
