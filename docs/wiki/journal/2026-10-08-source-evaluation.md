---
title: Source evaluation — 8 October 2026
section: Journal
updated: 2026-10-08
---
# Source evaluation — 8 October 2026

Evaluation of the eight-source screenshot, the additional 30-platform screenshots, TechReferrals, five subreddits and HNHIRING supplied by the user. Repeated Remotive and Dynamite Jobs entries are counted once: **38 website identities and five subreddits**. Recommendations below are research findings, not installed connectors or verified unique-job yield. This review changed documentation only.

**Later scope correction:** The Muse is completely out of scope, including registration, credentials, adapter work, setup and follow-up. Historical evaluation below does not authorize it. The other four selected additions are recorded in the [implementation run](../verification/runs/2026-10-08T075217Z-integration-implementation.md).

## Already covered

Repository checks used `core/source-catalog.ts`, `core/boards/catalog.ts`, `core/connectors.ts` and `core/discovery.ts`. Existing source enablement and current scan health were not changed or reverified.

| Source | Existing coverage |
| --- | --- |
| We Work Remotely | Programming, design and product RSS configurations. |
| Remote OK | JSON adapter and catalog entry. |
| Himalayas | Search API adapter and catalog entry. |
| Remotive | JSON adapter and catalog entry; repeated in the later screenshot. |
| Wellfound | Public-board adapter, upgraded from the historical manual entry. |
| [Remote Hunt](https://remotehunt.com/) | Supplied domain redirected to We Work Remotely in the local probe. Treat as an alias, not another board. |
| [HNHIRING](https://hnhiring.com/) | Indexes HN's “Who is hiring?” threads. The app already reads those threads through HN's original Firebase API. No separate HNHIRING adapter; its archive/search UI is not additional current vacancy coverage. The separate `hn_jobs` adapter also reads HN job stories. |

## Recommended additions and further research

Priority reflects the product's engineering scope, accessible listing evidence and integration effort. It is not a candidate match score. A remote label does not establish worldwide eligibility.

| Source | Observed evidence | Recommendation |
| --- | --- | --- |
| [Working Nomads](https://www.workingnomads.com/jobs) | The site's API link leads to a [public JSON feed](https://www.workingnomads.com/api/exposed_jobs/). Local HTTP 200 returned 57 records, including 25 Development records, with company, title, description, tags, location and publication date. | **First priority.** Small dedicated JSON adapter; retain geography and original links. No authentication needed for this probe. |
| [WordPress Jobs](https://jobs.wordpress.net/) | Officially linked [RSS](https://jobs.wordpress.net/feed/) returned HTTP 200 and three actual jobs with full-content fields; the page showed three openings. | **Low-cost optional addition.** Narrow WordPress/design coverage. RSS author is a posting account, not necessarily the employer; add source-specific company/location extraction. |
| [RemoteJobs.com](https://www.remotejobs.com/) | Advertised [jobs RSS](https://www.remotejobs.com/jobs.rss) returned HTTP 200, 1,000 items and about 8.1 MB. Descriptions ranged from 23 to 25,101 characters. | **Useful feed candidate, quality check required.** Broad inventory includes field-service/travelling work and questionable category/salary labels. Validate remote arrangement, employer, geography and salary units from the description. |
| [Dynamite Jobs](https://dynamitejobs.com/category/remote-development-jobs) | Public developer-category HTML and a full-stack detail returned 200. Detail included JobPosting data and a 3,669-character description. | **Good HTML-adapter candidate.** Relevant engineering/product/AI coverage. The advertised RSS is a blog feed; its [Company API](https://dynamitejobs.com/developers/) explicitly does not expose the public board. |
| [The Muse](https://www.themuse.com/developers/api/v2) | Official public jobs/company API. One local test returned 200 with 20 jobs and HTML descriptions. Its [API terms](https://www.themuse.com/developers/api/v2/terms) require app registration. | **Useful after registration and filter validation.** The test's Software Engineering category query also returned an unrelated retail role; do not assume the requested filter worked. No registration or credential creation performed. |
| [RemoteWoman](https://remotewoman.com/) | Public HTML returned 200 with engineering/product job links. Many visible examples were US-restricted. The advertised `/feed/` contained two blog articles from 2019. | **Secondary HTML source.** Inspect actual job requirements and country restrictions. Female-friendly positioning alone is not evidence that every vacancy restricts applicant gender. No job RSS verified. |
| [JustRemote](https://justremote.co/) | Homepage and sample job returned 200. The detail had a 2,109-character JobPosting description and explicit US applicant restriction. The developer-category response exposed no vacancy links. | **Secondary; discovery incomplete.** Public detail parsing is feasible, but homepage freshness is not complete category coverage. No official job API/RSS verified; paid PowerSearch remains separate. |
| [PowerToFly](https://powertofly.com/jobs/) | Live job-search page with remote, skill and country filters; local 200 response exposed a loading shell, not usable listing inventory. | **Secondary research.** Relevant engineering/product employers. Need a proven public discovery/detail route; do not substitute promotional AI-training enrollment for current vacancies. |
| [TechReferrals](https://techreferrals.in/) | Public research retrieval showed manually curated LinkedIn hiring/referral summaries, company/role/location tags, pagination and a remote filter. Local homepage and remote-filter requests returned 429 with a security page. | **Potential lead source; hold automatic collection.** India-heavy sample, with some international remote leads. Original LinkedIn posts remain the record; summaries and multi-role hiring posts are not full, verified vacancies. |
| [Crossover](https://www.crossover.com/jobs) | Public jobs page showed remote software/AI roles and country-dependent results. The root alone was a shell in the local probe. | **Secondary public-listing research.** Separate job discovery from its qualification assessments and application process. No supported public feed verified. |
| [Idealist](https://www.idealist.org/en) | Active nonprofit jobs and volunteering platform. Its advertised [Open Network API](https://www.idealist.org/en/open-network-api) is for volunteer opportunities. | **Secondary, paid jobs only.** Potential social-impact engineering employers. Do not treat the volunteer API as a paid-job feed. |
| [Jobmote](https://jobmote.com/) | Local request redirected to [Scrums.com jobs](https://www.scrums.com/jobs). | **Reclassify for employer/talent-network research.** No independent Jobmote board verified; Scrums.com needs its own role/eligibility review. |

Working Nomads is the strongest first addition. Its observed feed is a limited snapshot, not the site's premium inventory or a proven complete crawl. Publication dates in the sample spanned 7 September–7 October. Structured expiry, salary, pagination and rate-limit documentation were not established. Its [terms](https://www.workingnomads.com/terms-and-conditions) restrict competitive/commercial exploitation; the public API link is not permission to redistribute the board. A proposed initial schedule is once daily with conditional caching, subject to implementation checks.

Dynamite Jobs' [sample full-stack role](https://dynamitejobs.com/company/backgammon/remote-job/senior-full-stack-engineer-us-remote) required US residence despite being fully remote. The local category included ordinary vacancy links, whereas the general `/remote-jobs` research extraction was a shell. Use verified category discovery and exact detail identities, not a claim of exhaustive board coverage. Its `/feed/rss.xml` returned 138 **blog articles**, not vacancies.

For TechReferrals, keep referrer attribution distinct from employer identity and preserve the original post URL. A read-only collector must never implement its suggested contact/referral actions. The [remote filter](https://techreferrals.in/?remote=Remote) exposed relevant frontend/full-stack and AI leads in research retrieval, but neither Malaysia eligibility nor local collector reliability was established. The 429 responses make source enablement premature.

## Hold or exclude

“Unavailable” means this review did not establish a functioning current source. It does not prove permanent closure. Exact supplied domains are retained; similarly named services are not silently substituted.

| Source | Observed evidence and decision |
| --- | --- |
| [RemoteHub — supplied `.io` domain](https://remotehub.io/) | **Exclude this domain.** Returned Korean cryptocurrency-casino content. It is not the separately researched `remotehub.com` marketplace. |
| [Remote Work Hub](https://remoteworkhub.com/) | **Low priority/hold.** Public 200 page showed one sales opening and zero software/development openings across displayed categories. Marketing claims do not establish useful inventory. |
| [Remote Jobs Club](https://remotejobsclub.com/) | **Hold.** Research retrieval and local fetch failed; current newsletter archive/job feed unverified. |
| [CloudPeeps](https://cloudpeeps.com/) | **Hold.** Current official inventory unavailable. Older freelance-marketplace descriptions and recent third-party listicles do not establish a working source. |
| [Simply Communicate jobs](https://simply-communicate.com/jobs) | **Hold.** Supplied jobs route unavailable in research/local probes. Communications-oriented positioning in the screenshot is lower priority than engineering coverage. |
| [Virtual Assistant Jobs](https://virtualassistantjobs.com/) | **Exclude for now.** Public 200 page contained template filler, placeholder testimonials and a deleted/unavailable form. No usable vacancy inventory verified. |
| [OutsourcingJobs.ph](https://outsourcingjobs.ph/) | **Hold.** Supplied domain unavailable. Do not substitute `outsourced.ph` or `onlinejobs.ph`. |
| [RemoteBaba](https://remotebaba.com/) | **Hold.** Research retrieval and local fetch failed; functioning current board unverified. |
| [RemoteJobr](https://remotejobr.com/) | **Exclude for now.** Redirected to a parked/search-link page, not a verified vacancy board. |
| [Jobscribe](https://jobscribe.com/) | **Hold.** Current site/feed unavailable in this review. |
| [Outsourcing Insight](https://outsourcinginsight.com/) | **Exclude as a job feed.** Current site presents outsourcing services, articles and consultation rather than a vacancy board. |
| [GoRemote](https://goremote.io/) | **Exclude for now.** Redirected to a domain-for-sale page. |
| [Awesome Jobs](https://awesomejobs.io/) | **Hold.** Research retrieval returned 502; local fetch failed. Current inventory unverified. |
| [TechJobs](https://techjobs.com/) | **Hold.** Local 200 response exposed only the domain title, without readable jobs. No usable source verified. |
| [Laravel Jobs — supplied URL](https://jobs.laravel.io/) | **Hold exact identity.** Supplied subdomain unavailable. LaraJobs is already integrated, but no verified redirect establishes these as aliases. |
| [Jobs in Pods](https://jobsinpods.com/) | **Exclude this domain.** Redirected to Legislate.ai contract/legal-tech content. |
| [RubyNow](https://rubynow.com/) | **Hold.** Root and the additionally checked `jobs.rubynow.com` did not yield usable current listings. |
| [Remoters](https://remoters.net/) | **Hold automation.** Local HTTP 403; research retrieval timed out. No attempt to bypass the block. |
| [Outsourcely](https://outsourcely.com/) | **Hold.** Current inventory unavailable, consistent with the earlier evaluation's unresolved status. |

## Reddit feasibility

Read-only public Atom access is technically possible, but this is not yet an enabled Reddit integration. `r/RemoteJobs/new/.rss?limit=10` and `r/remotework/new/.rss?limit=10` each returned HTTP 200 with ten entries locally. The subsequent `r/remoteworks` request returned **429**; further feed probes stopped. This establishes intermittent access, not reliable scheduled operation.

| Community | Assessment |
| --- | --- |
| [r/RemoteJobs](https://www.reddit.com/r/RemoteJobs/) | Best candidate of the supplied communities for a **filtered lead pilot**. Contains job postings and general discussion; the retrieved feed also included job-seeker advice requests. |
| [r/remotework](https://www.reddit.com/r/remotework/) | Mostly remote-work discussion. Its hiring megathread is more relevant than importing every new post. A submissions-only feed would miss vacancies in megathread comments. |
| [r/remoteworks](https://www.reddit.com/r/remoteworks/) | Mixed discussion, memes and job-seeker posts in the research sample; local feed throttled. Low priority. |
| [r/RemoteJobseekers](https://www.reddit.com/r/RemoteJobseekers/) | Mainly job-seeker discussion/advice in the sample. Low priority; direct Atom retrieval left untested after the host's 429. |
| [r/remoteviewing](https://www.reddit.com/r/remoteviewing/) | **Exclude.** Community is about alleged psychic/remote-viewing phenomena, not remote employment. |

The existing generic RSS/Atom parser is insufficient for Reddit: it maps feed author to company and can classify long post content as a full opening. A Reddit adapter needs explicit hiring-post selection, exclusion of for-hire/advice/promotional posts, unknown employer/eligibility handling, original post attribution, canonical employer-link deduplication, shared host backoff and retention/deletion handling. Store unverified posts as leads. Do not manufacture employer names or treat posting age as proof that a vacancy is open.

Reddit's [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy) requires explicit approval for Data API access; its [Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki) also describes authentication, rate limits and removal of deleted data. Public RSS responding successfully does not establish an approved substitute for unrestricted API collection. Before scheduled Reddit integration, resolve the supported access route and retention requirements. No account/app registration, access request, posting, comment, DM, vote or subscription was performed.

## Evidence, limitations and follow-up

- Read-only research used official public pages plus bounded local Node HTTP GETs with an identifying ununemploy user-agent. No candidate facts, credentials, saved jobs or application records were sent. HTML and embedded JSON were inspected as data, never executed.
- Local raw snapshots and summaries are under `.local-data/verification/source-evaluation-2026-10-08/`, including `summary.json`, `more-summary.json`, `feeds-summary.json`, `reddit-summary.json` and `muse-summary.json`. Raw files remain outside the shareable wiki.
- Observation date is **8 October 2026 in Asia/Kuala_Lumpur**; raw timestamps are 7 October UTC. Search-index snapshots and direct responses can differ. Live feed/item counts are bounded observations, not stable totals or counts of unique suitable vacancies.
- Existing integrations were identified from source code, not freshly scanned. No new source configuration, adapter, database record, scheduled request, paid service or external notification was added.
- Suggested implementation order: Working Nomads; optional WordPress Jobs; RemoteJobs.com after feed-quality normalization; Dynamite Jobs public HTML. The Muse follows registration/filter checks. TechReferrals and Reddit remain conditional lead sources with access and classification work outstanding.
- Validate source-specific field extraction, freshness/closures, deduplication, description completeness and incremental unique coverage before promoting any source. Preserve manual descriptions and all provenance. Source terms and technical access are separate findings.

See [current source coverage](../reference/source-coverage.md) and [discovery behavior](../features/discovery.md). Historical [September evaluation](2026-09-16-source-evaluation.md) and [coverage research](2026-09-17-coverage-research.md) remain dated evidence.
