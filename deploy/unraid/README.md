# Unraid installation

ununemploy runs entirely on your server, on a local port without an application login. It uses one Docker container for the API, UI, and supervised worker. Persistent data is mounted at `/config`.

## Build the local image

From the project folder on a machine with Docker:

```sh
docker buildx build --platform linux/amd64 --load -t ununemploy:local .
```

The image stays local. It contains the application and initial candidate profile; do not publish it to a public registry. If you build directly on Unraid, the image is immediately available there. If you build on your Mac, transfer it manually:

```sh
docker save -o ununemploy-image.tar ununemploy:local
```

Copy the archive to your server, then run `docker load -i /path/to/ununemploy-image.tar` on Unraid. No hosted domain or registry account is needed.

## Install the XML template

1. Copy `ununemploy.xml` to `/boot/config/plugins/dockerMan/templates-user/my-ununemploy.xml` on Unraid.
2. Open **Docker → Add Container** and select the ununemploy template.
3. Keep `/config` mapped to `/mnt/user/appdata/ununemploy` and choose a host port, default **3080**.
4. Set **Application URL** to the address you will use, for example `http://192.168.1.10:3080`.
5. Apply. Open the WebUI from the container menu.

When updating an existing installation, keep its current `/config` host-directory mapping. The database remains named `job-hunter.db` for compatibility.

The template uses `ununemploy:local`, container port 3000, PUID 99, PGID 100, and a four-hour scan interval. The supervisor runs the API and worker as the configured UID/GID and restarts them if they exit. Health checks require a live API and recent worker heartbeat. `/config` persists across image replacements.

## Sign in to Codex

The official CLI is included. Run this on Unraid after starting the container:

```sh
docker exec -it -u 99:100 -e CODEX_HOME=/config/codex -e HOME=/config/home ununemploy codex login --device-auth
```

Follow the CLI's own sign-in instructions using your ChatGPT subscription. If you changed PUID/PGID, use those values. The official CLI owns its authentication and refresh state under `/config/codex`; the application does not implement OAuth. Device sign-in may need enabling in the account's security settings. See [Codex authentication](https://learn.chatgpt.com/docs/auth).

Open **Settings → Codex → Check connection** afterwards. Generation uses `gpt-5.6-sol` with high reasoning, one task at a time. Login, model-access, and subscription-allowance failures pause drafts. Retry after resolving the displayed issue. No API-key billing fallback is configured.

Your current Mac login is used by the development instance. A new container needs its own official sign-in; credentials are not baked into the image.

## Configure the additional sources

Fresh databases include the full source catalog. For existing appdata after replacing the image, run `docker exec -u 99:100 ununemploy npx tsx scripts/add-discovery-sources.ts` to install missing entries without changing existing preferences. VueJobs runs through public RSS. Set the separate Web3.career token in **Settings → Web3.career**; it persists under `/config/secrets`. The installer upgrades Wellfound and Welcome to the Jungle in place and adds the 28-board expansion. Public-board collectors use a persistent SQLite description queue, at most two scans/day and 12 requests/scan. Sources reports blocked/unavailable boards. Adzuna, Jooble and Careerjet remain pending API configuration; no credentials are bundled.

## Enable X

Use **Settings → X** to save the app-only bearer token, set a monthly post limit, and enable collection. The starter search is in **Sources → X · Engineering**. Add additional queries as separate X sources. All queries share one monthly retrieval cap. You can also supply the token through the optional Unraid variable.

Create the X app and obtain the bearer token at [console.x.com](https://console.x.com/). X API access/credits are separate from the Codex subscription. No X posting or user-engagement capabilities are present.

## Update and back up

The image also includes the offline LaTeX compiler and package cache. **CV → LaTeX** edits and previews the master resume, with source and PDF versions persisted in `job-hunter.db`. The compiler uses Linux Landlock and requires a host kernel with Landlock enabled (Linux 5.13+); unsupported hosts show a compilation error and preserve saved source. Do not add privileged mode or mount the Docker socket. No additional Unraid volume or authentication is needed.

Rebuild/load the image, then recreate the container using the same `/config` mapping. Existing jobs, profile revisions, CV and cover-letter edits, queued drafts, source checkpoints, and counters stay in appdata. Interrupted generation appears as a paused task.

Create a consistent database backup while the app is running:

```sh
docker exec -u 99:100 ununemploy /app/node_modules/.bin/tsx scripts/backup.ts
```

The command prints the backup path under `/config/backups`. Keep `secrets/` and `codex/` with a separate private backup if you need to preserve sign-in. To restore a database, stop the container first, keep a copy of its current appdata, replace `job-hunter.db`, and remove stale WAL/SHM sidecars before restarting.

## Local container check

```sh
npx tsx scripts/verify-container.ts
```

This uses a temporary native Docker volume and port 5308 with scheduled collection disabled. It verifies the amd64 image, persistent notes/CV profile versions/cover letters/queued tasks, PDF rendering, UID/GID, and online database backup. It does not deploy to your Unraid server.
