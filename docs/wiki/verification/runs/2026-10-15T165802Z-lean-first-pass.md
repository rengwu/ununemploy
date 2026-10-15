---
title: Lean cleanup first pass
section: Verification
updated: 2026-10-16
result: Passed
---
# Lean cleanup first pass

## Scope

The [accepted plan](../../journal/2026-10-16-lean-cleanup.md) removes WebMCP, retires legacy CV writes with API-only historical read/download access, and removes/hides unimplemented source placeholders while preserving records.

Selected features: [FEAT-job-inbox](../../features/job-inbox.md), [FEAT-master-cv](../../features/master-cv.md), [FEAT-profile](../../features/profile.md), [FEAT-assistant](../../features/assistant.md), [FEAT-discovery](../../features/discovery.md).

## Build and environment

Revision `4ec343f72bb38c1839cc7dd67c94dd7eee08d078`, with pre-existing unrelated dirty-tree work retained. The [source manifest](../../evidence/2026-10-15T165802Z-lean-first-pass/source-manifest.json) includes relevant tracked/untracked source and tests, and marks deleted WebMCP code. Manifest SHA-256: `fe8fa7efef8ee9cf90d311bb986d7c2c37f6be29f78bb05e99f20cc9915c6ab8`.

Darwin arm64, Node v22.19.0, production Vite build, headless Chromium and ephemeral loopback API. Tests use temporary SQLite databases and fictional fixtures. The browser fixture has scheduling and AI disabled with no worker. No live candidate data, real inference or source collection was used.

## Results

| Scenario | Expected | Observed | Outcome | Evidence |
| --- | --- | --- | --- | --- |
| WebMCP removal / Jobs UI | No tool registration; Jobs loads | Stub registry received zero registrations; Jobs loaded without page errors | Passed | [Browser](../../evidence/2026-10-15T165802Z-lean-first-pass/browser.json) |
| Legacy CV writes | No startup/profile/assistant legacy version creation; old editors retired | Targeted tests cover empty startup, unchanged legacy rows, retired routes returning 404, profile conflicts and rollback | Passed | [Tests](../../evidence/2026-10-15T165802Z-lean-first-pass/results.json) |
| Historical resumes | Read/download access remains | API list/read preserved original content; HTML, DOCX and PDF exports succeeded without writes | Passed | [Tests](../../evidence/2026-10-15T165802Z-lean-first-pass/results.json) |
| Sources and retention | No default placeholders or scanning; retain existing records | 58 default sources / 26 public boards; creation rejected; manual/scheduled scans skip retained enabled placeholders; jobs, evidence, counters and runs unchanged | Passed | [Tests](../../evidence/2026-10-15T165802Z-lean-first-pass/results.json) |
| Sources UI | Hide placeholders, offer supported boards | Sources and Add source exclude all three placeholders; Hiredly remains available | Passed | [Browser](../../evidence/2026-10-15T165802Z-lean-first-pass/browser.json) |
| Regression / build | Existing behavior and build succeed | 200/200 tests and TypeScript/Vite production build passed | Passed | [Outcomes](../../evidence/2026-10-15T165802Z-lean-first-pass/results.json) |

## Attempts and corrections

Earlier checks failed because a new test used a nonexistent evidence-table name, one old job-query test called the intentionally retired endpoint, and the browser driver read options before rendering. The [outcomes](../../evidence/2026-10-15T165802Z-lean-first-pass/results.json) preserve those failures and corrections. After correction, source tests passed 27/27, the full suite passed 200/200, and the browser check passed. These were harness failures, not established product regressions.

## Reproduction and limits

Run `npm test` and `npm run build`. Targeted checks: `npx tsx --test tests/system.test.ts tests/profile-chat.test.ts tests/assistant.test.ts tests/cover-letters.test.ts` and `npx tsx --test tests/public-boards.test.ts tests/additional-sources.test.ts tests/integration-rules.test.ts`.

Copy the [browser driver](../../evidence/2026-10-15T165802Z-lean-first-pass/browser-driver.txt) to `.local-data/verification/lean-pass1.ts` and run it with `npx tsx .local-data/verification/lean-pass1.ts` after building. It closes its owned server/browser and removes its temporary database in `finally`. Raw logs stay outside the wiki.

Native bundle installation/execution, real Codex inference, live providers, Unraid deployment and new LaTeX compilation were not selected. The installed app retains its previous bundled code. Existing large-chunk build warnings remain; no package-size improvement is claimed.
