---
title: Lean cover-letter editor
section: Verification
updated: 2026-10-16
result: Passed
---
# Lean cover-letter editor

## Scope

Item 6 completes the [approved lean cleanup](../../journal/2026-10-16-lean-cleanup.md), following the [submitted choices](../../journal/2026-10-15-grill-c7050aa1-cfbb-429f-9ecd-6ff4875c9c24.md). Relevant features: [FEAT-cover-letters](../../features/cover-letters.md), [FEAT-assistant](../../features/assistant.md) and retained [FEAT-master-cv](../../features/master-cv.md) boundaries.

## Build and environment

Revision `4ec343f72bb38c1839cc7dd67c94dd7eee08d078`, dirty checkout with pre-existing unrelated work. The [source manifest](../../evidence/2026-10-16-lean-cover-letters/source-manifest.json) fingerprints source, scripts, tests, packaging inputs and deleted files. Its SHA-256 appears in [results](../../evidence/2026-10-16-lean-cover-letters/results.json).

Darwin arm64, Node v22.19.0, production Vite frontend, temporary isolated SQLite databases and headless Chromium. Fictional candidate/job fixtures only; no personal database or provider requests. The cover-letter driver was changed to remove its old dependency on a live local instance and collected posting. Generation and assistant inference were simulated; HTTP saves, previews, PDF exports, clipboard operations and assistant action execution were real.

## Results

| Scenario | Expected | Observed | Outcome | Evidence |
| --- | --- | --- | --- | --- |
| Plain-text authoring | Normal fields, single/blank line breaks, optional contact links | Body typing retains trailing blank lines and multiple paragraphs; clearing a contact link saves successfully; removed code tabs absent | Passed | [Browser checks](../../evidence/2026-10-16-lean-cover-letters/browser.json) |
| Shared layout and removed capabilities | Fixed layout for all current letter paths; content-only actions | API rejects template inputs and DOCX/HTML formats; assistant rejects layout changes; generation/manual/assistant saves use the shared template; obsolete template setting ignored | Passed | [Results](../../evidence/2026-10-16-lean-cover-letters/results.json) |
| Copy and PDF | Copy complete letter as text, download readable PDF | Clipboard equals complete expected letter; PDF has valid signature and selectable expected text; rendered first page visually inspected for clipping/overlap | Passed | [Browser checks](../../evidence/2026-10-16-lean-cover-letters/browser.json) |
| Save/retry/restore | Preserve edits on errors; restore appends a version | Generation failure/retry, failed save/export, load retry, polling, unsaved navigation guards, immutable restore and reload checks pass | Passed | [Browser checks](../../evidence/2026-10-16-lean-cover-letters/browser.json) |
| Assistant updates | Rewrite a saved letter through the existing assistant | Browser driver confirms context, version save, automatic clean-editor reload and preview; unsaved navigation guards retained | Passed | [Results](../../evidence/2026-10-16-lean-cover-letters/results.json) |
| Responsive UI | Accessible ordinary controls and no viewport overflow | Desktop/mobile browser checks pass; screenshots inspected; Kumo inputs, textarea and buttons used | Passed | [Browser checks](../../evidence/2026-10-16-lean-cover-letters/browser.json) |
| Regression/build | Preserve other features and historical resumes | 184 tests pass, including old resume HTML/PDF/Word exports and backup contracts; TypeScript/Vite build passes | Passed | [Results](../../evidence/2026-10-16-lean-cover-letters/results.json) |

## Reproduction and cleanup

Run `npm test`, `npm run build`, `npx tsx scripts/verify-cv-workflow.ts` and `npx tsx scripts/verify-assistant-ui.ts`. The browser drivers own and close their temporary API/browser and remove synthetic databases. Raw logs, synthetic screenshots and generated fixture documents remain outside the shareable wiki under local verification paths. The browser outcome file contains sanitized scenario results only.

## Limits

The installed native bundle was not rebuilt or replaced. WKWebView clipboard/save-panel behavior, the fallback clipboard branch, real Codex generation, live providers and Unraid deployment were not selected. Those paths are untested in this run. The existing large-chunk build warning remains. No compatibility UI for old letter layouts was added, as requested; retained records are not deleted. Historical resume export code still requires Chromium/Word dependencies, so removing letter DOCX output does not remove every renderer dependency.
