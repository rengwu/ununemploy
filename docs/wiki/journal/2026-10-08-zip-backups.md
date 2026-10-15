---
title: ZIP backups and LaTeX-only CV — 8 October 2026
section: Journal
updated: 2026-10-08
status: Implemented
---
# ZIP backups and LaTeX-only CV — 8 October 2026

The user requested ZIP export/import for the LaTeX CV, profile, scanned jobs, saved jobs and cover letters, and invited grill-form questions. Their [submitted answers](2026-10-07-grill-1690ca1b-3437-4b6b-b439-f41c51e45a16.md) rejected automatic recovery backups and merge behavior: simply overwrite, retain only current records/latest document versions, and exclude source configuration/settings. The transcript filename reflects the tool's UTC date; acceptance occurred on 8 October locally.

During implementation the user added: “remove the ‘Data and HTML’ CV. we only need latex.” The CV navigation now opens LaTeX directly. Old HTML CV URLs lead there, and the assistant exposes LaTeX and cover-letter document actions. The shared HTML editor remains for saved-job letters. Existing legacy records and compatibility APIs were not erased by this UI change.

The user then simplified the backup controls to exactly **Export to Backup** and **Restore from Backup**. Restore selects and imports in one action; cancelling the chooser does nothing.

[ZIP backups](../features/backups.md) is the current specification. The implementation validates a fixed-entry, checksummed ZIP before replacing personal tables in a transaction. Listing evidence is preserved independently of source configuration. Source settings, checkpoints, budgets and credentials stay on the destination. Active asynchronous writes prevent replacement until they finish.

Early implementation checks caught a ZIP stream API mismatch and an initial archive cap too small for the existing collection. The reader was corrected, compact JSON and bounded 128 MiB compressed / 512 MiB unpacked limits were adopted, and export/import succeeded on a temporary online-backup copy of the current database with integrity intact. No real records or archives were copied to this wiki. Fixture tests also cover rollback after a deliberate database insertion failure.

The expanded assistant browser check initially used the removed sidebar theme button from an older UI. Its driver now selects Theme in Settings. Dated verification records distinguish that harness failure from passing product checks and identify the final tested revision.

The final [verification run](../verification/runs/2026-10-07T182813Z-backups.md) records passing checks and the installed build.
