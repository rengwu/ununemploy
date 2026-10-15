---
title: App-wide assistant
section: Features
updated: 2026-10-16
---
# App-wide assistant

Feature ID: `FEAT-assistant`

## Intent and basis

Support one persistent, restricted assistant that can coordinate attributable facts and real document edits. Based on the [accepted project boundaries](../decisions/index.md) and existing implementation documentation; this migration adds no product requirement.

## Entry points and prerequisites

Open assistant in the top-right page header; supplied job/document context and an available serialized Codex runtime are prerequisites for a real turn.

## Expected outcomes

The overlay preserves page bounds, context and unsent drafts; Escape restores focus. Atomic saves retain versions and report actual preview results. New chat clears conversation state while preserving saved facts and documents.

The drawer header uses the shared fixed 58px app-header height, including its bottom border. Its lower edge aligns with the outside page header in both themes and at desktop/mobile sizes; header controls stay vertically centered without increasing the height.

The conversation starts directly below the header, without a page-context/model strip. Context and unsaved-state information still accompany assistant requests internally. The composer omits the keyboard hint, keeps Send/Stop on the right, and retains Enter to send and Shift+Enter for a new line. Model/status information remains in Settings.

## Verification recipe

Use [shared verification setup](../verification/setup.md) for isolation, build identity, evidence and cleanup. `npm test` covers action/evidence/version boundaries. After `npm run build`, `npx tsx scripts/verify-assistant-ui.ts` drives the actual UI with synthetic data, simulated inference and real compilation. The detailed runtime command is below.

Recipes are migrated from existing scripts and historical checks; they were not re-executed during the wiki migration.

For header alignment, open the assistant on an isolated Jobs page and compare `.assistant-header` with `.page-header` bounding rectangles at desktop, short-window and mobile sizes in both themes. Their top, bottom and height must match; New chat and Hide assistant must fit inside the header. This geometry check requires no model turn or compiler.

## Coverage and limitations

The synthetic UI check does not establish current authentication or every interpretation. No unrestricted shell, filesystem, external writes, messaging or application actions are available.

## Verification history

[Cursor-inspired UI redesign — 16 October 2026](../verification/runs/2026-10-16-cursor-redesign.md) records the replacement controls, responsive/theme checks, preserved workflows and native installation.

[Assistant consolidation and Jev retirement — 16 October 2026](../verification/runs/2026-10-16-lean-assistant-jev.md): preserved queued/history data, one assistant engine, removed Jev capabilities, 184 tests, build and desktop/mobile browser checks.

[Lean cleanup first pass — 16 October 2026](../verification/runs/2026-10-15T165802Z-lean-first-pass.md): WebMCP removal, retired legacy CV writes with preserved downloads, and hidden/unscanned placeholder sources; 200 tests, build and isolated browser checks passed.

[ZIP backups and LaTeX-only CV — 8 October 2026](../verification/runs/2026-10-07T182813Z-backups.md) records archive validation/replacement, the two-button browser and native flows, LaTeX/assistant checks and installation.

[Assistant copy cleanup — 8 October 2026](../verification/runs/2026-10-07T174902Z-assistant-copy.md) passed browser checks for removed labels, right-aligned Send, retained newline/context behavior and header geometry.

[Assistant header alignment — 7 October 2026](../verification/runs/2026-10-07T130816Z-assistant-header.md) passed geometry checks at desktop, short-window and mobile sizes in both themes.

[Historical implementation checks](../verification/history.md) record previous selected scenarios and limitations. Those entries are historical evidence; new reports belong in [verification runs](../verification/index.md).


**New chat** in the assistant header clears the conversation, turn/action history, remembered document focus, and the current tab's unsent draft. Saved profile facts, source evidence, change quotes, document versions and jobs remain intact. There is no conversation archive. Wait for an active reply or use **Stop** before starting a new chat; the server also waits for the worker to release the chat before allowing a reset.

The Assistant button in the top-right page header opens one persistent conversation over any page. It uses the official Codex CLI, the existing ChatGPT subscription login, `gpt-5.6-sol` and high reasoning. It does not introduce another provider, API key or model fallback.

## Capabilities

| Request | Application behavior |
| --- | --- |
| Find React/TypeScript jobs in Malaysia | Query collected jobs with AND keywords, resolved location filters, match ranking, availability and eligibility. Return real clickable records. This does not start an internet-wide job search or a scan. |
| Refresh a project from its website/repository | Read exact supplied or recorded public URLs, using a GitHub repository's README where applicable. Save attributable project facts without inferring personal authorship or professional production experience. |
| Add/correct profile information | Read canonical facts, apply field edits supported by quotes from user messages or fetched references, and version the result. The onboarding skill remains active for missing essentials. |
| Edit the CV | Read and edit the actual master LaTeX source. Preserve unrelated sections and presentation. Compile LaTeX and report diagnostics. Data and HTML CV editing was removed on 8 October 2026. |
| Rewrite a saved cover letter | Read the existing letter and relevant facts/posting, save a new edited version, and link to Saved → job → Cover letter. No letter is sent or submitted. |

