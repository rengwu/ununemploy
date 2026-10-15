---
title: Integration audit — 8 October 2026
section: Journal
updated: 2026-10-08
---
# Integration audit — 8 October 2026

The user authorized five additions—Working Nomads, WordPress Jobs, RemoteJobs.com, Dynamite Jobs and The Muse—and explicitly deferred Reddit. They requested a full analysis of the existing integrations **before adding them**, with scanning and parsing reliability taking priority. This audit changes documentation only; the five sources and the simplifications below are not implemented here. The earlier [source evaluation](2026-10-08-source-evaluation.md) retains its dated provider findings.

**Subsequent decision, 8 October:** the [design interview](2026-10-08-integration-design.md) accepted a small functional-core refactor with existing tables, but chose detail-page metadata precedence instead of this audit's proposed newest-card precedence. Preserve the findings below as the original audit; use [Discovery and sources](../features/discovery.md#accepted-corrective-design-8-october-2026) for the current accepted behavior.

## Assessment

The integration layer is reasonably small and already shares its main machinery. A replacement architecture would create substantial regression risk. The useful simplification is to give each piece of state one clear purpose and reuse the same merge rules. Four reproducible correctness problems sit at the boundaries between listing discovery, detail retrieval and persistence. Fix those before expanding coverage.

The [verification report](../verification/runs/2026-10-07T190844Z-integration-audit.md) records 70 passing existing tests, passing TypeScript checks, ten bounded live scans, cached-page replay and four failing additional expectations. Passing the existing suite does not establish that every provider works.

## What exists

The inspected installation contains 57 source configurations, 27,377 jobs and 27,503 source observations. Configuration count includes unavailable sources and unfinished adapters. The source type union has 16 members; this installation uses 14, with no configured Lever or manual website source.

| Integration family | Configurations | Implementation and necessary differences |
| --- | --- | --- |
| Employer APIs | 7 Ashby, 4 Greenhouse; Lever supported | Direct structured normalization. Lever has resumable pagination and a snapshot start time. Only complete employer snapshots can close missing vacancies. |
| Monthly HN hiring | 1 | Discover two hiring threads, retain comment progress and rotate rechecks. These are leads, sometimes covering multiple roles. |
| HN job stories | 1 | Separate bounded official feed, retaining original HN attribution and progress. |
| RSS/Atom | 7 | One XML reader with publisher-specific employer/location mapping. VueJobs adds on-demand detail retrieval. |
| Public JSON discovery | 7 | Himalayas, Remote OK, Remotive, 4 Day Week, two Arbeitnow regions and Jobicy. Field mappings and pagination differ. |
| Public boards | 28 | Shared catalog, URL validation, listing/detail parser and persistent detail queue. Includes Get on Board's JSON API and Jobspresso's RSS feed; Adzuna, Jooble and Careerjet are setup entries only. |
| X | 1 | Official API, fixed search windows, paid-read reservations and shared monthly budget. |
| Web3.career | 1 | Separate token, credential-safe transport and bounded feed; authentication still requires live verification. |

The main path is `worker / Scan → scan → collect → readUrl + provider parser → ingestJob → source observations + selected job content → baseline matching`. Public boards add a persistent detail queue between discovery and ingestion. VueJobs detail loading joins the same ingestion path when a user saves or requests details.

Approximate file sizes help put the concern in perspective: the public-board parser is 551 lines for 28 registered boards; its collector is 140 lines and queue is 95. The generic connectors and discovery modules total 692 lines; shared HTTP is 189 and scan orchestration is 207. The most consequential coupling is with the large database module and duplicated state, rather than excessive classes, services or plugin layers.

## Confirmed issues

### 1. Replacing description text can discard hiring restrictions

`core/boards/parsers.ts:162` appends structured `applicantLocationRequirements` to the description while retaining office location separately. The visible-section override at `:542` replaces that combined text. A synthetic TryRemote page with a Malaysian office, United States applicant restriction and longer visible description becomes a full description with **no United States restriction**. This can affect geography assessment.

**Proposed fix:** select the authoritative body first, then append structured restrictions once. Keep office location and permitted applicant locations distinct. Exercise every visible-section branch—TryRemote, No Fluff Jobs, Wantedly, Relocate.me and Cake—and preserve restrictions already present in the visible text without needless duplication. This is a small parser correction, with no queue or database migration.

### 2. A full queue document freezes newer listing metadata

