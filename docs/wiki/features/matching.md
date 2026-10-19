---
title: Matching and listing quality
section: Features
updated: 2026-10-19
---
# Matching and listing quality

Feature ID: `FEAT-matching`

## Intent and basis

Explain role fit separately from eligibility, preserve listing evidence and group likely duplicate vacancies. Based on the [accepted project boundaries](../decisions/index.md) and existing implementation documentation; this migration adds no product requirement.

## Entry points and prerequisites

Jobs/Saved filters and Match tab; configured canonical facts determine evidence and eligibility.

## Expected outcomes

Unknown authorization stays under review; explicit conflicts remain accessible. Grouping preserves originals, notes and documents. Complete/manual descriptions take precedence and bounded feed absence does not close a job.

## Verification recipe

Use [shared verification setup](../verification/setup.md) for isolation, build identity, evidence and cleanup. `npx tsx --test tests/matching.test.ts tests/listing-quality.test.ts` covers fixtures. `npx tsx scripts/verify-listing-upgrade.ts` checks isolated migration/restart behavior. `npx tsx scripts/verify-matching-ui.ts` depends on named postings in the live local collection and may need fixture maintenance.

Recipes are migrated from existing scripts and historical checks; they were not re-executed during the wiki migration.

## Coverage and limitations

Conservative heuristics and a small evaluation corpus do not establish broad matching accuracy or legal eligibility.

## Verification history

[Historical implementation checks](../verification/history.md) record previous selected scenarios and limitations. Those entries are historical evidence; new reports belong in [verification runs](../verification/index.md).


Implemented locally on 16 September 2026.

## Matching

The matcher uses an explicit, deterministic scoring rubric. It does not call an AI model for every discovered job or consume additional ChatGPT allowance. The score expresses fit against the recorded profile, not a probability of getting hired.

- Role family carries the most weight. Frontend, product, full-stack, native/web and developer-tool roles take priority; related engineering roles remain visible.
- Technology evidence distinguishes employment entries from personal projects. The Match tab shows the score components and the relevant technologies. Project experience does not establish professional AI tenure.
- Level and specialist requirements limit scores when the profile does not establish the requested depth. Staff, research, unsupported primary technologies, and incomplete descriptions require review.
- General mentions of AI, coding, or native products cannot turn an account executive role into an engineering match. Employer tenure and EEO boilerplate are not candidate requirements.
- Ingestion, description edits, profile edits, and the versioned upgrade recompute matches. Reassessment does not regenerate or alter existing CVs.

### Eligibility

Use only confirmed citizenship, current location, work-authorization and relocation facts from the canonical profile. `preferences.workAuthorizationCountries` records country names; `null` or omission means unknown and an empty array records no additional authorization beyond citizenship. The legacy `existingWorkAuthorizationsOutsideMalaysia` field remains supported. Candidate-specific answers stay in the local profile, not this documentation.

Role fit is independent of eligibility. A technically strong vacancy can still be incompatible.

- Explicit conflicting citizenship, existing authorization without an available route, or current-residency restrictions can produce **Incompatible**, with the supporting posting clause.
- Foreign hiring-country restrictions normally produce **Needs review** because relocation remains possible. A listing's office location does not by itself establish a remote hiring restriction.
- No sponsorship by itself stays under review when the confirmed profile permits pursuing an independent visa route. An explicit existing-authorization requirement can establish a conflict.
- Unclear or conditional sponsorship, conflicting company boilerplate, citizenship/residency alternatives, and independently obtainable visas stay under review. Security clearance alone does not imply a citizenship rule.
- The default Jobs view uses **No known conflict**. **Any eligibility**, **Needs review**, and **Incompatible** remain selectable. Saved retains every saved/applied record.
- Explicit hiring scope can indicate whether remote work from the candidate's current location is possible, restricted, or unknown; it does not establish legal eligibility.

The parser recognizes a bounded English country/requirement vocabulary. It is conservative around unsupported countries, languages, ambiguous clauses, immigration routes, and clearance details. It is not a legal determination. Review the original posting when deciding whether to apply. Original source location text is preserved; the bundled [geography lookup](../reference/geography.md) now adds country/region browsing facets without establishing eligibility. Compensation remains a soft preference.

