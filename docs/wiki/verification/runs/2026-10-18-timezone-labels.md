---
title: Effective timezone endpoint labels
section: Verification
updated: 2026-10-18
result: Passed
---
# Effective timezone endpoint labels

## Scope and build

[FEAT-job-inbox](../../features/job-inbox.md): endpoint labels must include the independent Offset while handle positions remain unchanged. The closed trigger, accessible slider values and map description use the same effective range. Filtering and persisted coordinates are unchanged.

macOS arm64, Node 22.19.0, Chromium fixtures and native WKWebView. Dirty base `169dca657a18b142fbcfabba2e965d9358c972c6`; [changed source fingerprint](../../evidence/2026-10-18-timezone-labels/source-manifest.json). Earlier work remains in the tree as recorded in the [wrapping-offset run](2026-10-18-timezone-wrap.md).

## Results

| Scenario | Expected and observed | Outcome |
| --- | --- | --- |
| Effective labels | +05:45/+08 with +01 rotation shows +06:45/+09 in visible labels, accessible values and the reloaded trigger; stored coordinates stay 345/480 | Passed |
| UTC wrapping | Positive/negative rotation, fractional endpoints and the unchanged full-range labels checked; −05:15/00 with −12 rotation displays +06:45/+12 | Passed |
| Existing browser behavior | Pointer/keyboard input, map matches, wrap geometry, Saved/reload persistence, mobile bounds, light/dark rendering, error/retry and Clear pass | Passed |
| Production update | TypeScript/Vite and native build pass; installed files match the build and strict signature passes; database/configuration hashes remain unchanged | Passed |
| Native confirmation | Restored user range/offset. WKWebView shows +06:45/+12 labels and accessible values while numeric handle coordinates remain unchanged | Passed |

[Browser checks](../../evidence/2026-10-18-timezone-labels/results.json), [mobile capture](../../evidence/2026-10-18-timezone-labels/mobile.png), [installation checks](../../evidence/2026-10-18-timezone-labels/install-results.json), and [native observations](../../evidence/2026-10-18-timezone-labels/native-controls.json).

## Limits and cleanup

This is display formatting only; the previous circular matching contract remains in force. Browser fixtures block external requests and disable scanning/inference; temporary browser/server/database resources were removed. Evidence contains synthetic jobs and sanitized checks. The installed app is running with the prior selection restored. Windows, touch hardware and screen-reader narration were not selected for this change; no fresh full-suite result is claimed.
