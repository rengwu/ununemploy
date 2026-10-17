# ununemploy

Local job discovery, fit assessment, private cover letters and master CV management. React, TypeScript, Vite, Base UI, Fastify, SQLite and an internal worker. Runs locally or on a home-network Unraid server, without an application login.

## Run locally

For daily use on macOS, open **ununemploy.app** from Applications or Spotlight. It starts its bundled API and worker; closing the window keeps them running, and **Quit ununemploy** stops them. See the [desktop guide](docs/wiki/features/desktop.md) for building and installing it from this checkout.

The Windows 11 x64 local port opens **ununemploy.exe** and uses the same Close/Quit lifecycle. `npm run desktop:build` and `npm run desktop:install` select the Windows builder/installer on Windows. The installer verifies package checksums and the WebView2 prerequisite before replacing application files. See [Windows prerequisites, appdata and verification limits](docs/wiki/features/desktop.md#windows-11-x64).

For development:

Requires Node 22.19+ and the official Codex CLI signed in with ChatGPT.

```sh
npm ci
test -f .env || cp .env.example .env
npx playwright install chromium
npm run dev
```

Open **http://127.0.0.1:2839**. Startup prepares the local LaTeX compiler; see [local development](docs/wiki/guides/local-development.md) for ports, persistence and setup details.

## Documentation

Start at the **[project wiki](docs/wiki/index.md)** or open the generated **[offline reader](docs/wiki/index.html)** locally.

- [Application workflow](docs/wiki/guides/workflow.md) and [feature map](docs/wiki/features/index.md)
- [Architecture](docs/wiki/reference/architecture.md) and [decisions](docs/wiki/decisions/index.md)
- [Sources and access limits](docs/wiki/reference/source-coverage.md)
- [Unraid installation](docs/wiki/guides/unraid.md) and [backups](docs/wiki/guides/backups.md)
- [Verification setup and results](docs/wiki/verification/index.md)
- [jstack documentation workflow](docs/wiki/guides/documentation.md)

Rebuild and validate the wiki without installing any documentation packages:

```sh
node docs/wiki/_build.mjs
node docs/wiki/_build.mjs --check
```

Saving a job queues a tailored cover letter; the master CV remains separate. Applications, uploads, form filling and employer outreach remain manual. Candidate evidence, generated documents, databases and credentials stay local and outside Git.
