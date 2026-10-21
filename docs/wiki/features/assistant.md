---
title: App-wide assistant
section: Features
updated: 2026-10-20
---
# App-wide assistant

Feature ID: `FEAT-assistant`

## Intent and basis

Support one persistent, restricted assistant that can coordinate attributable facts and real document edits. Based on the [accepted project boundaries](../decisions/index.md) and existing implementation documentation; this migration adds no product requirement.

## Entry points and prerequisites

Open assistant in the top-right page header; supplied job/document context and an available serialized [Pi AI connection](ai-runtime.md) are prerequisites for a real turn.

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

The Assistant button in the top-right page header opens one persistent conversation over any page. It uses pi-ai with an app-owned ChatGPT subscription connection, `gpt-5.6-sol` and high reasoning. Existing Codex credentials are left intact. It does not introduce another provider, API key or model fallback.

## Capabilities

| Request | Application behavior |
| --- | --- |
| Find React/TypeScript jobs in Malaysia | Query collected jobs with AND keywords, resolved location filters, match ranking, availability and eligibility. Return real clickable records. This does not start an internet-wide job search or a scan. |
| Refresh a project from its website/repository | Read supplied/recorded public URLs, follow same-origin links returned by those reads, and inspect commits/PRs within a supplied GitHub repository without asking the user to paste derived URLs. Save attributable project facts without inferring personal authorship or professional production experience. |
| Add/correct profile information | Read canonical facts, apply field edits supported by quotes from user messages or fetched references, and version the result. The onboarding skill remains active for missing essentials. |
| Edit the CV | Read and edit the actual master LaTeX source. Preserve unrelated sections and presentation. Compile LaTeX and report diagnostics. Data and HTML CV editing was removed on 8 October 2026. |
| Rewrite a saved cover letter | Read the existing letter and relevant facts/posting, save a new edited version, and link to Saved → job → Cover letter. No letter is sent or submitted. |

The current page/document is a context hint; explicit user intent persists across follow-ups. The last read document target also persists. Asking to edit a CV and then discussing a project should continue targeting that CV. When the user requests both factual and document updates, the assistant can coordinate them. A profile-only correction does not overwrite independent LaTeX wording, and a wording-only edit does not rewrite the profile.

## Files and screenshots

**Attach files** accepts PDF, UTF-8 text (`txt`, `md`, `csv`, `json`, `tex`), PNG, JPEG and WebP. Pasting an image into the composer attaches it with a preview and Remove action. Files can be sent without additional text. Draft attachment metadata survives reload in the same tab; submitted attachments stay available to follow-ups in the current conversation.

An absolute path or `~/` path on its own line (or quoted inline) imports exactly that user-supplied file when the request comes from the local computer. This resolves the reported Downloads PDF failure without giving the model a filesystem tool. Paths inside documents or model output are never opened. Credential directories and application-state files are excluded, including resolved symlinks. Home-network clients use Attach files instead of accessing the server's filesystem.

Each file is at most 10 MB; a message has at most five files totalling 20 MB. PDF extraction runs in a bounded worker with a 15-second timeout, 80-page limit and 100,000-character limit. Scanned PDFs without extractable text produce an actionable error; attach screenshots of those pages. Text files also have a 100,000-character limit. Inference retains bounded recent context: at most 20 attachments from the last 40 messages, 180,000 text characters and five images/20 MB, preferring recent attachments. Truncated text is marked.

Assistant replies render `[attachment:ID]` citations as clickable filenames using current-conversation metadata, including replies saved before this renderer existed. Unknown/deleted IDs show “Attachment unavailable”; code examples remain literal. Filename text is rendered safely, without interpreting it as Markdown. Read-only answers receive no automatic save footer; repeated legacy “No changes saved” footers collapse to one at render time.

Migration 013 stores uploaded bytes, extracted text and message links in local SQLite. Extracted text has an attachment source ID; accepted profile changes retain the filename and quoted evidence. Images support visual reading; image-only candidate claims require user confirmation before becoming profile facts. Files are untrusted evidence, not instructions. The selected inference service receives attachment content when a message is sent.

New chat deletes conversation attachments, including pending uploads, while preserving facts and saved evidence already committed to profile/document versions. Abandoned unsubmitted uploads expire after 24 hours when another file is added. ZIP backups omit chats and attachments; importing a ZIP clears both while preserving destination connection settings and credentials.

Run `npx tsx --test tests/attachments.test.ts` for extraction, path boundaries, retries, follow-up retention and cleanup. After `npm run build`, `npx tsx scripts/verify-assistant-attachments.ts` verifies the real composer with synthetic files and simulated inference on desktop/mobile. [19 October verification](../verification/runs/2026-10-19-pi-attachments.md) distinguishes these checks from real model and native checks.

## Execution and state

