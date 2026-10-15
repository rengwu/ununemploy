---
title: Saved-job cover letters
section: Features
updated: 2026-10-16
---
# Saved-job cover letters

Feature ID: `FEAT-cover-letters`

## Intent and basis

Saving a job prepares a private tailored cover letter while keeping the master CV separate. Based on the [accepted project boundaries](../decisions/index.md) and existing implementation documentation; this migration adds no product requirement.

## Entry points and prerequisites

Jobs → Save; Saved → job → Cover letter. Requires complete posting text, supported profile evidence and available Codex authentication/allowance.

## Expected outcomes

First-save generation is idempotent and serialized. Failures retain saved work with retry. Manual edits and restores append versions. Legacy resumes retain API-only read/download access; no per-job resume is generated.

## Verification recipe

Use [shared verification setup](../verification/setup.md) for isolation, build identity, evidence and cleanup. `npx tsx --test tests/cover-letters.test.ts tests/system.test.ts` covers isolated task/storage boundaries. After `npm run build`, `npx tsx scripts/verify-cv-workflow.ts` exercises save/edit/restore/download with simulated generation and real exports.

The browser driver uses a temporary database, a fictional candidate/job fixture and an ephemeral loopback port. Default generation is simulated; saves, previews, clipboard and PDF exports exercise the actual application. It does not read personal records from a running instance.

## Coverage and limitations

`--real-generation` consumes subscription allowance. Layout checks apply to tested fixtures; letters require user review and are never sent.

## Verification history

[Cursor-inspired UI redesign — 16 October 2026](../verification/runs/2026-10-16-cursor-redesign.md) records the replacement controls, responsive/theme checks, preserved workflows and native installation.

[Historical implementation checks](../verification/history.md) record previous selected scenarios and limitations. Those entries are historical evidence; new reports belong in [verification runs](../verification/index.md).


Open **Saved → job → Cover letter** for generation/retry, plain-text fields, previews, versions, Copy text and Download PDF. Save appends a version; Restore appends a restored version. Old `#letters` links redirect to the saved job tab. There is no standalone Cover letters page.

Saving snapshots the job description and master profile revision. Generation, manual saves, assistant edits, previews and PDF exports use one application-owned layout. Generation is serialized and produces first-person paragraphs, targeting 250–350 words, with relevant examples from the confirmed profile. The application supplies the name, contact details, company, role, salutation, and signature; the generated prose cites internal evidence IDs and is checked for unknown references and unsupported numeric claims. These checks do not prove semantic truth: review the draft before using it. Unconfirmed details appear in review notes, outside the letter.

Cover letters have their own storage and version history. Migration 004 converts unfinished resume tasks to cover-letter tasks, pausing interrupted runs for retry. Completed resumes and manual edits stay stored with API-only read/download access. Existing saved jobs with only a resume show **Generate cover letter**; the update does not bulk-generate new documents. New saved jobs generate letters automatically. The master CV remains independently editable and exportable.

Codex has no shell, browser, connector, plugin, or messaging capabilities in generation runs. Job text is treated as untrusted source material. Authentication, model-access, allowance, or validation failures keep the saved job and expose a retryable task. There is no model or paid API fallback. Retry paused tasks after restoring access or allowance.

## Plain-text editing and output

The [accepted lean interview](../journal/2026-10-15-grill-c7050aa1-cfbb-429f-9ecd-6ff4875c9c24.md) selects plain text with paragraph breaks and Copy text plus PDF. The user said older letters are not in use, so there is no legacy-layout UI or compatibility mode. Existing storage remains intact; all previews and exports use the shared layout.

Company, role, greeting and sign-off are normal fields. Contact details can be expanded and edited separately. Blank lines separate body paragraphs; single line breaks remain visible. Copy text includes the contact block, recipient, greeting, body and sign-off, and reports success or failure. PDF and preview use the same layout. Cover-letter DOCX/HTML downloads and layout editing have been removed, including their API/assistant actions. The letter API accepts document content only; callers cannot supply templates. Historical resume export support is independent.

Generation/retry, review notes, version restoration, save conflicts and unsaved-edit guards remain. Restoring appends a version. Assistant updates reload a clean editor and preserve unsaved text.

[Lean cover-letter verification — 16 October 2026](../verification/runs/2026-10-16-lean-cover-letters.md).
