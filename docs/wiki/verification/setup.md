---
title: Verification setup
section: Verification
updated: 2026-10-07
---
# Verification setup

Run commands from the repository root. Product verification should exercise only the selected scenarios and record their exact build; documentation validation alone does not certify the app.

## Environment and readiness

Use Node 22.19+, installed project dependencies, and Playwright Chromium; see [local development](../guides/local-development.md). `npm run build` prepares the static UI required by isolated browser drivers. LaTeX scenarios need a prepared Tectonic/package cache; `npm run setup:latex` may download generic compiler packages.

The existing dev UI defaults to `http://127.0.0.1:5173`; this workspace uses API port 4317, while a fresh installation defaults to 3000. `GET /api/health` succeeds only with a recent worker heartbeat. Check the configured port without disclosing `.env` contents. Do not start another API/worker against the user's live database. `npm run dev` starts the configured scheduler and can perform real collection.

For build identity, record `git rev-parse HEAD`, whether the tree is dirty, and a SHA-256 content manifest or patch fingerprint including relevant untracked files. A revision alone does not identify a dirty tree. Exclude `.env`, appdata, credentials and candidate evidence from public manifests and logs.

## Isolation, effects and cleanup

`npm test` uses temporary databases, fictional profile fixtures and mocked provider/runtime responses. Most browser drivers start an isolated server on an ephemeral loopback port; inspect the selected script before execution. `verify-dashboard.ts` and `verify-matching-ui.ts` use the live app, intercept Seen writes, and depend on existing listings. They are not fixture-independent guarantees. Never use candidate data to create public evidence.

Real generation drivers consume subscription allowance. Live scans consume provider/request budgets. Those checks are distinct from offline fixture tests and should be selected deliberately. Do not enable new sources or change the live profile for a documentation check.

Existing drivers store artifacts under `.local-data/verification/`. Keep raw/private artifacts there. Copy only reviewed, sanitized or synthetic evidence into `docs/wiki/evidence/<run-id>/`. Preserve run evidence; remove only temporary databases, browser contexts, processes and containers created by the check. Most isolated drivers use `finally` cleanup; inspect leftovers after failures.

## Existing checks and tools


```sh
npm run check
npm test
npm run build
```

`npx tsx scripts/verify-assistant-ui.ts` checks the overlay, onboarding, jobs, document edits, preview refresh, unsaved text and desktop/mobile behavior with isolated synthetic data and simulated inference; PDF compilation is real. The old `verify-profile-ui.ts` command delegates to this workflow. `npx tsx scripts/verify-assistant-runtime.ts` performs an opt-in real Codex profile/LaTeX edit and PDF compilation with synthetic facts; it consumes subscription allowance. `verify-profile-runtime.ts` retains the earlier profile-only runtime check.

Tests use an isolated temporary database and mock source responses/Codex process output. `scripts/verify-generation.ts` performs a real subscription inference against an already-collected Linear posting without saving it to your job list. It consumes subscription allowance. `scripts/verify-exports.ts` retains checks for master and legacy resume exports. `scripts/verify-container.ts` exercises the amd64 image, PDF export, volume ownership, backup, and restart persistence with an isolated Docker volume, fixture data, and scheduling disabled.

`npx tsx scripts/verify-dashboard.ts` checks pagination, filtering, polling, retry behavior, unsaved notes and mobile layout against the local running app without saving jobs. `npx tsx scripts/verify-cv-workflow.ts` now runs the cover-letter save/edit/restore/download browser flow in an isolated temporary app with simulated generation. Add `--real-generation` to use the configured Codex subscription; this consumes allowance. Both modes passed, including one real generation, controlled failure/retry checks, and rendered PDF/Word inspection. See [verification](history.md) for scope and artifacts. The optional WebMCP surface has not been validated in a supported browser context.



## Wiki checks

No extra package installation or server is needed:

```sh
node docs/wiki/_build.mjs
node docs/wiki/_build.mjs --check
node ../jstack/skills/verify-change/scripts/check-reports.mjs docs/wiki
```

Open `docs/wiki/index.html` locally. Verify navigation, search, source view and a narrow viewport with no network dependency when the reader changes. Use the existing Playwright installation or an available browser. The report metadata checker lives in the sibling jstack checkout; the reader builder is vendored and works without it. See [documentation maintenance](../guides/documentation.md).
