---
title: User profile and evidence
section: Features
updated: 2026-10-07
---
# User profile and evidence

Feature ID: `FEAT-profile`

## Intent and basis

Keep attributable career facts canonical and distinct from document wording and inference. Based on the [accepted project boundaries](../decisions/index.md) and existing implementation documentation; this migration adds no product requirement.

## Entry points and prerequisites

User profile → Edit with assistant; advanced CV data editing shares the same SQLite profile versions. New installations start empty.

## Expected outcomes

Unknown eligibility does not prevent discovery once essential profile fields are complete. Quoted change evidence, revisions and chat persist; invalid/conflicting edits cannot silently replace facts.

## Verification recipe

Use [shared verification setup](../verification/setup.md) for isolation, build identity, evidence and cleanup. `npx tsx --test tests/profile-chat.test.ts tests/assistant.test.ts` exercises isolated facts and chat handling. `npx tsx scripts/verify-assistant-ui.ts` exercises onboarding and saved facts with simulated inference.

Recipes are migrated from existing scripts and historical checks; they were not re-executed during the wiki migration.

## Coverage and limitations

Real interpretation quality is not established by schema validation. Real runtime recipes consume subscription allowance; see [setup](../verification/setup.md).

## Verification history

[Historical implementation checks](../verification/history.md) record previous selected scenarios and limitations. Those entries are historical evidence; new reports belong in [verification runs](../verification/index.md).


The versioned SQLite profile is the canonical facts record. **User profile** renders it directly and uses the bundled onboarding skill to guide chat edits. Discovery requires a name, current location, target roles, useful career/education/project background, and work-arrangement preferences. Contact details, citizenship and visa answers are optional; unknown eligibility remains unknown. Both manual and scheduled scans enforce this gate, including after a restore removes essential information. Scheduling still respects Settings.

Chat history, queued turns, quoted change evidence and document versions persist locally. The app-wide assistant reads records through explicit application actions, stages changes, validates them and commits coordinated edits atomically with version checks. Replies link to the saved records and report their actual versions and preview results. Stop discards uncommitted work; authentication failures, interrupted requests and conflicts support retry. A failed PDF compilation is reported explicitly and retains the prior preview while preserving the newly versioned source. Editors refresh after successful assistant changes unless they contain unsaved text or are showing a historical version.

Profile facts and document wording remain distinct. A request to update a project in the CV can update the facts and actual LaTeX document together. A profile-only correction updates master facts and the data/HTML representation; it does not silently overwrite independent LaTeX wording. A wording-only letter or CV edit leaves the underlying facts alone. Profile updates refresh deterministic matching and invalidate relevant Jev assessments. Review resulting facts and documents: schema and quote checks cannot prove every interpretation is correct. See [assistant capabilities and architecture](assistant.md).

Fresh databases start empty. `JH_PROFILE_SEED=/absolute/path/to/profile.json` explicitly imports a structured profile only on first initialization (optional local evidence). `data/candidate-profile.json` and `docs/MASTER_CV.md` retain the original local evidence; neither overwrites an existing profile. See the profile guide (`core/profile/skills/build-user-profile/SKILL.md`).
