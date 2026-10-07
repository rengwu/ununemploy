---
title: Optional Jev assessment
section: Features
updated: 2026-10-07
---
# Optional Jev assessment

Feature ID: `FEAT-jev`

## Intent and basis

Optionally supplement fit, geography, arrangement and applicability assessment when the user configures TypeSafe. Based on the [accepted project boundaries](../decisions/index.md) and existing implementation documentation; this migration adds no product requirement.

## Entry points and prerequisites

Settings → Jev configures the key and limits; Match → Assess with Jev prioritizes a job. No key means no requests.

## Expected outcomes

Disabling the integration restores baseline behavior. Unknown eligibility remains distinct from supported conflicts. Keys stay server-side; stale responses and limits are enforced. Codex still generates cover letters.

## Verification recipe

Use [shared verification setup](../verification/setup.md) for isolation, build identity, evidence and cleanup. `npx tsx --test tests/jev.test.ts` uses simulated provider responses. After `npm run build`, `npx tsx scripts/verify-jev-ui.ts` drives isolated settings and job assessment UI with simulated inference.

Recipes are migrated from existing scripts and historical checks; they were not re-executed during the wiki migration.

## Coverage and limitations

Authenticated TypeSafe access and actual assessment quality remain unverified. Provider inference is separately billed.

## Verification history

[Historical implementation checks](../verification/history.md) record previous selected scenarios and limitations. Those entries are historical evidence; new reports belong in [verification runs](../verification/index.md).


Jev supplements local job matching through TypeSafe AI's official `POST https://api.typesafe.ai/v1/systemone` endpoint using `jev-latest`. It is a separately configured integration, not a fallback for Codex. Cover letters still use the configured official Codex runtime.

## Configure

Open **Settings → Jev**, set the daily request limit if desired (default **100**, UTC day), and save a TypeSafe API key. Saving a key enables assessment. The worker assesses one posting per tick, prioritizing explicitly queued jobs, then saved jobs, then existing match strength and recency. Existing open, non-dismissed jobs are included; the collection is processed gradually within the limit. **Match → Assess with Jev** moves a posting to the front of the queue. Reads and browser polling never trigger inference.

A key may alternatively be supplied through `JH_JEV_API_KEY`. Dashboard configuration takes precedence. **Remove API key** stores an empty local override, including when an environment key exists. **Pause Jev** and key removal disable both requests and the application of cached results, restoring the original matching and filtering. Cached assessments remain local and can be reused after re-enabling. A daily limit of zero prevents requests while retaining cached assessments.

Keys are stored in `secrets/jev.json` under the appdata directory, with mode 0600. They are not returned to the browser or included in SQLite backups. Persistent appdata works identically in local development and the Unraid container; no deployment was performed for this change.

## Data sent

One bounded request contains a posting's title, location, work arrangement and complete description, plus relevant structured career evidence, project attribution, education qualifications, citizenship, current location, work authorization and relocation preferences. The projection omits structured contact details, candidate name, employers, source URLs/files, private saved-job notes, application history and generated documents. Free-text career evidence and posting descriptions themselves are sent to TypeSafe. No arbitrary links in the posting are fetched. Keys go only to the fixed TypeSafe endpoint; redirects are rejected.

Review master facts in **CV**. `basics.citizenship` and `basics.location` provide citizenship/current residence. `preferences.workAuthorizationCountries` can hold confirmed country names; omit it or use `null` when unknown. An empty array explicitly records no additional authorization beyond citizenship. The existing `preferences.existingWorkAuthorizationsOutsideMalaysia` remains supported for this installation. `preferences.relocation` retains the existing preference. Do not enter inferred authorization as a confirmed fact.

## Behavior

- **Match:** a confident role-fit decision adjusts the existing score by averaging it with the category score (85 strong, 55 adjacent, 30 stretch, 10 other). Existing evidence caps remain; incomplete descriptions retain their original score. The Match tab shows the adjustment alongside the original breakdown. Jev confidence is not the probability of being hired.
- **Geography:** a local gazetteer finds up to 24 candidate place names. Jev classifies each as workplace, hiring area, incidental/excluded, or unknown. A separate decision selects an exact location evidence span. Accepted locations participate in the existing country/region filters. For remote jobs, only hiring areas replace the source location. Headquarters alone do not establish a job's location. Unrecognized/ambiguous places retain source behavior.
- **Arrangement:** confident remote/hybrid/onsite decisions with a selected evidence span update the displayed arrangement and filters. Original source fields remain visible in the assessment.
- **Applicability:** sponsorship and eligibility are assessed separately. Silence about sponsorship, foreign citizenship, missing authorization, or an unknown relocation preference do not establish impossibility. A Jev conflict normally means review. Additional exclusion requires confidence/probability of at least 0.95, a selected restriction quote, and corroboration by the existing deterministic eligibility checks using confirmed candidate facts. Other applied decisions require confidence and selected-option probability of at least 0.85. Existing explicit conflicts are not cleared by an optimistic model answer. Incompatible jobs remain accessible through the eligibility filter; Saved keeps all saved records.

These are assessments of posting evidence, not immigration-law verification, visa guarantees, or predictions of employer acceptance. Jev has no browsing, tools, application-submission or engagement capabilities here. Description text is untrusted input.

## Persistence and failures

Migration 007 stores per-job assessment state and results separately from source records and drafts. A fingerprint covers relevant posting and candidate input plus model/prompt version; content and relevant profile edits invalidate results. Notes and contact-only edits do not. In-flight responses are discarded if inputs or credentials changed. The worker serializes Jev work through a database lease and performs it sequentially with cover-letter generation. Interrupted work becomes eligible again after 90 seconds.

Every attempted request reserves one daily request before network activity. Reservations remain after timeout or failure. Reported token counts are recorded separately. This is a request cap, not a currency spending guarantee. The worker honors Retry-After and uses exponential backoff. Authentication, account allowance, schema errors and permanent API failures pause requests with a Settings message and Retry action. Overlong inputs fail locally without truncation or a provider request. No model/provider/billing fallback is used.

## Verification

`npx tsx --test tests/jev.test.ts` exercises no-key behavior, credential storage/removal, payload minimization, response validation, caching, filtering, persistence, stale responses, limits, authentication failures, retry timing and eligibility uncertainty with simulated provider responses. `npx tsx scripts/verify-jev-ui.ts` uses an isolated database and simulated inference to verify settings, queuing, evidence display, removal and desktop/mobile layout. Run `npm run build` before the browser check.

An authenticated TypeSafe request has **not** been verified: no user key was configured or consumed during implementation. Actual provider quality and account access require verification after configuration.

References: [TypeSafe API](https://docs.typesafe.ai/api), [Choice](https://docs.typesafe.ai/primitives/choice), [confidence](https://docs.typesafe.ai/confidence), [known model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).
