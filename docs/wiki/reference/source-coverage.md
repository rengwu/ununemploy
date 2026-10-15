---
title: Source coverage
section: Reference
updated: 2026-10-16
---
# Source coverage

The [8 October source evaluation](../journal/2026-10-08-source-evaluation.md) covers the additional user-supplied boards, TechReferrals, Reddit and HNHIRING. It recommends Working Nomads first, identifies working WordPress/RemoteJobs.com feeds and a Dynamite Jobs HTML route, and records aliases, unavailable domains and access limits. **Evaluation only:** it added no integrations or source configurations. HNHIRING's underlying HN threads and Remote Hunt's current WWR destination are already covered.

The subsequent [integration audit](../journal/2026-10-08-integration-audit.md) identified shared correctness and maintenance issues. The [corrective implementation](../verification/runs/2026-10-08T075217Z-integration-implementation.md) now adds four sources and verifies the shared fixes. The Muse is completely out of scope; Reddit remains deferred.

## Current catalog — 16 October 2026

Fresh catalogs contain **58 configurations**, including 26 public boards. Adzuna, Jooble and Careerjet have no adapters and are excluded from setup and scanning. Existing records are retained but hidden from Sources. See [discovery](../features/discovery.md) and the [first cleanup verification](../verification/runs/2026-10-15T165802Z-lean-first-pass.md).

## Additions — 8 October 2026

At that revision the catalog contained **61 configurations**, including 29 public boards. A bounded live check of the four additions used six GET requests in a disposable database:

| Source | Stored observations | Full descriptions | Requests | Coverage |
| --- | --- | --- | --- | --- |
| Working Nomads | 42 | 42 | 1 | Public exposed-jobs feed |
| WordPress Jobs | 3 | 3 | 1 | Publisher RSS |
| RemoteJobs.com | 1,000 | 997 | 1 | RSS snapshot; 3 empty bodies remain leads |
| Dynamite Jobs | 20 | 2 | 3 | Development category and two details; 18 details queued |

All four scans completed within their selected budgets. This is a point-in-time access result, not exhaustive vacancy coverage or field-by-field review of every listing. Ten existing representative configurations were also scanned. The same-corpus parser comparison covered 116 listing and 2,281 detail responses: 404 descriptions gained retained applicant restrictions, with no other differences from the baseline. Existing rejected pages remained rejected; this pass does not repair unrelated provider access or identity issues.

## Historical expansion — 17 September 2026

Recorded scan results from **17 September 2026**, migrated on 7 October. Provider accessibility has not been rechecked for this migration. Configuration count is not a count of working boards. Current operation is described in [Discovery and sources](../features/discovery.md).


Evaluated and implemented 17 September 2026. The live status below supersedes the earlier probe observations that follow.

### Installed scan list (historical)

All **28 evaluated boards** are registered: 26 added, Wellfound and Welcome to the Jungle upgraded in place. The local installation has **57 source configurations**. The first bounded pass imported **646 listings** across 18 boards and retrieved **321 full descriptions**. These are source listing counts, not a claim of unique suitable vacancies or exhaustive coverage.

| Recorded result | Boards |
| --- | --- |
| Listings and full descriptions verified | Hiredly, LinkedIn public jobs, Wellfound, Built In, Y Combinator jobs, Japan Dev, Cake, Get on Board, Remote.com Jobs, No Fluff Jobs, TryRemote, Remote Game Jobs, Jobspresso, Wantedly, Relocate.me, Glints, TokyoDev |
| Listings collected; details blocked with HTTP 403 | Arc — 60 leads retained |
| Blocked with HTTP 403 | JobStreet/SEEK, Indeed, Tech in Asia, Tech Jobs for Good |
| Timed out | NodeFlair |
| Public page returned no usable listings | Welcome to the Jungle/Otta, Foorilla Hiring |
| Registered; no automatic requests | Adzuna, Jooble, Careerjet — publisher credentials and API adapter configuration pending |

Glints and TokyoDev worked during the actual scan despite earlier blocked probes. Source status reflects the latest result, not a permanent accessibility claim. Existing collector settings/pauses, X budget and pending Web3 configuration were preserved.

### Implementation and limits

- `core/boards/catalog.ts` contains board identities, public discovery routes and strict vacancy URL patterns. `public_board` sources are editable in Sources, with Open site and manual Add job available even when automation fails. Duplicate configurations for the same board are rejected.
- At most **two scans/day and 12 HTTP requests/scan** for each public board. Requests and redirects count against the budget. Manual scans honor the same minimum interval and provider cooldown. 403/429 responses wait at least 24 hours; unreadable shells show Unavailable and also wait 24 hours.
- SQLite migration 005 stores pending descriptions, completion, failures, expiry and retry times. Discovery refreshes one current page and, where the board exposes usable pagination, continues one saved older page. Remaining requests retrieve queued descriptions. Full pages are reused and eligible for seven-day revalidation while their listings are still being observed. Partial discovery never closes unseen vacancies.
- Hiredly uses employer description/requirements rather than its AI summary or truncated schema. TryRemote, No Fluff Jobs and Wantedly preserve visible description sections. Relocate.me and Remote Game Jobs require narrowly repairing literal control characters inside publisher JSON-LD; malformed data is never executed. Remote.com's rendered description was independently checked in an ordinary browser, including its work-authorization field. Paid Global Move directory promotions are excluded from Relocate.me job records.
- Pagination is verified for Hiredly, Built In, Cake and Get on Board. Other boards currently refresh public landing/category results; this is **bounded coverage**, not a complete crawl. LinkedIn search returned 60 results; its ordinary `start` query redirected back to the first page, so it is not represented as working deep pagination. Its regional queries rotate.
- Cake's old query parameter was ignored by the site. Its readable general inventory is collected and paginated; the actual keyword route found through the browser returned 403 to the HTTP client. Filtered Cake coverage remains limited.
- Feed-provided descriptions, office locations and explicit hiring-country requirements remain separate. Job matching and existing cross-board grouping run on imported records. Manual description overrides take precedence. Some listings remain excerpts until their queued detail request runs; blocked excerpts still support user-pasted full text.
- API-dependent entries deliberately disclose both missing credentials and unfinished API adapters. SmartRecruiters/employer-directory expansion remains a separate development item; no global SmartRecruiters feed was invented.

Install with `npx tsx scripts/add-public-boards.ts`, or use `scripts/add-discovery-sources.ts` for the whole catalog. `scripts/reparse-public-board-cache.ts [board-key]` reapplies improved parsers to already-fetched local HTML with zero external requests. Source run history retains the original network failures and records cache reprocessing as zero-request runs.



The [earlier coverage research](../journal/2026-09-17-coverage-research.md) preserves probes, priorities, evidence and proposed work that preceded implementation.
