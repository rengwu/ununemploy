# Job source evaluation

Reviewed: 16 September 2026. Scope: all visible sources in the user's screenshots, including the final nine-domain list.

## Coverage expansion — 17 September 2026

The user has expanded the research scope to low-frequency public-page scraping, including sources without official APIs. See the [new coverage audit and prioritized adapter backlog](COVERAGE_EXPANSION.md), with local HTTP/browser/detail probes. Hiredly, LinkedIn public jobs, Wellfound, Built In, YC's broader directory, Japan Dev, Cake and Arc are the recommended first batch. Site restrictions and technical access are recorded separately. The earlier API-first/manual-only decisions below are historical. All 28 evaluated boards are now in the scan list; see the linked document’s current status table for verified imports, blocked sources and pending API configuration.

## Implementation update

After this evaluation, the user authorized adding as many supported sources as possible. **21 new configurations are installed and live-verified**, bringing the workspace to 27 configured sources at that stage. The follow-up below adds four more, for 31 total. They cover the five recommended boards; WWR programming/design/product feeds; GolangProjects, LaraJobs, ClojureJobboard; HN's separate YC jobs feed; two Arbeitnow markets; Jobicy; and seven employer feeds. See [verification](VERIFICATION.md) and the [catalog](../core/source-catalog.ts).

### VueJobs detail follow-up — 17 September 2026

The LINE MAN Wongnai listing's RSS description ends with an ellipsis, while its [public job page](https://vuejobs.com/jobs/line-man-wongnai-senior-software-engineer-fullstack-vue-js-python) contains the full body and matching JobPosting structured data. The feed parser retained all supplied text; the missing step was fetching public details. Added on-demand retrieval on Save or Load full description, with a one-request lookup budget, six requests per UTC day, persistent cooldowns, identity/visible-text checks and description provenance. Full text survives feed refreshes and cannot overwrite manual edits. The first fetch recovered 2,231 plain-text characters for this listing. Gated or unavailable pages stay excerpts; this does not change the earlier restriction against bypassing PRO access.

### Follow-up additions — 16 September 2026

