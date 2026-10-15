---
title: Lean cleanup plan
section: Journal
updated: 2026-10-16
status: Complete
---
# Lean cleanup plan

On 16 October 2026 the user accepted the rule-lean review: “i wholly agree with all of it. lets go with the leaner approach for all of it. resolve them one by one.” They requested a grill-form session for remaining first-pass decisions. Implementation is authorized after resolving those decisions; the progress section below links implementation and verification results.

## Accepted direction and sequence

First pass, performed sequentially:

1. Remove the optional WebMCP interface.
2. Retire obsolete HTML/JSON CV editing routes and stop creating new legacy CV versions on profile changes. Preserve historical resumes and their read/download access, canonical profile revisions, and the independent LaTeX CV.
3. Remove Adzuna, Jooble and Careerjet from default source setup while preserving existing records. These are placeholders with no working adapters, not functioning sources to prune.

Subsequent items, handled one at a time:

4. Consolidate profile conversations into the app-wide assistant; preserve shared evidence validation, chat history, profile revisions and outstanding work.
5. Retire executable Jev integration code while retaining credentials, settings, assessments, queued work and counters. The user's acceptance changes the planned direction from temporary disablement to retirement; no re-enablement or data deletion is authorized.
6. Simplify cover-letter authoring toward prose with a shared layout and fewer export paths. The second interview selects plain text with paragraph breaks, Copy text and PDF. Existing records remain stored; all letter output uses the shared layout.

Existing backups, listing evidence, retry queues, collection checkpoints, working sources, native app lifecycle and local hosting requirements continue to apply. No external submission or engagement capability is introduced.

## First-pass answers

The [submitted interview](2026-10-15-grill-dff63a8e-60b3-4aec-b841-aa0a5fa00446.md) settles the remaining choices:

- Historical resumes retain API-only read/download access; no archive UI is added.
- Existing Adzuna, Jooble and Careerjet records stay stored but are hidden from Sources and excluded from scanning. New setup does not offer or create them.

The transcript filename uses the collector's UTC date. These answers complete first-pass clarification; implementation can proceed within the existing authorization. Later feature and decision updates distinguish implementation and verification from this accepted plan.

## Progress

First-pass items 1–3 are implemented and [verified](../verification/runs/2026-10-15T165802Z-lean-first-pass.md). The installed native bundle had not yet been rebuilt at that checkpoint. On 16 October the user invoked work-until-grill: continue approved items autonomously, using grill-form for consequential unresolved choices. Items 4–5 are now [implemented and verified](../verification/runs/2026-10-16-lean-assistant-jev.md): one assistant engine, preserved legacy turn history/retries, and executable Jev retirement with retained data. Item 6 is now implemented and [verified](../verification/runs/2026-10-16-lean-cover-letters.md). All six approved items are complete. At the user’s subsequent request, the [native bundle was rebuilt, installed and reopened](../verification/runs/2026-10-16-lean-native-install.md). Data preservation and lifecycle checks passed; the existing large-inbox refresh timeout remains unresolved.

## Cover-letter answers and implementation

The [second submitted interview](2026-10-15-grill-c7050aa1-cfbb-429f-9ecd-6ff4875c9c24.md) chooses Copy text and PDF, and plain text with paragraph breaks. For old layouts the user replied “ignore older cover letters. this is not in use yet”. This removes the need for legacy-layout compatibility; it does not require deleting stored records. All previews/exports use the shared layout, and new generated, manual and assistant versions save that layout.

The prose editor retains generation/retry, versions, restoration, preview and unsaved-edit protection. Cover-letter HTML/CSS editing, DOCX/HTML exports and the separate Word renderer are removed. Three unused CodeMirror language dependencies are removed; LaTeX keeps its existing editor. Historical resume downloads still need the existing export dependencies. The browser recipe now uses fictional fixtures instead of copying personal records from a running API.
