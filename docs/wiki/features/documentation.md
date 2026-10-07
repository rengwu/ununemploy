---
title: Project wiki
section: Features
updated: 2026-10-07
---
# Project wiki

Feature ID: `FEAT-documentation`

## Intent and basis

[DEC-wiki](../decisions/index.md) adopts jstack and migrates the project guides into an offline Markdown wiki. This changes documentation organization, not the application runtime or UI.

## Entry points and prerequisites

Open repository README → wiki home or `docs/wiki/index.html`. Node 22+ builds the reader. The sibling jstack checkout supplies process skills and the report checker; a checked-in builder makes the reader independently rebuildable.

## Expected outcomes

Current guides, accepted decisions, historical research and verification remain navigable and searchable. Links resolve, the generated reader matches Markdown, and the reader works without network requests. Candidate evidence and local raw logs are excluded. Existing runtime skills and agent instructions remain at their original entry points.

## Verification recipe

Run the [wiki commands](../verification/setup.md#wiki-checks). Open the reader locally, follow a feature link, search for a documented topic, inspect Markdown source and check a mobile-width viewport. Compare `_build.mjs` with the jstack asset and confirm original private paths remain ignored. Link the sanitized results from a dated run.

## Coverage and limitations

Structural validation cannot establish external link availability, live provider access or product behavior. Historical notes keep their original evidence limits. Root and directory READMEs are pointers into the wiki; `AGENTS.md` and the profile runtime skill retain their special purposes.

## Verification history

See the [migration check](../verification/runs/2026-10-07T042714Z-wiki-migration.md) and [migration journal](../journal/2026-10-07-jstack-migration.md) for the move map.
