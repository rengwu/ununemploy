---
title: Assistant consolidation and Jev retirement
section: Verification
updated: 2026-10-16
result: Passed
---
# Assistant consolidation and Jev retirement

## Scope

Items 4–5 of the [approved lean plan](../../journal/2026-10-16-lean-cleanup.md): one conversation processor and retirement of executable Jev code with retained data. Relevant features: [FEAT-assistant](../../features/assistant.md), [FEAT-profile](../../features/profile.md), [FEAT-jev](../../features/jev.md), and [FEAT-backups](../../features/backups.md).

## Build and environment

Revision `4ec343f72bb38c1839cc7dd67c94dd7eee08d078`, dirty tree including unrelated pre-existing changes. The [source manifest](../../evidence/2026-10-16-lean-assistant-jev/source-manifest.json) covers current source/test inputs and deletions; its SHA-256 is recorded in the [outcomes](../../evidence/2026-10-16-lean-assistant-jev/results.json).

Darwin arm64, Node v22.19.0, production Vite build, isolated SQLite databases, fictional profile fixtures and headless Chromium. Assistant browser inference was simulated; its LaTeX/PDF compilation was real. Browser drivers used ephemeral loopback ports and disabled scheduling. No real candidate database, provider collection or model inference was used.

## Results

| Scenario | Expected | Observed | Outcome | Evidence |
| --- | --- | --- | --- | --- |
| Profile-only engine retirement | Old API writes unavailable, shared assistant processes profile edits | Old profile-chat endpoints return 404; assistant action loop validates evidence and commits profile changes | Passed | [29 targeted tests](../../evidence/2026-10-16-lean-assistant-jev/results.json) |
| Legacy turn preservation | Retain IDs, messages, states, revisions and history; unfinished work can continue | Migration fixtures cover complete, queued, running, paused, failed, cancelled and conflict states; completed history stays unchanged, pending requests process/retry through assistant | Passed | [Tests](../../evidence/2026-10-16-lean-assistant-jev/results.json) |
| Jev retirement | No runtime/API/UI capabilities; preserve stored data and baseline matching | Removed endpoints return 404; old environment key/enabled settings cannot activate inference; stored credential file, cached/queued assessments, settings and counters unchanged | Passed | [20 Jev/backup/query tests](../../evidence/2026-10-16-lean-assistant-jev/results.json) |
| Assistant UI | Overlay, drafts, profile/document edits and cancellation continue | Existing driver passed onboarding, unchanged page layout, navigation/reload drafts, actual LaTeX/PDF edits, job links, cancellation, unsaved edits and responsive checks | Passed | [Browser outcomes](../../evidence/2026-10-16-lean-assistant-jev/results.json) |
| Jev UI | No controls or attribution at desktop/mobile widths | Settings and job Match views contain no Jev controls or labels with a retained fake key and old enabled settings | Passed | [Browser outcomes](../../evidence/2026-10-16-lean-assistant-jev/results.json) |
| Regression/build | Remaining suite and production build succeed | 184/184 tests and TypeScript/Vite build passed | Passed | [Outcomes](../../evidence/2026-10-16-lean-assistant-jev/results.json) |

## Attempts and limits

One initial migration-test assertion compared a SQLite null-prototype row with a plain object. The assertion was corrected and the targeted 29-test suite passed; the earlier harness failure is retained in the outcomes file. The old 17-test Jev implementation suite was removed with the obsolete runtime, and one legacy migration test was added: the total changed from 200 to 184.

Reproduce with `npm test`, `npm run build`, `npx tsx scripts/verify-assistant-ui.ts` and `npx tsx scripts/verify-jev-ui.ts`. Drivers close their own browser/API and remove temporary databases. Raw logs and synthetic screenshots remain under local verification paths outside the shareable wiki.

The installed native app was not rebuilt or replaced. Real Codex authentication/inference, live providers and Unraid deployment were not selected. Jev data remains in migration/storage/archive compatibility paths; this work does not reconcile historical provider billing. Cover-letter editing/export choices are pending a separate grill form.