- **VueJobs:** added the [RSS feed](https://app.vuejobs.com/feed/posts) advertised by an RSS alternate link in [VueJobs’ homepage](https://vuejobs.com/). One live request imported 923 excerpts, all with employer and location fields. Runs twice daily. The app subdomain’s generic robots file disallows crawling; this integration consumes only the explicitly advertised syndication feed, with no crawling of app/detail pages. [Terms reviewed](https://vuejobs.com/terms-of-use). Public job pages advertise a seven-day PRO window for new listings; the integration does not bypass it. RSS entries remain leads and CV generation waits for the complete description.
- **Web3.career:** implemented official JSON collection and local token configuration. The [API reference](https://docs.bondex.app/api-reference/web3-career-jobs-api/api-reference) and [response models](https://docs.bondex.app/api-reference/openapi-documentation/models) document the mixed metadata/jobs array, unmodified `apply_url`, and optional description/location fields. One request reads up to 100 listings, twice daily. No live authenticated scan yet; missing credentials cause zero requests.
- **Wellfound:** added manual job entry and a direct board link. Its [terms](https://wellfound.com/terms) restrict harvesting/copying except where permitted; public search pages and employer ATS integrations did not establish a candidate job-reading API. No automatic collector enabled.
- **Welcome to the Jungle / Otta:** added manual job entry and the [candidate app](https://app.welcometothejungle.com/) link. The [candidate terms](https://us.welcometothejungle.com/terms-and-conditions/candidates) and [acceptable use policy](https://us.welcometothejungle.com/terms-and-conditions/acceptable-use-policy) were reviewed; no supported public automated reading route was established. No automatic collector enabled.

Additional sources established during implementation:

- [Arbeitnow](https://www.arbeitnow.com/blog/job-board-api): public Germany and UK APIs, using the documented visa-sponsorship filter, twice daily. This is a discovery signal; confirm each employer's conditions. Both endpoints returned valid job arrays.
- [Jobicy](https://github.com/Jobicy/remote-jobs-api): public API, 200 recent records per request, four scans daily. Preserve attribution and original listing URLs. Official guidance permits internal job-discovery products and requires polling no more often than hourly.
- Direct career feeds confirmed from [LangChain](https://www.langchain.com/careers), [Cognition](https://cognition.com/careers), [Replit](https://replit.com/careers), [Figma](https://www.figma.com/careers/), [Notion](https://www.notion.com/careers), [Supabase](https://supabase.com/careers), and [Sourcegraph](https://sourcegraph.com/jobs). These use existing Ashby/Greenhouse adapters and run every six hours.

The tables below preserve the original evaluation decisions. Supported entries marked “Integrate” have now been added, with Web3.career implemented but awaiting its token. Some API marketing/documentation differs from returned data: 4 Day Week includes schedules such as generous PTO with 40-hour weeks; Remotive returned 15 records despite a requested one-record limit; LaraJobs descriptions were empty in the inspected RSS. The adapters retain those limitations instead of inventing missing fields.

## Recommendation

Keep X, Hacker News, and direct employer career feeds central. Add **Himalayas, We Work Remotely, Remote OK, Remotive, and 4 Day Week** next. These have documented public reading interfaces and relevant engineering coverage. Add **GolangProjects and LaraJobs** as smaller adjacent-role feeds. Web3.career is another practical option after obtaining its separate API token.

Wellfound, Arc, Welcome to the Jungle, Built In, and Remote.com deserve attention for their roles or employers, even though this review did not establish a ready-to-use public job-reading integration for them. Manual link capture and discovery of employers' own career feeds are useful routes.

This is an integration and relevance assessment, not a guarantee that every listing is current, genuine, or open to Malaysian applicants. Priority is our judgment based on the user's frontend, product, native/web, AI tooling, and leadership background. A reachable homepage alone does not establish job freshness or automation permission.

## Duplicates and old names

There are **83 visible mentions and 67 distinct source labels** after obvious repeats and established aliases are consolidated. This is not a claim of 67 independent providers: some old shortened links remain unresolved, and JOBBOX has a historical relationship with Landing.jobs. The first image says “25” but only entries 1–22 are visible.

- **AngelList Talent / angel.co/jobs / “Angle List” → Wellfound.** Confirmed by [Wellfound's history](https://wellfound.com/about-us).
- **Remote OK / remoteok.io → remoteok.com.** The old domain redirects to the current site.
- **Remotive / remotive.io → remotive.com.** Confirmed in its [API repository](https://github.com/remotive-com/remote-jobs-api).
- **Otta / Welcome to the Jungle** are one entry in this inventory; the current candidate service is under Welcome to the Jungle.
- Repeated Built In, DailyRemote, FlexJobs, JustRemote, NoDesk, Remote.co, SkipTheDrive, and We Work Remotely entries are each evaluated once.
- **Remote.co and Remote.com are separate services.** Remote.com does have a [job board](https://remote.com/jobs), alongside its employment products.
- **HN “Who is hiring?” threads, HN's `/jobs` page, hnhiring.me, and whoishiring.io are not interchangeable.** HN's `/jobs` is the YC company job feed. Its monthly hiring threads are a separate source. Do not assume the two third-party sites add independent inventory.
- **JOBBOX.io and Landing.jobs use the same shortened link in the screenshot.** Landing's [own archive](https://wp.landing.jobs/blog/tag/landing-jobs/) contains its JOBBOX history. Keep the old label for traceability; do not build a connector against today's parked JOBBOX domain.

The `lnkd.in` destinations could not be resolved reliably by the research tool. Recognizable brands were checked at their official sites. Generic names such as “React.js Jobs,” “Full-stack developer Jobs,” and “remote-jobs” remain unresolved rather than being silently assigned to a similarly named website.

## Public interfaces to prioritize

These are proposed schedules, not current application configuration. A scheduled scan can require several HTTP requests, so the implementation also needs a request/page budget per source. The user's five-to-six scans per day is a ceiling, not a requirement to poll every source that often.

| Source | Interface and usefulness | Proposed cadence | Important constraints |
| --- | --- | --- | --- |
| [Himalayas](https://himalayas.app/docs/remote-jobs-api) | Free, no-auth JSON; country/timezone restrictions, seniority, salary period, full descriptions, expiry, stable IDs, cursor pagination. Especially useful for Malaysia eligibility. | Once daily | Documentation says data refreshes every 24 hours. Preserve source attribution and links; do not redistribute to other job boards. |
| [We Work Remotely](https://weworkremotely.com/remote-job-rss-feed) | Official public RSS, including programming, frontend, full-stack, product, and design feeds. | 4/day initially | Feed use is expressly offered with links attributed back to WWR. Select a small feed set and deduplicate overlapping categories. |
| [Remote OK](https://remoteok.com/api) | Public JSON linked from the site; title, tags, location, salary, descriptions and IDs. | 2–4/day | First array entry is legal metadata, not a job. Preserve attribution and required source link. Do not assume every “remote” listing is worldwide. Logo use has separate restrictions. |
| [Remotive](https://github.com/remotive-com/remote-jobs-api) | Official free JSON API; location text and full descriptions. | 2/day initially; at most 4/day | Public API listings are delayed 24 hours. Credit and link Remotive; no onward redistribution to third-party boards. Actual response did not honor the requested one-item limit; enforce our own bounds. |
| [4 Day Week](https://4dayweek.io/developers) | Free, no-auth v2 API with role, location, work arrangement, and work-schedule fields. Adds reduced-hours employers without making reduced hours a candidate requirement. | 2/day initially | Link back. Salary values, where provided, use cents. Documented rate limit is 60 requests/minute/IP, far above our intended use. Distinguish reduced hours from compressed schedules. |
| [GolangProjects](https://www.golangprojects.com/) | Publisher-linked [RSS](https://www.golangprojects.com/rss.xml); adjacent backend, infrastructure, and developer-tool roles. | Once daily | Rank Go requirements against actual experience. Do not imply professional Go depth from general engineering experience. |
| [LaraJobs](https://larajobs.com/) | Publisher-linked [RSS](https://larajobs.com/feed); Laravel plus React/Vue full-stack opportunities. | Once daily | Adjacent to older Laravel experience; check current backend requirements and hiring countries. |
| [ClojureJobboard](https://clojurejobboard.com/) | Publisher-linked [RSS](https://clojurejobboard.com/rss.xml). | Once daily, optional | Lower priority because Clojure specialization is a larger career branch. |
| [Web3.career](https://web3.career/web3-jobs-api) | Documented free JSON/RSS API; React, TypeScript, product, mobile, and infrastructure roles beyond smart contracts. | 1–2/day after token setup | Separate token required. [Official API docs](https://docs.bondex.app/api-reference/web3-career-jobs-api/api-overview) require source links and private token storage; no cursor/offset pagination. Endpoint verified in documentation, not authenticated in this review. |
| [Hacker News](https://github.com/HackerNews/API) | Continue existing monthly-thread collection. Consider adding the official `jobstories` feed for the distinct YC job posts. | Existing bounded schedule | One thread can contain many comments. Preserve comment IDs, dates, and source links; follow employer links selectively when a description is incomplete. |

### Live response checks

Read-only checks against the advertised endpoints succeeded:

| Source | Observed result |
| --- | --- |
| Himalayas | HTTP 200, valid JSON, one requested job; restriction, expiry, and description fields present. |
| 4 Day Week | HTTP 200, valid JSON, one requested job, pagination metadata present. |
| Remotive | HTTP 200, valid JSON, 15 jobs despite `limit=1`; response includes source-use conditions. This does not establish exhaustive board coverage. |
| We Work Remotely | HTTP 200, parsed programming RSS with 25 items. |
| GolangProjects | HTTP 200, parsed RSS with 10 items. |
| LaraJobs | HTTP 200, parsed RSS with 10 items. |
| ClojureJobboard | HTTP 200, parsed RSS with 3 items. |
| Remote OK | Public JSON response inspected through the research tool; legal metadata and job records present. |

Counts are response observations, not estimates of total active jobs or suitable matches. These checks did not import jobs into the application.

## Complete inventory

**Integrate:** a public reading interface was established. **Research:** useful potential source, but a current reading route or source conditions still need verification before automation. **Manual:** lower-priority board, subscription, or talent-network workflow. **Hold:** unavailable, changed, or insufficiently identified. “No verified feed” means this review did not establish one; it does not assert that none exists.

### Original remote-board list

| # | Source | Fit and current evidence | Decision |
| --- | --- | --- | --- |
| 1 | [Wellfound](https://wellfound.com/) | Strong startup/product/AI employer discovery. Candidate hiring-country filters still matter. [Terms](https://wellfound.com/terms) restrict copying/harvesting and automated load; this is not blanket permission to crawl. | **Research, high value.** Manual discovery and employer career feeds first; no verified public job-reading API. |
| 2 | [Arc](https://arc.dev/remote-jobs) | Engineering jobs and a vetted talent network, with global/Malaysia browsing options. Permanent and freelance roles. | **Research.** Separate public-board discovery from manual network onboarding; no verified public reading feed. |
| 3 | [Built In Remote](https://builtin.com/jobs/remote) | Relevant frontend, full-stack, product, and AI employers. Check country/state and authorization requirements per listing. | **Research.** Employer discovery is useful; public API/RSS and crawler permission not established. |
| 4 | [DailyRemote](https://dailyremote.com/) | Broad remote inventory and location filters. [Terms](https://dailyremote.com/terms) require written permission for automated scraping/crawling/access. | **Manual or permission-based.** Do not schedule an HTML scraper. |
| 5 | [FlexJobs](https://www.flexjobs.com/) | Broad curated flexible-work service; full access is subscription based. [Terms](https://www.flexjobs.com/termsofuse.aspx) restrict unauthorized copying/scraping. | **Manual, lower priority.** No purchase or automated access recommended for the first expansion. |
| 6 | [Hacker News](https://news.ycombinator.com/submitted?id=whoishiring) | Strong organic founder/engineering discovery. Monthly hiring comments differ from the screenshot's [YC jobs page](https://news.ycombinator.com/jobs). | **Integrate/retain.** Already a core source; consider the separate official YC job feed. |
| 7 | [Himalayas](https://himalayas.app/api) | Strong remote engineering coverage and unusually useful structured eligibility fields. | **Integrate first.** Daily public API, as detailed above. |
| 8 | [Hubstaff Talent](https://hubstafftalent.net/) | Original `talent.hubstaff.com` redirects here. Global freelance/direct-hire directory, rather than a focused senior product-engineering board. | **Manual.** Useful contract fallback; no verified public reading feed. |
| 9 | [JustRemote](https://justremote.co/) | Remote jobs plus paid PowerSearch. Relevant categories, but location restrictions require inspection. | **Research, secondary.** Start with public/manual discovery; no verified API/RSS. |
| 10 | [NoDesk](https://nodesk.co/) | Remote technology, product, and design roles. [Terms](https://nodesk.co/legal/terms) describe personal/private use; no confirmed automation grant. | **Research, secondary.** No verified public job feed. |
| 11 | [Welcome to the Jungle / Otta](https://www.welcometothejungle.com/en) | Strong product/startup fit. The former Otta service's [supported locations](https://support.welcometothejungle.com/en/articles/6882137-job-locations-we-support) focus on selected North American/European markets; distinguish relocation from Malaysia-remote eligibility. | **Research, high value.** No verified public reading integration. |
| 12 | [Outsourcely](https://outsourcely.com/) | Current job inventory could not be retrieved or verified. | **Hold.** A failed retrieval is not evidence of permanent closure. |
| 13 | [Pangian](https://pangian.com/) | Domain currently redirects to a [transition notice](https://pangianhq.github.io/pangian-com/), rather than an operational job feed. | **Hold.** Recheck if the service resumes; do not crawl the notice. |
| 14 | [Remote.co](https://remote.co/) | Broad remote board, including international listings and geographically restricted roles. Separate from Remote.com. | **Research, secondary.** No verified public reading API/RSS. |
| 15 | [RemoteHub](https://www.remotehub.com/) | Job/freelance marketplace. Root access was blocked; [official help](https://help.remotehub.com/hc/en-us/articles/360020973478-Is-RemoteHub-free) establishes the marketplace model, not current job-feed access. | **Manual/hold automation.** No verified public reading interface. |
| 16 | [Remote OK](https://remoteok.com/) | Relevant remote engineering board; geography and broad tags need careful filtering. | **Integrate first.** Public JSON. Old `.io` domain is an alias. |
| 17 | [Remotive](https://remotive.com/) | Relevant remote engineering source with descriptions and candidate-location text. | **Integrate first.** Public API with delayed data and at most four daily requests. |
| 18 | [SkipTheDrive](https://www.skipthedrive.com/) | Free browsing with software/web categories. No official job-feed interface established. | **Research, secondary.** Do not assume a generic blog RSS feed contains jobs. |
| 19 | [Turing](https://www.turing.com/) | Current offering includes AI coding evaluation/review work, which may fit harness experience, alongside other talent work. Inspect whether each opportunity is product ownership or evaluation contracting. | **Manual, worth considering.** Talent qualification/onboarding is separate from collection. |
| 20 | [Toptal](https://www.toptal.com/) | Vetted freelance network; potentially useful for frontend/product contracts. | **Manual.** Network onboarding, not a verified public job-feed integration. |
| 21 | [Virtual Vocations](https://www.virtualvocations.com/faq) | Curated remote jobs; free access is partial and full database access is paid. | **Manual, lower priority.** No verified public job-reading API. |
| 22 | [We Work Remotely](https://weworkremotely.com/) | Relevant engineering, design, and product categories, with an explicitly offered public feed. | **Integrate first.** RSS with attribution. |

### Additional names from the 2022 screenshots

| # | Source | Fit and current evidence | Decision |
| --- | --- | --- | --- |
| 23 | [4 Day Week](https://4dayweek.io/) | Reduced-hours employers include relevant engineering roles. The user need not require a four-day schedule to benefit from this board. | **Integrate first.** Documented free v2 API. |
| 24 | [Authentic Jobs](https://authenticjobs.com/) | Design/development positioning is relevant. Site responds, but current listing inventory and a supported API were not established. Historical API references are insufficient. | **Research.** Validate current jobs and interface before prioritizing a connector. |
| 25 | [ClojureJobboard](https://clojurejobboard.com/) | Active specialist board with a working RSS feed. Larger language/stack branch than current frontend roles. | **Integrate optionally.** Low-cost, low-priority adjacent discovery. |
| 26 | [Codestunts](https://codestunts.com/) | Current service and job inventory could not be verified. | **Hold.** Old screenshot alone is insufficient. |
| 27 | Crypto Jobs — [original link](https://lnkd.in/dQp-wMYs) | Exact shortened destination unresolved. [CryptoJobs at crypto.jobs](https://crypto.jobs/) is a plausible brand match and has live listings, including frontend/AI roles, but that mapping is not confirmed. | **Research.** Preserve ambiguity; do not silently substitute CryptoJobsList or another crypto board. |
| 28 | [Cryptocurrency Jobs](https://cryptocurrencyjobs.co/) | Active specialist board with frontend/product opportunities alongside blockchain-specific roles. | **Research, secondary.** No verified public feed in this review; distinguish cash compensation from tokens/equity. |
| 29 | [Diversify Tech](https://www.diversifytech.com/) | Current site identifies career opportunities for marginalized people in tech, but readable inventory was unavailable. Old `.co` addresses failed. | **Research.** Verify current job service/access; assess listing eligibility without assuming the user's identity. |
| 30 | [Dribbble Jobs](https://dribbble.com/jobs) | Active design job board; useful mainly for design engineering, UI/UX, and creative development branches. Screenshot spells it “Dribble.” | **Research, secondary.** No verified public job API/RSS. |
| 31 | [FindBacon](https://findbacon.com/) | Current site/inventory could not be verified. | **Hold.** Historically relevant naming does not establish a functioning source. |
| 32 | [freelancermap](https://www.freelancermap.com/) | Active IT contract marketplace with remote, hybrid, and onsite projects. Location and client-language requirements matter. | **Manual.** Useful contract branch; no verified public reading feed. |
| 33 | Full-stack developer Jobs — [original link](https://lnkd.in/d4gpyzvy) | Generic label; exact destination unresolved. | **Hold identification.** Full-stack roles are a strong fit, but a specific provider is not established. |
| 34 | [GolangProjects](https://www.golangprojects.com/) | Active Go board with working RSS; developer tooling/infrastructure are plausible adjacent areas. | **Integrate next.** Rank by actual Go requirements. |
| 35 | GraphQL Jobs — [original link](https://lnkd.in/dPWKyzEU) | Exact destination unresolved; `graphql.jobs` could not be verified as a functioning current board. | **Hold.** GraphQL can remain a search keyword in working sources. |
| 36 | [Guru](https://www.guru.com/) | Freelance marketplace candidate; current site content could not be retrieved in this review. | **Manual/hold automation.** No confirmed current reading API or feed. |
| 37 | [HackerX](https://hackerx.org/) | Recruiting events and talent matching, with engineering skill coverage. | **Manual.** Potential discovery/network channel, not an established scheduled vacancy feed. |
| 38 | [Hasjob](https://hasjob.co/) | Active board; inspected listings were largely India-oriented and mixed in seniority. | **Research, lower priority.** Retain explicitly global/relocation-compatible roles; public reading interface unverified. |
| 39 | [HigherEdJobs](https://www.higheredjobs.com/) | Potential university software/research-computing branch. Site and putative RSS page did not expose usable inventory in this check. | **Hold automation.** Current access/feed unverified; do not confuse academic faculty qualifications with software-role requirements. |
| 40 | [HN Hiring](https://hnhiring.me/) | Current site access could not be verified. Would need to show incremental value over collecting HN's original hiring threads. | **Hold.** Prefer official HN data already covered. |
| 41 | [JOBBOX.io](https://jobbox.io/) | Current domain redirects to parking. Historical JOBBOX material exists in Landing.jobs' own archive; both labels share one screenshot short link. | **Hold as legacy alias.** No separate connector. |
| 42 | [Jobhunt.ai](https://jobhunt.ai/) | Current service and inventory could not be verified. | **Hold.** Do not infer current capabilities from the name. |
| 43 | [Jobspresso](https://jobspresso.co/) | Reachable board with development/product categories. Search also surfaced very old listing pages, so validate opening status at the employer. | **Research.** Useful potential source; no verified official jobs API/RSS. |
| 44 | [Landing.jobs](https://landing.jobs/) | Tech-career service with European/remote positioning in its [own archive](https://wp.landing.jobs/blog/tag/landing-jobs/). Current main site returned 403. | **Research/manual.** Potential relocation value; current inventory and automation route not verified. |
| 45 | [LaraJobs](https://larajobs.com/) | Active Laravel board with working RSS; React/Vue full-stack roles can fit previous experience. | **Integrate next.** Adjacent rather than a required stack preference. |
| 46 | [No Fluff Jobs](https://nofluffjobs.com/pl/) | Active tech board with visible salary ranges; inspected market is Poland/CEE. Relevant frontend/full-stack/AI categories. | **Research.** Useful relocation branch; verify work country, language, and sponsorship per job. No public feed established. |
| 47 | [PowerToFly](https://powertofly.com/jobs/) | Active job board emphasizing inclusive employers, with engineering opportunities. | **Research, secondary.** No verified public reading API; use job requirements rather than demographic assumptions. |
| 48 | [Remote Game Jobs](https://remotegamejobs.com/) | Active specialist board; game UI, native tooling, and developer tools may fit. Engine-specific gameplay roles may require a larger transition. | **Research, secondary.** No official reading feed verified. |
| 49 | [remote-es/remotes](https://github.com/remote-es/remotes) | Company directory focused on remote work with Spanish contracts. Not a stream of current openings. | **Employer discovery only.** Follow suitable company career sources; do not convert every directory entry into a vacancy. |
| 50 | remote-jobs — [original link](https://lnkd.in/duVv2aw5) | Generic name with unresolved destination. | **Hold identification.** Cannot responsibly select a same-named repository or board. |
| 51 | [Remotees](https://remotees.com/) | Current site/inventory could not be verified. | **Hold.** No connector until availability and unique coverage are established. |
| 52 | RemotExtra — [original link](https://lnkd.in/dQFa_-ZN) | Shortened destination and a functioning current board could not be established. | **Hold.** Do not substitute a similarly named service. |
| 53 | [RemoteJobs.lat](https://remotejobs.lat/) | Active Spanish-language LATAM-oriented board. | **Research, lower priority.** Include globally eligible roles or feasible relocation; LATAM residence requirements are not citizenship requirements. |
| 54 | [Remote People](https://remotepeople.io/) | Supplied `.io` domain showed a directory/index rather than usable job listings. Do not conflate it with other similarly named recruiting sites. | **Hold.** No current vacancy feed established. |
| 55 | Remote Works — [original link](https://lnkd.in/dZ59-iCY) | Generic name; exact destination unresolved. A similarly named podcast does not establish the screenshot's destination. | **Hold identification.** |
| 56 | [Ruby on Remote](https://rubyonremote.com/) | Active Ruby/Rails job board. Full-stack frontend work may be adjacent; Ruby-specific seniority needs evidence. | **Research, lower priority.** No official feed verified. |
| 57 | [Slasify](https://slasify.com/) | Current site presents payroll/global employment services, not an established public multi-employer job feed. | **Employer discovery only.** Its own careers may be relevant; do not assume access to client-company vacancies. |
| 58 | Stack Overflow Jobs | The original service is historical; an [Indeed-powered version appeared in 2024](https://stackoverflow.blog/2024/07/01/community-products-roadmap-update-july-2024-an-update-on-recent-launches-and-the-upcoming-roadmap/), so “closed in 2022” alone is incomplete. Current [`/jobs`](https://stackoverflow.com/jobs) returned 404 and [stackoverflowjobs.com](https://stackoverflowjobs.com/) redirected to questions. | **Hold.** No functioning current jobs destination verified. |
| 59 | [SwissDevJobs](https://swissdevjobs.ch/) | Primary-domain [job pages](https://swissdevjobs.ch/de/jobs/Backend/all) show technical roles and salary ranges despite root-access issues. Relevant to relocation. | **Research.** No public reading API/RSS established; check language and sponsorship explicitly. |
| 60 | [Upwork](https://www.upwork.com/) | Active freelance marketplace. Official developer documentation exists, but this review did not establish the user's approved job-search API access. | **Manual.** Consider read-only integration only after access/terms verification; never add proposal or bidding automation. |
| 61 | [VueJobs](https://vuejobs.com/) | Active and directly relevant to frontend/full-stack experience. | **Research, high value.** No current public API/RSS verified; investigate employer career feeds. |
| 62 | React.js Jobs — [original link](https://lnkd.in/dyW5WNwu) | Very relevant category, but exact provider unresolved. | **Hold identification.** Keep React searches across working sources; do not assume ReactJobsBoard is the intended destination. |
| 63 | [Remote.com Jobs](https://remote.com/jobs) | Working public job board, in addition to Remote's employment products. Includes technical and nontechnical roles. | **Research.** Relevant global-employer discovery; no public job-reading API/RSS established. |
| 64 | Web3Jobs — [original link](https://lnkd.in/dZc-eKGG) | Short-link mapping is unconfirmed, but [web3.career](https://web3.career/) is an independently verified current board with a documented API. Frontend/product roles offer relevant coverage. | **Integrate web3.career optionally after token setup.** Preserve the original-link uncertainty. |
| 65 | We Love Go — [original link](https://lnkd.in/dT7tYSBQ) | Operator's [historical post](https://gist.github.com/jonathaningram/5b334274d6bc91554687e64608322419) identifies `welovegolang.com`; current board access failed. | **Hold.** Use working GolangProjects feed for this branch. |

### Final nine-domain screenshot: new names

| # | Source | Fit and current evidence | Decision |
| --- | --- | --- | --- |
| 66 | [whoishiring.io](https://whoishiring.io/) | Domain responds, but no readable job inventory or supported interface could be established. Do not assume it is HN's official hiring service. | **Hold/research.** Needs a functioning current search and evidence of additional coverage. |
| 67 | [The Ladders](https://www.theladders.com/) | Active service positioning around $100K+ professional roles, with premium application/CV services. That salary positioning does not itself establish Malaysia eligibility or strong product-engineering coverage. | **Manual, lower priority.** No verified public reading feed; its application automation is outside this product's scope. |

## What this means for the collector

1. **Use adapters for supported APIs and job RSS first.** HTML parsing is a later source-specific decision after checking current terms and access rules. Low frequency does not itself grant permission. Do not bypass login walls, CAPTCHAs, blocks, or paywalls.
2. **Discover employers, then follow their supported career feeds.** A good board without a public API can still identify relevant companies. Follow an employer source under its own supported access route; do not reverse-engineer a board's private browser endpoints as a substitute for permission.
3. **Deduplicate jobs as well as websites.** Match canonical employer/application URLs and provider requisition IDs first, then normalized company/title/location. Preserve all discovery links. Avoid merging separate locations or requisitions solely because titles match.
4. **Keep eligibility separate from fit.** Store residence, allowed work countries, timezone overlap, relocation, sponsorship, existing work authorization, and citizenship restrictions separately. “Remote US” is not “US citizens only”; it is also not evidence of permission to work remotely from Malaysia. Keep unknowns visible.
5. **Measure incremental value.** Track relevant unique jobs, duplicate rate, explicit Malaysia/global eligibility, description completeness, stale/closed jobs, request cost, and connector failures. Promote sources that add useful opportunities, not merely the most records.
6. **Treat salary as evidence with units.** Preserve original currency, annual/monthly/hourly period, cash versus equity/tokens, and employer-stated versus estimated figures. Do not discard missing salaries given the user's flexibility.
7. **Keep X distinct from board aggregation.** X is already a required organic source with an approved 1,000-post monthly retrieval allowance. Extra boards should not consume or replace that budget. Keep the current account settings intact during this evaluation.
8. **Preserve the existing action boundary.** Reading listings and generating private CV drafts are permitted. No applications, account/profile publication, submissions, recruiter contact, messages, follows, reactions, or approval-to-send workflow.

## Open checks before later integrations

- Confirm full-description fields, pagination, conditional requests, source-specific page budgets, and expiry behavior in each adapter. One successful response is not a complete connector test.
- Resolve generic old shortened links only if their current destination becomes available; they do not block the verified integrations.
- Review a small sample of current employer openings to compare relevant unique coverage. This review did not estimate match rates from marketing job counts.
- Obtain a separate Web3.career token only if that optional source is selected. No account was created and no credential was requested or used during this assessment.
- Revisit source terms when actually implementing, because interfaces and permissions can change.

The initial evaluation changed documentation only. The later authorized implementation is recorded at the top of this report. No employer-facing action was added.
