---
title: Backups and restore
section: Guides
updated: 2026-10-07
---
# Backups and restore

```sh
npx tsx scripts/backup.ts
```

This uses SQLite's online backup API and writes a consistent snapshot under the data directory's `backups/` folder. To restore, stop both API and worker, preserve the existing appdata folder, replace `job-hunter.db` with the chosen backup, and remove stale `job-hunter.db-wal` / `job-hunter.db-shm` files before restarting. Back up `secrets/` and `codex/` separately if you want credentials restored too; they are not in database backups.



For container-specific commands and storage ownership, see [Unraid installation](unraid.md).