`core/boards/queue.ts:9` preserves the entire old document whenever the queue already has a full description and the next listing is an excerpt. The reproduction changes the title and salary while retaining the same URL: the old title and salary survive. Protecting the description should not discard independently observed metadata. The database already has a more selective `preserveDescription` operation in `core/job-quality.ts:32`.

**Proposed fix:** have one field-aware merge rule for both ingestion and the queue. Accept new substantive metadata, preserve known values against placeholders such as “Not listed,” and retain the full body and its original retrieval provenance. Avoid moving this into a new abstraction layer. Initially keep the queue schema to reduce migration risk; removing its duplicate full document can be a separate, measured change later.

### 3. Closed queue entries cannot be checked again after rediscovery

The same queue upsert keeps a `closed` state when a URL reappears as an excerpt. `dueBoardJobs` excludes closed entries forever. The reproduction marks a URL closed after a 404, rediscovers it, and finds it still ineligible for a detail request.

**Proposed fix:** rediscovery should make the URL eligible for bounded revalidation after applicable cooldowns. It must not immediately declare the vacancy open or erase explicit expiry evidence. A successful matching detail response or explicit later publication evidence can then drive availability. Test repeated 404s, reappearance, future expiry, and saved-job preservation.

### 4. Retrieval timestamps create artificial content changes

The public-board collector adds `descriptionSource.checkedAt`, while `core/db/index.ts:712` hashes the entire incoming object. Identical content with a different retrieval timestamp is reported as updated and creates a new version. Two synthetic observations produce two versions. In the read-only inventory, **7,644 of 43,733 versions (17.5%) become duplicate content when only that nested timestamp is excluded**. This is measured historical redundancy, not an estimate of all possible redundant writes.

**Proposed fix:** hash stable normalized listing content; store observation times separately. An unchanged observation must still advance freshness and clear appropriate missing markers without claiming a content edit. Only skip reassessment when content, profile/matching revision and availability inputs are unchanged. Keep existing history intact. Also use a raw stored-job read in ingestion instead of loading cover-letter/CV relations through `getJob` merely to update a listing; measure this separately before optimizing further.

## Other simplifications and operational limits

| Area | Observation | Recommendation and guardrail |
| --- | --- | --- |
| Policy definitions | Source types, fixed IDs, intervals, special manual cooldowns, request caps and snapshot authority are spread across catalog, schema, scanner, database and quality code. | Consolidate a small typed metadata table where it removes duplicated decisions. Keep straightforward provider functions and explicit provider-specific pagination. No dynamic plugin loader or universal pagination framework is needed. |
| Two detail implementations | VueJobs duplicates JSON-LD traversal, identity checks and retry handling used by public boards, but has stricter public-visible-text checks, a six/day cap and concurrent-edit protection. | Share pure structured-data extraction and metadata merging first. Keep its access rules and on-demand behavior. Unifying scheduling is optional, not a prerequisite for the five additions. |
| Derived queue state | Queue counts are queried and copied into source checkpoints repeatedly. The queue and the checkpoint can disagree outside that path. | Derive counts when displaying status. Persist discovery cursors, retries and actual work, rather than a second authoritative summary. |
| Backlog and revalidation | There are 2,066 pending details, 3 excerpts, 2,868 full records and 56 closed queue entries. Pending/excerpt work always sorts before full-page revalidation, so a busy source can delay old-detail checks indefinitely. | Expose backlog and reserve a small predictable share for revalidation. Seven days is eligibility, not a guarantee of an actual refresh. Retain per-source request limits. |
| Discovery/detail coupling | An unreadable discovery shell throws before any already-queued details run; the reproduction made zero detail requests. | Consider processing known URLs after a parsing-only discovery failure. A host authentication/rate-limit block must still stop requests. Preserve a partial discovery error in the run rather than hiding it. |
| Completion semantics | A one-request 4 Day Week scan returns `complete` with older pages pending; a two-request TryRemote scan returns `complete` with 19 excerpts pending. Lever instead reports `partial` at its request limit. | State whether a bounded pass finished and whether more work remains. Make complete-snapshot evidence explicit; never infer employer vacancy closure from a bounded public feed. This is a clarity improvement, not evidence that the current bounded passes lose checkpoints. |
| Normalization boundary | Providers use differing validity checks and full-description heuristics. `IncomingJob` is a TypeScript type, not a common runtime response contract. | Introduce a small shared validation result for identity, usable URL, dates and description quality. Preserve per-provider knowledge. Invalid/skipped rows must prevent a supposedly complete employer snapshot from closing jobs. Do not equate text length alone with a complete vacancy. |
| Cache growth | 3,306 cached responses occupy about 633 MB of body data. Replaying these is valuable for parser changes. | Consider a bounded HTTP-cache policy after capturing representative fixtures. Keep source observations, saved jobs and listing history. No cache/history cleanup was performed in this audit. |

