---
title: Saved-job cover letters
section: Features
updated: 2026-10-07
---
# Saved-job cover letters

Feature ID: `FEAT-cover-letters`

## Intent and basis

Saving a job prepares a private tailored cover letter while keeping the master CV separate. Based on the [accepted project boundaries](../decisions/index.md) and existing implementation documentation; this migration adds no product requirement.

## Entry points and prerequisites

Jobs → Save; Saved → job → Cover letter. Requires complete posting text, supported profile evidence and available Codex authentication/allowance.

## Expected outcomes

First-save generation is idempotent and serialized. Failures retain saved work with retry. Manual edits and restores append versions. Legacy resumes remain accessible; no per-job resume is generated.

## Verification recipe

Use [shared verification setup](../verification/setup.md) for isolation, build identity, evidence and cleanup. `npx tsx --test tests/cover-letters.test.ts tests/system.test.ts` covers isolated task/storage boundaries. After `npm run build`, `npx tsx scripts/verify-cv-workflow.ts` exercises save/edit/restore/download with simulated generation and real exports.

Recipes are migrated from existing scripts and historical checks; they were not re-executed during the wiki migration.

## Coverage and limitations

`--real-generation` consumes subscription allowance. Layout checks apply to tested fixtures; letters require user review and are never sent.

## Verification history

[Historical implementation checks](../verification/history.md) record previous selected scenarios and limitations. Those entries are historical evidence; new reports belong in [verification runs](../verification/index.md).


Open **Saved → job → Cover letter** for generation/retry, the JSON/HTML/CSS editor, previews, versions and PDF/DOCX downloads. Save appends a version; Restore appends a restored version. Old `#letters` links redirect to the saved job tab. There is no standalone Cover letters page.

Saving snapshots the job description, master profile revision, and cover-letter template. Generation is serialized and produces first-person paragraphs, targeting 250–350 words, with relevant examples from the confirmed profile. The application supplies the name, contact details, company, role, salutation, and signature; the generated prose cites internal evidence IDs and is checked for unknown references and unsupported numeric claims. These checks do not prove semantic truth: review the draft before using it. Unconfirmed details appear in review notes, outside the letter.

Cover letters have their own storage and version history. Migration 004 converts unfinished resume tasks to cover-letter tasks, pausing interrupted runs for retry. Completed resumes and manual edits stay intact under CV. Existing saved jobs with only a resume show **Generate cover letter**; the update does not bulk-generate new documents. New saved jobs generate letters automatically. The master CV remains independently editable and exportable.

Codex has no shell, browser, connector, plugin, or messaging capabilities in generation runs. Job text is treated as untrusted source material. Authentication, model-access, allowance, or validation failures keep the saved job and expose a retryable task. There is no model or paid API fallback. Retry paused tasks after restoring access or allowance.
