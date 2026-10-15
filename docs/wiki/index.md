---
title: ununemploy wiki
section: Overview
updated: 2026-10-16
order: 0
---
# ununemploy wiki

Local job discovery, fit assessment, private cover-letter drafting and master CV management.

## Start

- [ZIP backups](features/backups.md)
- [Native desktop app](features/desktop.md)
- [Local development](guides/local-development.md)
- [Application workflow](guides/workflow.md)
- [Feature map](features/index.md)
- [Unraid installation](guides/unraid.md) and [backups](guides/backups.md)

## Project contract and implementation

- [Decision register](decisions/index.md) and [dashboard UI](decisions/dashboard-ui.md)
- [Architecture](reference/architecture.md)
- [Source coverage](reference/source-coverage.md) and [geography data](reference/geography.md)
- [Limitations](reference/limitations.md) and [open follow-up](discussions/open-questions.md)

## Verification and history

- [Cursor-inspired UI redesign — 16 October 2026](verification/runs/2026-10-16-cursor-redesign.md)

- [Verification setup](verification/setup.md), [runs](verification/index.md), and [historical checks](verification/history.md)
- [Source evaluation — September 2026](journal/2026-09-16-source-evaluation.md)
- [Coverage research — 17 September 2026](journal/2026-09-17-coverage-research.md)
- [Additional source evaluation — 8 October 2026](journal/2026-10-08-source-evaluation.md)
- [Integration audit and simplification proposals — 8 October 2026](journal/2026-10-08-integration-audit.md)
- [Accepted integration design — 8 October 2026](journal/2026-10-08-integration-design.md)
- [jstack adoption — 7 October 2026](journal/2026-10-07-jstack-migration.md)
- [Native desktop packaging — 7 October 2026](journal/2026-10-07-desktop.md)
- [Windows and Linux desktop assessment — 16 October 2026](journal/2026-10-16-desktop-portability.md)

## Maintain this wiki

Follow [documentation maintenance](guides/documentation.md). Markdown is authoritative; build `docs/wiki/index.html` with `node docs/wiki/_build.mjs` and validate it with `node docs/wiki/_build.mjs --check`. The generated reader opens locally without a server. Private candidate evidence, credentials, application records and generated CVs stay outside this wiki.
