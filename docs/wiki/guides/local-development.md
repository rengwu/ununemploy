---
title: Local development
section: Guides
updated: 2026-10-12
---
# Local development

For everyday use, open the [native desktop app](../features/desktop.md). The commands below are for developing the web application. After desktop installation, this workspace's `.env` points to the same Application Support data directory; avoid running an extra development instance unless needed.

Requires Node 22.19+ and the official Codex CLI signed in with ChatGPT.

```sh
npm ci
test -f .env || cp .env.example .env
npx playwright install chromium
npm run dev
```

Open **http://127.0.0.1:2839**. The current workspace uses API port **4317** in `.env` because port 3000 was already occupied. Fresh installations default to API port 3000; change `JH_PORT` if needed. Vite proxies API requests to that port. No application login, hosted domain, or publishing service.

The development command prepares the local LaTeX compiler, then starts the API, frontend, and worker. First-run compiler/package downloads require internet access; subsequent CV compilation is offline. All persistent application data lives in `.local-data/` by default. The server must remain awake for scans to run; Unraid runs the same worker continuously.


## Existing installations


The app keeps its existing `job-hunter.db` database filename, `JH_*` environment settings, and browser storage keys so saved jobs, CVs, credentials, and preferences continue to work after the rename. Use `ununemploy:local` for new Docker builds and keep the existing appdata mount when updating an installation.


## Public source and local data


The repository excludes local candidate evidence, app databases, generated documents and credentials. Automated tests use the fictional profile in `tests/fixtures/profile.json`; it is not a default profile or real candidate evidence. Run `npm test` and `npm run build` to check a source checkout.

## Next steps

Open [the workflow guide](workflow.md), review [verification setup](../verification/setup.md), or prepare [Unraid installation](unraid.md). The [master CV guide](../features/master-cv.md) covers compiler setup and overrides. All commands in this wiki assume the repository root unless stated otherwise.
