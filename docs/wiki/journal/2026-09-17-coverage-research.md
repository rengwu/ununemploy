---
title: Coverage research — 17 September 2026
section: Journal
updated: 2026-10-07
---
# Coverage research — 17 September 2026

Historical planning and probe results preserved from `docs/COVERAGE_EXPANSION.md`. The 31-source counts and proposed collector work below predate the installed 57-configuration expansion. See [the implemented coverage and observed scan results](../reference/source-coverage.md). External sources were not rechecked during migration.

## Scope and current coverage

The user wants maximum useful coverage and explicitly includes low-frequency public-page scraping. A missing official API is not an exclusion. Evaluate technical access, site restrictions, relevance and maintenance separately. The earlier API/feed-first assessment remains useful historical context but is superseded on this point. No application or engagement automation is in scope.

The running installation has **31 source configurations**:

- **11 distinct automatically collected multi-employer boards**, represented by 14 configurations: Himalayas, Remote OK, Remotive, 4 Day Week, We Work Remotely, GolangProjects, LaraJobs, ClojureJobboard, Arbeitnow, Jobicy and VueJobs. WWR categories and Arbeitnow markets are not separate boards.
- 11 individual employer feeds, of which seven are enabled and four are paused.
- Three organic configurations: X, HN monthly hiring threads, and HN's YC job stories.
- Two manual-only boards: Wellfound and Welcome to the Jungle/Otta.
- Web3.career awaiting its token, still pending at the user's request.

This leaves substantial gaps in Malaysia/Singapore/SEA, wider startup hiring, and East Asian relocation. The paused employer sources and existing X budget were not changed by this evaluation.

## First implementation batch

Order is an engineering recommendation based on relevance and the observed access path, not a measured ranking of unique suitable vacancies. HTTP success is a point-in-time observation, not a guarantee of future access or permission.