The current page/document is a context hint; explicit user intent persists across follow-ups. The last read document target also persists. Asking to edit a CV and then discussing a project should continue targeting that CV. When the user requests both factual and document updates, the assistant can coordinate them. A profile-only correction does not overwrite independent LaTeX wording, and a wording-only edit does not rewrite the profile.

## Execution and state

The app-wide assistant is the only conversation engine. Old `/api/profile/chat` start/message/cancel/retry routes are retired. Migration 011 routes unfinished legacy turns to the assistant while preserving IDs, messages, state, expected revisions, errors and usage; completed legacy turns retain their historical engine label. Restart recovery pauses interrupted work, and retry uses the existing assistant controls. Profile state/restore endpoints and evidence validation remain shared. A queued request whose profile revision changed conflicts before inference.

- `core/assistant/service.ts` runs a bounded application-action loop. Codex returns schema-validated action requests; the server executes only its allowlisted capabilities and returns results to the next inference step. The underlying runtime retains disabled shell, browser, connector and plugin tools.
- `core/assistant/actions.ts` implements job queries, document reads, exact LaTeX replacements, structured profile/document edits, public references and PDF previews. The model must read a document before editing it and use the returned version identifier. Document actions expose LaTeX and saved cover letters; removed HTML/legacy CV targets are rejected. Profile-only saves report a profile receipt, not an HTML CV change.
- Changes stay in memory until completion. Profile, document versions, evidence audit, saved-version receipts and final reply commit together in one SQLite transaction. Nested savepoints allow existing store operations to participate. Conflicting versions, invalid fields, unresolved edit failures, cancellation and restarts do not commit staged edits.
- PDF compilation happens before commit. The agent can fix diagnostics and recompile. If it finishes with an unavailable/failed compiler, the source is still versioned and the final receipt explicitly says the preview failed; the previous PDF remains available. Successful compilation is not a guarantee that every layout or factual choice is ideal.
- Migration 009 adds engine/context/activity/receipt fields and an action audit to the existing persistent chat tables. Previous profile conversations and queued legacy turns are retained. The global UI uses `/api/assistant`; existing profile APIs remain compatible. The same active-turn constraint and worker/runtime leases serialize work. The worker checks for queued chat every second and scans yield between sources.
- A turn has at most ten inference rounds, five actions per round, eight public-reference HTTP requests and bounded document/context sizes. Reference pages are capped at 3 MB and 24,000 extracted characters. The UI shows progress and supports Stop; final replies appear after validation and saving, without token streaming.

## Boundaries and recovery

Public references are read-only GETs to exact user-supplied/profile URLs. GitHub repository-to-README mapping is deterministic. DNS and connection addresses must be public; redirects stay on the expected host, credentials are not attached, and arbitrary model-constructed URLs are rejected. Read failures are returned to the assistant so it can request pasted text. Web content and job descriptions remain untrusted data. Reference access is not an unrestricted browser or search engine.

The assistant cannot access app credentials, run shell commands, read arbitrary local files, submit applications, contact employers, send messages, change applied status, or deliver documents externally. Existing LaTeX compilation remains offline and sandboxed. HTML/Markdown previews cannot execute scripts or load remote images.

All edits create versions. Restore profile/CV/letter versions with their existing editor controls. Saved-version receipts link to the correct view. Clean editors refresh after completion; dirty or historical editors retain their text and show a notice. Manual saves carry expected version identifiers so they cannot silently overwrite an assistant edit. Save a local copy before reloading if concurrent edits need to be reconciled. Retry rereads current records rather than blindly replaying old writes.

## Verification commands

`npm test` covers the action loop, capabilities, evidence, job filters, version conflicts, cancellation and rollback. `npx tsx scripts/verify-assistant-ui.ts` runs a synthetic browser workflow with simulated inference and actual PDF compilation. `npx tsx scripts/verify-assistant-runtime.ts` performs real subscription inference with synthetic profile/CV data in an isolated temporary database; it consumes allowance and does not edit the user's documents. See [verification results](../verification/history.md).

Cover-letter actions edit content only using the complete document schema. The assistant cannot read or change a letter template; previews and committed versions use the same shared layout as manual editing. [Verification — 16 October 2026](../verification/runs/2026-10-16-lean-cover-letters.md).
