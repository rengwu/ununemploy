---
title: Decision register
section: Decisions
updated: 2026-10-19
---
# Decision register

These are established requirements summarized from repository `AGENTS.md` and the migrated design documentation. Original acceptance dates were not recorded consistently; pre-existing requirements are marked **established before 7 October 2026**, not assigned invented decision dates. `AGENTS.md` remains the agent instruction entry point.

| ID | Accepted decision | Basis and related behavior |
| --- | --- | --- |
| DEC-local | Local development and home-network hosting; no login or cloud domain. Target Docker/Unraid with persistent appdata. | Established before migration; [Unraid](../guides/unraid.md), [architecture](../reference/architecture.md). Actual server deployment is unverified. |
| DEC-boundaries | Discover, assess, draft and manage CVs. No submission, employer uploads, form filling, outreach, engagement or external notifications. | User-established boundary; [discovery](../features/discovery.md), [cover letters](../features/cover-letters.md). Ordinary application links are manual. |
| DEC-evidence | SQLite profile versions are canonical; retain attribution, quoted changes and history. Never invent candidate facts or equate total engineering experience with AI tenure. | Established before migration; [profile](../features/profile.md). Private evidence remains local. |
| DEC-letters | Save generates a cover letter; keep the master CV independent and preserve legacy resumes. Full letter editor belongs inside Saved job detail. | Existing correction supersedes older per-job CV workflow; [cover letters](../features/cover-letters.md), [history](../verification/history.md). |
| DEC-ui | Lowercase ununemploy; React/TypeScript/Vite with Cursor/Clarity-inspired controls and literal task-focused copy. | 16 October redesign request and submitted design answers replace Kumo; [dashboard decisions](dashboard-ui.md). |
| DEC-assistant | Persistent right-side overlay without page shift; shared profile facts and bounded document actions with atomic versions. | Established before migration; [assistant](../features/assistant.md). No unrestricted shell/filesystem/external writes. |
| DEC-runtime | Use pi-ai, ChatGPT subscription, gpt-5.6-sol, high reasoning; serialized jobs, SDK-owned refresh with app-owned credential persistence, no silent fallback. | Established before migration; [architecture](../reference/architecture.md), [cover letters](../features/cover-letters.md). The accepted Mac-first migration is implemented on 19 October; see [AI runtime](../features/ai-runtime.md). |
| DEC-jev | Retire executable Jev integration while preserving credentials, settings, assessment history, queue and counters. Use baseline matching and Codex letters. | User approval of the lean cleanup on **16 October 2026** supersedes temporary disablement on 8 October. Historical accounting findings remain preserved. [Jev](../features/jev.md), [cleanup plan](../journal/2026-10-16-lean-cleanup.md). |
| DEC-wiki | Adopt the local jstack collection and migrate project documentation into a Markdown wiki with an offline reader. | User request on **7 October 2026**: “can we adopt jstack (../jstack) for this project? migrate all docs to wiki format”; [migration journal](../journal/2026-10-07-jstack-migration.md). |
| DEC-desktop | Add a local native Go webview app for macOS; opening it owns service startup, closing the window keeps scanning, and Quit stops services. Preserve existing local state outside the bundle. | User request and explicit “Keep running until Quit” selection on **7 October 2026**; [journal](../journal/2026-10-07-desktop.md), [desktop specification](../features/desktop.md). Supplements the Unraid target. |

