---
title: Cursor-inspired UI redesign
section: Verification
updated: 2026-10-16
result: Passed
---
# Cursor-inspired UI redesign

## Scope

Replace Kumo with the [accepted Cursor/Clarity-derived UI](../../decisions/dashboard-ui.md) across [Jobs/Saved](../../features/job-inbox.md), [profile](../../features/profile.md), [master CV](../../features/master-cv.md), [cover letters](../../features/cover-letters.md), Sources/Settings, [backups](../../features/backups.md), [assistant](../../features/assistant.md) and the [native app](../../features/desktop.md). Selected scenarios cover component behavior, themes, responsive layout, existing editing/draft guards, packaging and data-preserving installation. No provider or model-runtime change was intended.

## Build and environment

Darwin arm64, Node v22.19.0, React/Vite production assets, Playwright Chromium, Cocoa/WKWebView. Tested dirty revision `16c096f341943c4321886bb905366bb6056ae475`; the [source identity](../../evidence/2026-10-16-cursor-redesign/source-identity.json) fingerprints changed frontend/native files, manifests and relevant drivers, including untracked shared controls. [Native build metadata](../../evidence/2026-10-16-cursor-redesign/native-build.json) identifies bundled runtimes and wrapper; the [installed manifest](../../evidence/2026-10-16-cursor-redesign/installed-manifest.json) verifies 94 installed files against the built package.

The browser drivers use temporary synthetic databases and ephemeral loopback ports; scans are disabled, inference is simulated, and external browser requests are blocked. LaTeX/PDF rendering is real. The native fixture also disables scans/inference and removes its temporary data after Quit. The installed app retains its canonical data outside the bundle. Raw database digests and live UI observations remain private.

Commands: `npm test`, `npm run desktop:test`, `npm run build`, `npx tsx scripts/verify-ui-design.ts`, `npx tsx scripts/verify-assistant-ui.ts`, `npx tsx scripts/verify-cv-workflow.ts`, `npx tsx scripts/verify-backup-ui.ts`, `npx tsx scripts/verify-jev-ui.ts`, `npx tsx scripts/verify-seen-ui.ts`, `npm run desktop:build -- --reuse-runtimes`, `npx tsx scripts/verify-desktop.ts`, `npm run desktop:install`, and installed deep/strict code-signature verification. The core suite ran during migration; subsequent changes were frontend layout/labels, native chrome, drivers and documentation. Final production/native builds and the design driver used the final UI source.

## Results

