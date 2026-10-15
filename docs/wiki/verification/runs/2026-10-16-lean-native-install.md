---
title: Lean cleanup native installation
section: Verification
updated: 2026-10-16
result: Failed
---
# Lean cleanup native installation

## Scope

Rebuild, verify, replace and reopen the installed [native app](../../features/desktop.md) with all six [lean cleanup items](../../journal/2026-10-16-lean-cleanup.md). The installation succeeded. The aggregate result is Failed because the real large inbox still displayed a request-timeout warning after reopening; packaging, data preservation, lifecycle and health checks passed.

## Build and environment

Darwin arm64, Node v22.19.0, dirty revision `4ec343f72bb38c1839cc7dd67c94dd7eee08d078`. [Build metadata](../../evidence/2026-10-16-lean-native-install/build.json) records runtime/wrapper identity. The [installed content manifest](../../evidence/2026-10-16-lean-native-install/installed-manifest.json) fingerprints packaged application source, frontend, manifests and wrapper. Every listed installed file matched the verified built bundle. UTC build time falls on 15 October; local journal date is 16 October.

`npm run desktop:build -- --reuse-runtimes` rebuilt current source and production dependencies using the existing compatible generic Node/Codex/Tectonic/browser payload. The full source suite and browser checks are recorded in the preceding [cover-letter run](2026-10-16-lean-cover-letters.md); this pass selected packaging and native behavior rather than repeating those tests.

## Results

| Scenario | Expected | Observed | Outcome | Evidence |
| --- | --- | --- | --- | --- |
| Bundle build/signature | Build current code and verify local signature | TypeScript/Vite, production dependencies, native compile and deep strict code-signature verification passed | Passed | [Build](../../evidence/2026-10-16-lean-native-install/build.json) |
| Native automated checks | Packaging and process lifecycle remain valid | Go race tests and 4 TypeScript desktop tests passed | Passed | [Results](../../evidence/2026-10-16-lean-native-install/results.json) |
| Isolated packaged lifecycle | Startup, duplicate launch, shutdown and persistence work | Minimal-PATH startup, single instance, orderly termination, stable origin, forced-exit cleanup, crash recovery and retained fixture counter/integrity passed | Passed | [Lifecycle](../../evidence/2026-10-16-lean-native-install/lifecycle.json) |
| Installation/data | Replace app without altering canonical records | App was stopped before install. Every database table's row count/content digest matched before and after installation, before relaunch; integrity was OK | Passed | [Results](../../evidence/2026-10-16-lean-native-install/results.json) |
| Installed identity | Installed code equals tested bundle | All recorded files matched; installed deep strict signature verification passed | Passed | [Manifest](../../evidence/2026-10-16-lean-native-install/installed-manifest.json) |
| Reopen/health | Window, API and worker start | Installed window reopened on its existing loopback origin; health endpoint returned success | Passed | [Results](../../evidence/2026-10-16-lean-native-install/results.json) |
| Large inbox refresh | Load current rows without timeout | Initial inbox request timed out. Retry eventually displayed job rows and pagination, but a request-timeout warning remained during refresh | Failed | [Results](../../evidence/2026-10-16-lean-native-install/results.json) |

## Limits and follow-up

The large-inbox loading issue was already documented in [open follow-up](../../discussions/open-questions.md) before this rebuild. It remains unresolved; no performance refactor was included in a packaging request. The new installed bundle is left running. The loopback health check establishes service readiness, not acceptable query latency.

The synthetic lifecycle driver disabled scans/inference and removed its owned processes/database. The user's normal configured services resumed when reopening the installed app. Real generation, provider authentication, native clipboard/PDF Save-panel interaction and Unraid deployment were not selected. No candidate facts, saved-job records, credentials, raw private logs or UI snapshots were copied into this report. Private database fingerprints stay under local verification storage.
