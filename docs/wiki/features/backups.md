---
title: ZIP backups
section: Features
updated: 2026-10-19
---
# ZIP backups

Feature ID: `FEAT-backups`

## Intent and basis

Back up personal content and import it into a local installation. The user chose **overwrite without an automatic backup**, **current records/latest versions only**, and **no source configuration or application settings** on 8 October 2026. They then removed the Data and HTML CV option, leaving LaTeX as the CV. See [decisions](../decisions/index.md), [submitted answers](../journal/2026-10-07-grill-1690ca1b-3437-4b6b-b439-f41c51e45a16.md), and [implementation journal](../journal/2026-10-08-zip-backups.md).

## Entry points and prerequisites

Open **Settings → Backup**. **Export to Backup** downloads a timestamped archive. **Restore from Backup** opens the file picker and immediately restores the selected ZIP after validation. Cancelling the picker changes nothing. The page explains replacement before the action. Export manually first if the current content should be retained. No preview/merge/automatic-backup workflow is added.

## Expected outcomes

- The archive contains the current canonical profile, including its current evidence references, preferences and missing information; all scanned jobs, review/Seen/applied state, notes and manual descriptions; current listing observations and completed Jev assessments; the latest LaTeX source and its matching PDF if one exists; and the latest saved cover letter per job, including its document/template/manual wording and evidence.
- Older versions, chat messages/turns, queued generation, historical observations, scan-run logs, HTML/legacy CVs, source configuration, schedules, checkpoints, usage counters, credentials and runtime authentication are excluded. Original evidence files referenced by the profile are not copied. Unsaved browser text is not a saved record.
- ZIP import replaces the destination's personal records, document versions, chat and pending tasks in one SQLite transaction. It does not retain a recovery archive. Validation or database failure leaves the existing records unchanged. Profile/LaTeX version numbers advance, and letters receive new IDs, so stale document editors cannot overwrite the imported version.
- Destination source configuration, settings, scan checkpoints, usage counters and authentication stay intact. Existing scheduling remains configured as before; the import itself makes no discovery or inference requests and never queues letters. Active scan/model/edit operations cause a retryable error before replacement.
- Imported source observations remain attached to jobs independently of source configuration. Later matching live observations take precedence. Availability, original source links, saved state and letters remain readable after reopening.
- After success the UI reloads and displays **Backup restored.** CV opens directly to LaTeX, including old `#cv?view=html` links. The cover-letter editor remains in Saved.

## Archive contract and limits

Format `ununemploy-personal-backup`, version `1`: `manifest.json`, compact `data.json`, UTF-8 `cv.tex`, and optional `cv.pdf`. The manifest records creation time, byte sizes and SHA-256 hashes. Only these files are accepted; duplicate entries, directories, links, unsafe paths, unsupported versions and invalid references are rejected. Nothing is extracted to the filesystem. Decompression is bounded before records are accepted.

Limits: 128 MiB ZIP, 512 MiB unpacked, 100,000 jobs, 2 MiB LaTeX source. This is an ordinary unencrypted ZIP. It is not a full appdata or credential backup. For complete local recovery, use the separate [database backup procedure](../guides/backups.md). LaTeX remains a single-source document; arbitrary projects/package files are not imported.

## Verification recipe

Use [shared setup](../verification/setup.md) and synthetic data, never overwrite the live user database during verification.

```sh
npx tsx --test tests/backup.test.ts
npm run build
npx tsx scripts/verify-backup-ui.ts
```

The API tests cover content/exclusions, Unicode/manual edits, damaged/unsafe archives, reference validation, size bounding, active operations, mid-transaction rollback, replacement without a recovery backup, destination configuration/counters, reopening, listing refresh, missing PDFs and uploads larger than the normal API limit. The isolated browser driver exercises actual Settings download/upload, failure/retry, page reload, cover-letter preview, old HTML CV links, desktop/dark/mobile layout, and cleanup.

Related checks: `npx tsx scripts/verify-latex.ts`, `npx tsx scripts/verify-assistant-ui.ts`, `npm run desktop:test`, and `npx tsx scripts/verify-desktop.ts`.

## Coverage and limitations

Large inventories require memory proportional to the current records while creating or reading the archive. Export takes a consistent read snapshot; it does not stop the worker. Import cannot interrupt an active model job or scan. Single-record references to original local evidence files remain references and may require the original files after moving devices. Cross-device/actual Unraid restoration is not implied by local tests.

## Verification history

[Windows local build — 17 October 2026](../verification/runs/2026-10-17-windows-port.md) includes a packaged ZIP export/import round trip and destination counter retention with synthetic data.

[Cursor-inspired UI redesign — 16 October 2026](../verification/runs/2026-10-16-cursor-redesign.md) records the replacement controls, responsive/theme checks, preserved workflows and native installation.

[Assistant consolidation and Jev retirement — 16 October 2026](../verification/runs/2026-10-16-lean-assistant-jev.md): preserved queued/history data, one assistant engine, removed Jev capabilities, 184 tests, build and desktop/mobile browser checks.

[ZIP backups and LaTeX-only CV — 8 October 2026](../verification/runs/2026-10-07T182813Z-backups.md) records archive validation/replacement, the two-button browser and native flows, LaTeX/assistant checks and installation.

See the dated [verification index](../verification/index.md) for exact build identity, results and untested paths.

[Pi runtime and attachments — 19 October 2026](../verification/runs/2026-10-19-pi-attachments.md) records the Mac runtime replacement, attachment lifecycle, native installation and preserved data.
