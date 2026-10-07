---
title: Decision register
section: Decisions
updated: 2026-10-07
---
# Decision register

These are established requirements summarized from repository `AGENTS.md` and the migrated design documentation. Original acceptance dates were not recorded consistently; pre-existing requirements are marked **established before 7 October 2026**, not assigned invented decision dates. `AGENTS.md` remains the agent instruction entry point.

| ID | Accepted decision | Basis and related behavior |
| --- | --- | --- |
| DEC-local | Local development and home-network hosting; no login or cloud domain. Target Docker/Unraid with persistent appdata. | Established before migration; [Unraid](../guides/unraid.md), [architecture](../reference/architecture.md). Actual server deployment is unverified. |
| DEC-boundaries | Discover, assess, draft and manage CVs. No submission, employer uploads, form filling, outreach, engagement or external notifications. | User-established boundary; [discovery](../features/discovery.md), [cover letters](../features/cover-letters.md). Ordinary application links are manual. |
| DEC-evidence | SQLite profile versions are canonical; retain attribution, quoted changes and history. Never invent candidate facts or equate total engineering experience with AI tenure. | Established before migration; [profile](../features/profile.md). Private evidence remains local. |
| DEC-letters | Save generates a cover letter; keep the master CV independent and preserve legacy resumes. Full letter editor belongs inside Saved job detail. | Existing correction supersedes older per-job CV workflow; [cover letters](../features/cover-letters.md), [history](../verification/history.md). |
| DEC-ui | Lowercase ununemploy; React/TypeScript/Vite with official Kumo components and literal task-focused copy. | Existing user approval, replacing the earlier SvelteKit proposal; [dashboard decisions](dashboard-ui.md). |
| DEC-assistant | Persistent right-side overlay without page shift; shared profile facts and bounded document actions with atomic versions. | Established before migration; [assistant](../features/assistant.md). No unrestricted shell/filesystem/external writes. |
| DEC-runtime | Official Codex, ChatGPT subscription, gpt-5.6-sol, high reasoning; serialized jobs, runtime-owned authentication, no silent fallback. | Established before migration; [architecture](../reference/architecture.md), [cover letters](../features/cover-letters.md). |
| DEC-jev | Optional TypeSafe assessment only after user configuration; retain no-key baseline and Codex letter generation. | Established before migration; [Jev](../features/jev.md). Live authenticated inference is unverified. |
| DEC-wiki | Adopt the local jstack collection and migrate project documentation into a Markdown wiki with an offline reader. | User request on **7 October 2026**: “can we adopt jstack (../jstack) for this project? migrate all docs to wiki format”; [migration journal](../journal/2026-10-07-jstack-migration.md). |
| DEC-desktop | Add a local native Go webview app for macOS; opening it owns service startup, closing the window keeps scanning, and Quit stops services. Preserve existing local state outside the bundle. | User request and explicit “Keep running until Quit” selection on **7 October 2026**; [journal](../journal/2026-10-07-desktop.md), [desktop specification](../features/desktop.md). Supplements the Unraid target. |

Historical source strategies and probe outcomes remain in the [source evaluation](../journal/2026-09-16-source-evaluation.md) and [coverage research](../journal/2026-09-17-coverage-research.md) journals; proposals there are not newly accepted requirements.