| Priority | Board | Coverage gained | Verified reading route and remaining work |
| --- | --- | --- | --- |
| 1 | [Hiredly](https://my.hiredly.com/Full-Stack-Software-Engineer-jobs) | Malaysian engineering/product/AI roles missing from remote-centric feeds. | Search HTML returned 200 and embedded 30 job records; ordinary browser rendered the same inventory. Public detail returned 200. Parse embedded listing records plus the actual description section. **Sample JobPosting description is only 500 characters**, despite a much longer visible job description. Keep its AI-generated summary separate from employer text. |
| 2 | [LinkedIn public jobs](https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=Malaysia) | Broad Malaysia, Singapore, regional and global employer discovery. | Anonymous search and a Grab full-stack detail both returned 200 using the application's identifying user-agent, with job links and a 5,488-character structured description. Guest HTML is an unofficial integration; pagination, regional variants and inconsistent access need fixtures. LinkedIn explicitly restricts scraping in its [agreement](https://www.linkedin.com/legal/user-agreement) and wildcard robots rules. Mark this restriction separately from the successful technical probe. |
| 3 | [Wellfound](https://wellfound.com/jobs) | Startup, founding, applied-AI and product roles. Currently only a manual entry in our app. | Search and an agent-engineering detail returned 200 without login; detail included a 4,002-character JobPosting body. Public categories, embedded listing state and employer links provide a plausible adapter. Public inventory is not the complete signed-in service. Its [terms](https://wellfound.com/terms) restrict copying/harvesting; retain that label. |
| 4 | [Built In](https://builtin.com/jobs/remote) | Broader tech/product/AI companies, beyond the small employer list already configured. | Public listing and detail returned 200; sampled detail has 7,880 characters of JobPosting description. Use specific engineering/AI categories, original employer links and country restrictions. US-only remote jobs are common in the sample. Its [terms](https://builtin.com/community-terms-of-use) expressly restrict automated access/copying. |
| 5 | [YC jobs](https://www.ycombinator.com/jobs) / [Work at a Startup](https://www.workatastartup.com/jobs) | YC's broader company/job directory, including founding and AI roles. The existing HN `jobstories` feed is not this full directory. | `ycombinator.com/jobs` returned readable HTML with 200. Work at a Startup returned 406 to the basic client but loaded listings in an ordinary browser. Prefer the public directory and employer pages where possible; validate paging/detail coverage. A successful initial public page does not establish access to all signed-in results. |
| 6 | [Japan Dev](https://japan-dev.com/japan-jobs-relocation) | Japan relocation, explicit overseas sponsorship and language requirements. | Public relocation index and detail both returned 200. Index has vacancy links; sampled frontend/product detail includes an 8,020-character structured body. Source-specific country, visa and Japanese-language fields are particularly useful. |
| 7 | [Cake](https://www.cake.me/jobs?query=software%20engineer) | Taiwan and additional Asian employers; separately inspect international-candidate categories. | Public search HTML returned 200 with rendered vacancy links and embedded state. Build filtered discovery and verify individual full-description extraction, pagination, locale, language requirements and closures. Detail adapter not proven by this review. |
| 8 | [Arc](https://arc.dev/remote-jobs) | Remote engineering, full-time and contract work; country/timezone fields. | Search returned 200 with 30 Arc job records and separate external listings in page data; ordinary browser displayed jobs. Validate full descriptions and stable detail URLs, and distinguish Arc network roles from externally sourced vacancies. Talent onboarding/application actions stay manual. |

### Concrete missing inventory

The inspected [Food Market Hub role on Hiredly](https://my.hiredly.com/jobs/jobs-malaysia-food-market-hub-job-senior-full-stack-engineer-ai-agentic-systems) covers agentic systems and advertises RM15K–RM30K. It asks for 10+ years, so it is a stretch example rather than a confirmed match. A local collection search returned no Food Market Hub records. The [Telexistence frontend/product role](https://japan-dev.com/jobs/telexistence/telexistence-lead-frontend-product-engineer-tjwvfc) is another absent employer in the local query. These two examples establish real gaps; they are not a statistically representative overlap study.

## High-value targets with current access obstacles

| Board | Why keep it in the backlog | Observed obstacle |
| --- | --- | --- |
| [JobStreet / SEEK](https://my.jobstreet.com/software-engineer-jobs/in-Malaysia) | Important Malaysian/SEA inventory; later investigate SEEK Australia/NZ as separate markets. | Malaysian search returned 403/security challenge in both HTTP and ordinary headless browser checks. [Terms](https://my.jobstreet.com/terms) and job-detail robots restrictions also need to remain explicit. Other SEEK markets were not live-tested. |
| [NodeFlair](https://nodeflair.com/jobs/software-engineer-jobs) | Strong technical focus across Singapore, Malaysia and other Asian markets. | Both clients received a security challenge. Search-engine visibility is evidence of public inventory, not proof that our collector can read it. |
| [Glints](https://glints.com/sg/opportunities/jobs/explore) | Additional SEA markets and local employers. | HTTP returned a firewall page; ordinary browser also encountered a challenge. Search results include closed jobs, so closure handling is necessary. |
| [TokyoDev](https://www.tokyodev.com/) | English-speaking jobs, apply-from-abroad and relocation fields. | Searchable public listings exist, but both local clients were challenged. Japan Dev is the currently accessible first route into this segment. |
| [Indeed](https://malaysia.indeed.com/jobs?q=software+engineer) | Broad employer coverage, with substantial aggregation/duplicate potential. | HTTP and ordinary browser checks were blocked. No working connector established. |
| [Welcome to the Jungle / Otta](https://app.welcometothejungle.com/jobs) | Strong potential startup/product coverage. | The old candidate app redirected to login. The public main-domain search returned a shell, not confirmed vacancy inventory. Public company pages need separate evaluation. |

These are research priorities, not disabled adapters secretly presented as working coverage. No account sessions, challenge-solving or proxy services were used in the probes.

## Next wave and inexpensive additions

| Source | Findings and recommendation |
| --- | --- |
| [Get on Board](https://www.getonbrd.com/user-manual/get-on-board-s-api) | Official no-auth public API for published jobs, categories, companies and search, in addition to readable HTML. A live public search returned the requested two records with description fields. Good next adapter; LATAM residence/timezone restrictions reduce direct relevance for Malaysia, but keep global/relocation roles visible. The public and private recruiting APIs are distinct. |
| [Remote.com Jobs](https://remote.com/jobs) | Index and detail returned 200, with country/work-authorization metadata and JobPosting data. The sampled full description was not in the initial visible HTML; verify ordinary rendered detail before claiming complete-text support. |
| [No Fluff Jobs](https://nofluffjobs.com/) | Public index returned 200 with job links. Engineering/AI/salary coverage adds CEE markets. Verify descriptions, local language, employment country and sponsorship per listing. |
| [TryRemote](https://tryremote.com/) | `reactjobsboard.com` redirected here during the probe. Public page exposes React, frontend, AI and region-specific listings. Treat the old name as an alias, not a second independent board. Validate detail extraction and overlap. |
| [Remote Game Jobs](https://remotegamejobs.com/) | Public index returned 200 with vacancy links. Lower priority for general product engineering, useful for native/UI/tools and game-adjacent branches. |
| [Jobspresso](https://jobspresso.co/remote-work/) | Public shell returned 200, but usable vacancy cards were not established by the basic fetch. Needs rendered-list/detail work and stale-entry checks. |
| [Adzuna](https://developer.adzuna.com/overview) | Official keyword/location search API; needs app ID/key. Potential broad aggregator coverage. Confirm supported countries, description completeness and account terms; no authenticated test performed. |
| [Jooble](https://jooble.org/api/about) | Official search API with a key request. Useful breadth, likely substantial duplication. No key requested or authenticated test performed. |
| [Careerjet](https://www.careerjet.com/partners/api) | Official search API requires a publisher key. Documentation describes excerpts, so a feed response should not be labeled a full description. Confirm suitability for this local application and target locales. |
| [Wantedly](https://www.wantedly.com/projects) | Public Japanese recruitment-project listings visible through web research. Lower priority than boards with explicit international-candidate filters; not locally probed. |
| [Tech Jobs for Good](https://www.techjobsforgood.com/) | Public social-impact technical board visible through web research. Useful employer diversity; local extraction and hiring-country coverage not yet checked. |
| [Relocate.me](https://relocate.me/international-jobs/software-engineering) | Public relocation listings remain, while The Global Move advertises a separate private/premium curated product. Evaluate the public inventory; do not count the premium archive as accessible coverage. |
| [Tech in Asia](https://www.techinasia.com/jobs) | Relevant regional brand, but the web retrieval returned 403; current job-reading path unconfirmed. |
| AIJobs.net / ai-jobs.net | `aijobs.net` redirected to [Foorilla Hiring](https://foorilla.com/hiring/). Reassess the current product and inventory before creating an adapter under an old brand. |

Separately, expand the employer directory behind Ashby/Greenhouse/Lever and add [SmartRecruiters' public Posting API](https://developers.smartrecruiters.com/docs/authentication). It is documented as unauthenticated and exposes published jobs per company. This is a coverage multiplier across employers, not one global feed or a new independent board. Workday and other ATS families can be later, source-specific adapter research.

## Collector changes needed for useful coverage

1. **Public HTML and page-data adapters.** Extract stable IDs, canonical links, listing metadata and source-specific description sections. A public embedded JSON response is a technical source, not evidence that every field is complete. Verify it against what an anonymous user can read.
2. **Broad discovery with bounded detail work.** Start with two scheduled discovery passes per day, below the existing six-scan ceiling. Rotate role/region queries and persist pagination so the same first page does not consume every scan. Separate initial backfill from newest-first incremental collection.
3. **Budget requests separately from scans.** As an illustrative starting budget, two discovery pages twice daily plus 20 new detail pages is 24 GETs per board/day, not two requests. Choose budgets per source after testing; no such configuration changed in this review. Shared host limits must cover related categories/markets and manual lookups.
4. **Fetch once, reuse and revalidate.** Deduplicate known IDs/application URLs before fetching details. Cache text, preserve manual edits and provenance, and revalidate likely matches/saved jobs on a slower schedule. A fixed six-detail-requests/day limit for every future board would unnecessarily restrict broad discovery; VueJobs retains its current limit until explicitly changed in implementation.
5. **Count failed and browser work.** Pause on 429 and surface blocked/challenged collectors. A browser scan can issue many assets/analytics requests; several probes attempted over 100 resources, including images/fonts blocked by the test. Prefer one-page HTML reads when they contain the same inventory. Do not call a successful HTML shell a successful job scan.
6. **Report source contribution.** Distinct active boards, employers covered, discovered pages, new unique jobs, full-description rate, eligible/uncertain/conflicting roles, duplicate rate, stale entries, request totals and last successful data retrieval. Current source-row count alone overstates coverage.
7. **Retain the broad job scope.** Frontend, full-stack, product, design engineering, native/mobile, applied AI, agent tooling, developer experience, founding engineer and adjacent technical leadership; SEA/East Asia plus worldwide remote and relocation. Country eligibility remains separate from geography and role fit.

## Evidence and limits

Read-only probes used local curl and a fresh ordinary Playwright browser. No credentials, paid API calls, source enablement, job imports, application actions or messages to employers were involved. Existing scheduled collectors continued under their existing settings.

Private research files are under `.local-data/verification/coverage-research/`: `probe.json` and page/robots snapshots (20 boards), `browser.json` (eight browser checks), `details.json`, and the publisher's Get on Board OpenAPI document. The source-state snapshot is `coverage-bootstrap.json` in the parent directory. Raw counts of links/resources are diagnostics, not vacancy totals. Full pagination, ongoing reliability and incremental unique-match yield remain to be established during adapter implementation.