| DEC-backup | Export current personal content to ZIP; import overwrites without an automatic backup. Exclude old versions, conversations, source configuration and settings. | User answers on **8 October 2026**; [backup specification](../features/backups.md), [answer transcript](../journal/2026-10-07-grill-1690ca1b-3437-4b6b-b439-f41c51e45a16.md). |
| DEC-latex-only | CV opens directly to LaTeX; remove Data and HTML CV editing. Cover letters stay in Saved; their HTML editing was subsequently removed by the 16 October lean decision below. | User correction on **8 October 2026**; supersedes the earlier dual-CV interface in DEC-ui; [CV specification](../features/master-cv.md). |
| DEC-source-audit | Add Working Nomads, WordPress Jobs, RemoteJobs.com and Dynamite Jobs after a full analysis of existing integrations. The later user correction removes The Muse entirely from scope, including setup and follow-up. Defer Reddit. Preserve scanning and parsing reliability when considering simplification. | User instruction on **8 October 2026**: “before adding, let's do a full analysis of our existing integrations.” The [audit](../journal/2026-10-08-integration-audit.md) records findings and proposed changes; the [corrective implementation](../verification/runs/2026-10-08T075217Z-integration-implementation.md) records the resulting changes and checks. |
| DEC-discovery-functional | Correct the audited integration behavior with shared pure TypeScript rules and existing tables. Full-detail metadata remains authoritative until refresh; keep conflict/reopening rules simple, reserve one overdue recheck and continue known details after discovery-only parse failures. | User [interview answers](../journal/2026-10-08-grill-066239f1-0297-4959-931f-86fe2f48422e.md) on **8 October 2026**. [Current specification](../features/discovery.md#accepted-corrective-design-8-october-2026) and [rationale](../journal/2026-10-08-integration-design.md). Implemented and verified; metadata precedence supersedes the audit's newest-card recommendation. |

Historical source strategies and probe outcomes remain in the [source evaluation](../journal/2026-09-16-source-evaluation.md) and [coverage research](../journal/2026-09-17-coverage-research.md) journals; proposals there are not newly accepted requirements.

## Mac-first Pi implementation direction — 18 October 2026

After reviewing Windows package size and the Pi assessment, the user requested recording the finding, committing/pushing the checkpoint, and implementing it first on their Mac. Preserve the current Windows work and begin the runtime replacement on Mac before returning to Windows distribution. The [handoff](../journal/2026-10-18-pi-runtime-handoff.md) records measured size, sources, constraints and proposed acceptance checks. `pi-ai` alone is the initial recommendation; the full Pi Durable harness remains an option, not a selected or verified implementation. This was the transition gate; the 19 October [AI runtime](../features/ai-runtime.md) record supersedes the implementation status. ChatGPT subscription intent, exact model/high reasoning, local state and bounded assistant actions remain required.

## Windows port implementation — 17 October 2026

The user authorized advancing the documented Windows plan, paused at a checkpoint, then explicitly resumed. The initial implemented target is Windows 11 x64. Retain React/Node and Go; use Win32/WebView2, Windows Job Objects for service lifetime and AppContainer isolation for LaTeX. These are implementation choices within that authorization, with existing local-only/private-drafting boundaries unchanged. See the [current desktop contract](../features/desktop.md#windows-11-x64), [journal](../journal/2026-10-17-windows-port.md), and [verification](../verification/runs/2026-10-17-windows-port.md). A verified local build is distinct from signed or clean-machine distribution.

## Accepted lean cleanup — 16 October 2026

The user approved sequential removal of redundant and speculative paths. The [cleanup plan](../journal/2026-10-16-lean-cleanup.md) records the first pass, subsequent items and unresolved choices. This changes the planned Jev direction from temporary disablement to retirement with retained data, and authorizes later simplification of the cover-letter editor. Existing implementations remain in place until each item is completed and verified.

### Lean cover-letter authoring — 16 October 2026

Accepted: plain-text fields and paragraphs, one shared layout, Copy text and PDF. Remove cover-letter code tabs, layout actions and DOCX/HTML exports. Existing storage remains intact; no old-layout compatibility UI is needed. See the [submitted answers](../journal/2026-10-15-grill-c7050aa1-cfbb-429f-9ecd-6ff4875c9c24.md), [current feature](../features/cover-letters.md) and [completed lean plan](../journal/2026-10-16-lean-cleanup.md).

### Accepted first pass

The [submitted Pi scope answer](../journal/2026-10-17-grill-98222632-c041-4b36-850a-7b00e43f80b5.md) selects `pi-ai` first and preserves current recovery behavior. Implement the model transport/authentication replacement on Mac while keeping SQLite histories, queues, constrained actions and explicit Retry after interrupted work. Pi Durable and resumable execution are deferred. This scope is implemented on 19 October; Pi Durable remains deferred.

## Assistant attachments — 19 October 2026

The user requested local-file reading and pasted screenshot attachments. Exact user-supplied paths are imported only from local requests, with bounded PDF/text extraction and image attachments. No filesystem tool is exposed to the model. Current-chat retention and New chat cleanup follow the existing conversation lifecycle; see [assistant](../features/assistant.md#files-and-screenshots).