## Parsing coverage and current health

The ten selected live configurations used the real `scan()` path with a synthetic ready profile and temporary SQLite database: Ashby, Greenhouse, Lever, WWR RSS, Remote OK, Himalayas, 4 Day Week, HN job stories, TryRemote and Get on Board. Twelve public GET requests stored 716 listings, including 695 classified full descriptions. Lever correctly stopped as partial at one page and preserved progress. These checks establish bounded fetch/parse/persist behavior, not exhaustive coverage or semantic accuracy of every field. The one empty Remote OK description remained non-full after ingestion.

Offline replay used existing public responses dated 17 September–7 October, covering 22 public-board identities. Across 114 discovery responses, 110 parsed and four were rejected; successful results yielded 3,168 listing occurrences, not unique vacancies. Across 2,212 detail responses, 2,025 parsed full descriptions, three remained excerpts and 184 were rejected.

The rejections warrant targeted fixtures, not weaker global identity checks:

- **Glints:** 89 responses contain a generic `/opportunities/jobs/id` canonical and no schema URL; another 30 have no parseable JobPosting. The current parser rejects all 119 inspected cached detail responses. A board-specific binding to the correct vacancy needs investigation; accepting the only JobPosting blindly would risk associating the wrong job.
- **LinkedIn:** 60 responses lack parseable JobPosting data. This establishes unavailable cached detail content, not that a selector change will recover it.
- **No Fluff Jobs:** two responses have a different canonical without a schema URL; rejecting them protects identity.
- **TryRemote and Remote Game Jobs:** two and one responses respectively lack parseable JobPosting data.
- Four cached discovery responses fail on Remote Game Jobs, Foorilla, NodeFlair and Welcome to the Jungle. Six boards have no replayable cached pages, including the three API setup entries. Cached successes do not establish present-day network access.

The existing suite protects useful invariants: saved notes/history survive rescans, complete descriptions survive excerpts, manual edits win, partial feeds do not close missing jobs, checkpoints resume, provider cooldowns and budgets apply, sensitive URLs stay out of cache, and Jev remains disabled. It lacks the four reproduced cases and a durable captured-fixture matrix for all provider-specific branches. Lever's interrupted multi-page snapshot and monthly HN fairness/recheck behavior also deserve explicit end-to-end regression scenarios before changes to scheduling.

## Recommended sequence

1. Turn the four isolated reproductions into regression tests. Add small sanitized fixtures for provider-specific parsing branches and identity rejection. Use the current cache as baseline material, keeping private job/application records out of fixtures.
2. Correct restriction preservation, field merging, rediscovery eligibility and content hashing in separate changes. Re-run focused tests and compare normalized output against the same cached inputs. Preserve source IDs, cursors, counters, manual edits and histories.
3. Consolidate small policy/helper duplication as it becomes useful. Defer queue schema changes, retention policies and a full connector-interface rewrite. Measure ingestion costs before additional performance work.
4. Add the five authorized sources using the existing paths: Working Nomads through a JSON normalizer; WordPress Jobs and RemoteJobs.com through RSS mapping; Dynamite Jobs through the public-board engine; The Muse through a JSON normalizer after resolving its documented registration and filtering limitations. A reusable helper should arise from a second concrete use, rather than a new framework built ahead of these adapters.

Acceptance for each addition: stable source IDs and vacancy URLs; attributable employer/location data; honest full/excerpt classification; bounded requests; resumable pagination where applicable; cooldown/error behavior; no false closure from incomplete inventories; and unchanged saved-job/manual-edit behavior. Registration and filtering limits for The Muse remain real work even though its addition is authorized. Reddit remains deferred.

Retain the shared HTTP safety checks, rate/budget accounting, leases, conditional caching, per-source observations, manual-override precedence, snapshot closure rules and explicit provider-specific access checks. These mechanisms protect reliability and user data and are justified by current requirements.
