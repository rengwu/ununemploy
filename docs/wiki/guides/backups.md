---
title: Backups and restore
section: Guides
updated: 2026-10-08
---
# Backups and restore

## Personal ZIP backup

Open **Settings → Backup → Export to Backup** to download the current profile, scanned/saved jobs, latest LaTeX CV and latest cover letters. To restore, click **Restore from Backup** and choose the ZIP. Import overwrites personal content and history; there is no automatic backup. Export first if you want to keep the destination's current content.

Settings, source configuration, checkpoints, budgets and credentials remain on the destination. Old versions and conversations are excluded. [ZIP backups](../features/backups.md) defines the archive, validation, size limits and verification recipe.

## Full database snapshot

```sh
npx tsx scripts/backup.ts
```

This uses SQLite's online backup API and writes a consistent snapshot under the data directory's `backups/` folder. To restore, stop both API and worker, preserve the existing appdata folder, replace `job-hunter.db` with the chosen backup, and remove stale `job-hunter.db-wal` / `job-hunter.db-shm` files before restarting. Back up `secrets/` and `codex/` separately if you want credentials restored too; they are not in database backups.



For container-specific commands and storage ownership, see [Unraid installation](unraid.md).