| Scenario | Expected | Observed | Outcome | Evidence |
| --- | --- | --- | --- | --- |
| Components/build | Remove Kumo while preserving app contracts | No Kumo imports/tokens/dependency; TypeScript/Vite build, 184 core tests and Go race checks pass | Passed | [Results](../../evidence/2026-10-16-cursor-redesign/results.json), [source identity](../../evidence/2026-10-16-cursor-redesign/source-identity.json) |
| Theme and Settings | System follows OS; explicit selection persists; section changes retain edits | Dark/light OS changes, explicit override/reload, mounted Settings edits and saved interval all verified | Passed | [Design checks](../../evidence/2026-10-16-cursor-redesign/checks.json), [Settings light](../../evidence/2026-10-16-cursor-redesign/settings-light.png), [dark](../../evidence/2026-10-16-cursor-redesign/settings-dark.png) |
| Menus, dialogs and filters | Keyboard/pointer input, Escape/focus return and selected values survive navigation/reload | Location search/select/clear, keyboard selection, filter Active indicator, modal cancellation and focus return pass | Passed | [Checks](../../evidence/2026-10-16-cursor-redesign/checks.json), [filters](../../evidence/2026-10-16-cursor-redesign/filters-dark.png), [source dialog](../../evidence/2026-10-16-cursor-redesign/source-dialog-light.png) |
| Row selection and Seen | Preserve row/keyboard actions and independent Seen status | Company/location/match/date/padding, Enter/Space, failed mutation/retry, reload and mobile/Saved paths pass | Passed | [Seen checks](../../evidence/2026-10-16-cursor-redesign/seen-checks.json) |
| Inbox states | Distinguish loading, errors and empty results; recover through Retry | Held response, synthetic 503, Retry and empty search each produce the expected state | Passed | [Loading](../../evidence/2026-10-16-cursor-redesign/jobs-loading-light.png), [error](../../evidence/2026-10-16-cursor-redesign/jobs-error-light.png), [empty](../../evidence/2026-10-16-cursor-redesign/jobs-empty-light.png) |
| Assistant/document behavior | Stable overlay, persistent drafts, real saves/previews, dirty guards and cancellation | Existing assistant and letter browser workflows pass; no external requests or profile/master mutation from letter edits | Passed | [Results](../../evidence/2026-10-16-cursor-redesign/results.json), [letter checks](../../evidence/2026-10-16-cursor-redesign/letter-checks.json), [assistant](../../evidence/2026-10-16-cursor-redesign/assistant-dark.png), [letter](../../evidence/2026-10-16-cursor-redesign/saved-letter-light.png), [CV](../../evidence/2026-10-16-cursor-redesign/cv-light.png) |
| Backups and retained boundaries | ZIP flows and removed-feature behavior survive new controls | Export, invalid import preservation, successful overwrite/reload, LaTeX-only CV, and absent Jev UI pass | Passed | [Backup checks](../../evidence/2026-10-16-cursor-redesign/backup-checks.json), [results](../../evidence/2026-10-16-cursor-redesign/results.json) |
| Responsive/focus behavior | No page overflow; navigation, details and assistant remain usable | 390px browser checks, mobile modal navigation, reduced motion and 720px native-header inset geometry pass | Passed | [Mobile Jobs](../../evidence/2026-10-16-cursor-redesign/jobs-mobile.png), [detail](../../evidence/2026-10-16-cursor-redesign/detail-mobile.png), [Settings](../../evidence/2026-10-16-cursor-redesign/settings-mobile.png), [assistant](../../evidence/2026-10-16-cursor-redesign/assistant-mobile.png), [minimum native geometry](../../evidence/2026-10-16-cursor-redesign/native-header-minimum-browser.png) |
| Native chrome and lifecycle | Unified header retains real controls and process behavior | Native fixture header/assistant/sidebar interaction and double-click zoom observed; automated startup, single instance, Quit, relaunch, forced-exit cleanup and persistence pass | Passed | [Native observations](../../evidence/2026-10-16-cursor-redesign/results.json), [lifecycle](../../evidence/2026-10-16-cursor-redesign/native-lifecycle.json) |
| Installation | Replace code without changing personal records; reopen correct build | All 24 canonical table counts/digests unchanged before relaunch; SQLite integrity OK; 94 installed files match; signature valid; health 200; Dark preference retained; app left on Jobs | Passed | [Results](../../evidence/2026-10-16-cursor-redesign/results.json), [installed identity](../../evidence/2026-10-16-cursor-redesign/installed-manifest.json) |

## Repairs during verification

An early assistant run exposed a missing flex constraint that pushed the composer outside the viewport in long conversations. Restoring the thread's constrained flex layout resolved it; the complete assistant driver then passed. The Seen driver was adjusted to inspect the selected row background (the redesigned table paints the row rather than each cell). Collapsed navigation now explicitly hides its accessibility subtree as well as preventing interaction. Native minimum-width CSS retains the app-name area so its drag region cannot cover the mobile navigation button.

One intermediate design run overlapped a rebuild and requested deleted lazy chunks; the final run waited for a complete build. Another driver assumed a newly navigated mobile inbox already showed detail; it was corrected to exercise the actual list-first mobile behavior. The design fixture now seeds a valid starter LaTeX document so its screenshot verifies a rendered preview rather than an invalid empty-section fixture.

## Limits and follow-up

The existing large-inbox refresh timeout remains a known issue, observed in the previous installed build before replacement and documented in [open follow-up](../../discussions/open-questions.md). This redesign does not claim a latency fix; large-inventory performance is outside this report's passing scope. The installed health check establishes API/worker readiness, not query latency.

Live Codex allowance/authentication, authenticated providers, native download/Open-panel flows, Intel/other macOS releases and Unraid deployment were not selected. Native ordinary window dragging uses Cocoa's existing drag operation; double-click zoom and safe interactive regions were directly checked. Mobile geometry was exercised in Chromium; no physical touch device was available. The live-data matching/location drivers were updated for the Filters disclosure but were not run against private inventory; the isolated design driver checks the changed filter interactions instead.

No private candidate facts, application records, credentials, live screenshots or raw local logs are in this report. All retained screenshots use fictional fixtures. Earlier Kumo reports remain historical evidence.