The app-wide assistant is the only conversation engine. Old `/api/profile/chat` start/message/cancel/retry routes are retired. Migration 011 routes unfinished legacy turns to the assistant while preserving IDs, messages, state, expected revisions, errors and usage; completed legacy turns retain their historical engine label. Restart recovery pauses interrupted work, and retry uses the existing assistant controls. Profile state/restore endpoints and evidence validation remain shared. A queued request whose profile revision changed conflicts before inference.

- `core/assistant/service.ts` runs a bounded application-action loop. Pi returns schema-validated action requests; the server executes only its allowlisted capabilities and returns results to the next inference step. The inference transport receives no executable tools; only the application validates and executes its bounded actions.
- `core/assistant/actions.ts` implements job queries, document reads, exact LaTeX replacements, structured profile/document edits, public references and PDF previews. The model must read a document before editing it and use the returned version identifier. Document actions expose LaTeX and saved cover letters; removed HTML/legacy CV targets are rejected. Profile-only saves report a profile receipt, not an HTML CV change.
- Changes stay in memory until completion. Profile, document versions, evidence audit, saved-version receipts and final reply commit together in one SQLite transaction. Nested savepoints allow existing store operations to participate. Conflicting versions, invalid fields, unresolved edit failures, cancellation and restarts do not commit staged edits.
- PDF compilation happens before commit. The agent can fix diagnostics and recompile. If it finishes with an unavailable/failed compiler, the source is still versioned and the final receipt explicitly says the preview failed; the previous PDF remains available. Successful compilation is not a guarantee that every layout or factual choice is ideal.
- Migration 009 adds engine/context/activity/receipt fields and an action audit to the existing persistent chat tables. Previous profile conversations and queued legacy turns are retained. The global UI uses `/api/assistant`; existing profile APIs remain compatible. The same active-turn constraint and worker/runtime leases serialize work. The worker checks for queued chat every second and scans yield between sources.
- A turn has at most ten inference rounds, five actions per round, eight public-reference HTTP requests and bounded document/context sizes. Reference pages are capped at 3 MB and 24,000 extracted characters. The UI shows progress and supports Stop; final replies appear after validation and saving, without token streaming.

## Boundaries and recovery

Public references are read-only GETs to user-supplied/profile URLs and concrete same-origin links returned by earlier reads (up to 80 links per source). Within a supplied GitHub repository, the assistant may construct commit lists/details and PR lists/details/files URLs; author filters must name an account mentioned by the user. These contribution routes map deterministically to public GitHub API GETs, without credentials; repository roots still map to README. Lists are bounded to 30 results, with the existing eight-request/24,000-character limits, so findings must not imply an exhaustive contribution audit. The assistant should fetch known in-scope URLs itself, asking for content only when retrieval actually fails.

DNS and connection addresses must be public; redirects stay on the expected host, credentials are not attached, unrelated constructed URLs and arbitrary query fields remain rejected. Web content, returned links, commit messages and job descriptions remain untrusted evidence. Attribution to a public account supports only the work shown; it does not prove sole ownership, professional scope or authorship of an entire repository. Reference access is not an unrestricted browser or search engine.

Verification: `npx tsx --test tests/assistant.test.ts` checks derived routes, author/query/repository boundaries, same-origin follow-ups and save receipts. `npx tsx scripts/verify-assistant-references.ts REPOSITORY_URL AUTHOR` performs three live public reads on an isolated database, without inference or credentials; use a repository/account with public commits. [Citation and reference repair](../verification/runs/2026-10-19-assistant-references.md) records browser/native and live retrieval results.

The assistant cannot access app credentials, run shell commands, explore the local filesystem, submit applications, contact employers, send messages, change applied status, or deliver documents externally. Existing LaTeX compilation remains offline and sandboxed. HTML/Markdown previews cannot execute scripts or load remote images.

All edits create versions. Restore profile/CV/letter versions with their existing editor controls. Saved-version receipts link to the correct view. Clean editors refresh after completion; dirty or historical editors retain their text and show a notice. Manual saves carry expected version identifiers so they cannot silently overwrite an assistant edit. Save a local copy before reloading if concurrent edits need to be reconciled. Retry rereads current records rather than blindly replaying old writes.

## Verification commands

[Windows Pi verification — 20 October 2026](../verification/runs/2026-10-20-windows-pi.md) records Windows attachment browser checks and packaged PDF extraction coverage, with live Windows model inference remaining separate.

`npm test` covers the action loop, capabilities, evidence, job filters, version conflicts, cancellation and rollback. `npx tsx scripts/verify-assistant-ui.ts` runs a synthetic browser workflow with simulated inference and actual PDF compilation. `JH_PI_VERIFY_CREDENTIALS=/private/path/credentials.json npx tsx scripts/verify-pi-app.ts` performs real subscription inference with synthetic profile/CV data in an isolated temporary database; it consumes allowance and does not edit the user's documents. See [verification results](../verification/history.md).

Cover-letter actions edit content only using the complete document schema. The assistant cannot read or change a letter template; previews and committed versions use the same shared layout as manual editing. [Verification — 16 October 2026](../verification/runs/2026-10-16-lean-cover-letters.md).