## Duplicate listings

IDs and canonical URLs still identify observations of the same stored job. Additionally, the results group likely duplicate vacancies across boards:

1. An explicit job-specific Ashby, Greenhouse, or Lever posting identity can match across URL aliases and board copies.
2. Otherwise, require the same normalized employer/title/location, compatible arrangement and employment type, publication dates within 45 days, and substantially similar **complete** descriptions (at least 82% four-word shingle overlap across boards, 96% within one source).
3. Different employer requisitions, explicit requisition numbers, levels, locations, eligibility outcomes, old reposts, and truncated excerpts remain separate. Organic HN/X posts remain independent because they may advertise several roles.
4. Every member must match all other members, preventing a chain of loose similarities from collapsing unrelated jobs.

Grouping is reversible and does not delete jobs, move tasks, combine private notes, or renumber CV versions. Saved records take precedence as representatives. **Show duplicates** displays every original record; **Other listings** links to its related source copies. Grouping runs after the user's filters so an excluded representative cannot hide a matching copy. Saved always shows its individual records.

This favors missed duplicates over merging separate vacancies. Similar titles alone are insufficient, and unsupported ATS identities or differing geographic formats may leave copies ungrouped.

## Description evidence and freshness

Migration 002 adds per-source observations and immutable versions of changed source payloads. Empty responses and excerpts cannot overwrite an existing complete description. A newer complete description may legitimately be shorter. Manual description edits retain precedence. Employer ATS descriptions are preferred over board copies when complete; the source is shown in the detail pane.

RSS/Atom normalization prefers complete content over summaries. API excerpt fallbacks remain marked as excerpts even when long. Incomplete descriptions wait for details before cover-letter generation. No arbitrary truncation is applied to stored descriptions; the cover-letter inference prompt still has its own context limit.

Availability uses all observations, with employer-board evidence taking priority:

- A complete employer-board snapshot can close a missing job; a partial/failed scan cannot.
- A feed copy cannot reopen a vacancy closed by the employer. Reappearance on the employer board can reopen it.
- Explicit expiry closes a listing, including when the expiry date passes between scans. Omitting a previous expiry does not itself reopen it.
- Disappearance from a bounded feed is not closure.
- Old feed content becomes **Stale**, with availability **Unconfirmed**, rather than being treated as freshly hiring merely because it was returned again.

Freshness policy: employer observations need checking after 14 days; other observations after 30 days. Published feed age is limited to 90 days, HN to 45 days, and X to 30 days. Missing publication dates use first-seen time. An actively checked employer posting remains current even if it was originally published long ago. These are application heuristics, not provider expiry guarantees.

The Jobs availability filter includes stale and closed records on demand; Saved keeps its history. Nothing is deleted by freshness handling.

### Existing data

The migration can only retain descriptions that still exist in the database. The optional recovery command re-normalizes existing cached responses, preserves last-seen and closure state, and makes no network requests:

```sh
npx tsx scripts/backup.ts
npx tsx scripts/recover-cached-descriptions.ts
```

The September 2026 local collection was backed up and recovered this way, as recorded in [verification history](../verification/history.md). Old descriptions overwritten before this feature and absent from the cache cannot be reconstructed.

## Evaluation

`tests/fixtures/listing-evaluation.json` contains 16 actual locally collected listing snapshots and a manually written rubric evaluated against the fictional profile in `tests/fixtures/profile.json`. The cases cover direct frontend/native roles, sales false positives, adjacent support/DevRel, staff scope, unsupported specializations, truncated descriptions, citizenship restrictions, and independent visas.

```sh
npm test
npx tsx scripts/evaluate-matching.ts --write
npx tsx scripts/verify-listing-upgrade.ts
npx tsx scripts/verify-matching-ui.ts
```

This is a targeted regression set used during development, not a blinded or independent benchmark. It demonstrates specific expected behavior, not measured accuracy across every listing. Continue adding cases when real decisions reveal mistakes. Database tests cover duplicate non-matches, source precedence, expiry/staleness, description versions, profile changes, saved-state preservation, and migration/restart integrity. Browser checks cover the new controls and evidence on desktop and mobile.
