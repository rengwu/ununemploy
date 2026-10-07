---
title: Discovery and sources
section: Features
updated: 2026-10-07
---
# Discovery and sources

Feature ID: `FEAT-discovery`

## Intent and basis

Collect bounded, attributable job leads while preserving source progress and user data. Based on the [accepted project boundaries](../decisions/index.md) and existing implementation documentation; this migration adds no product requirement.

## Entry points and prerequisites

Sources configures identifiers and intervals; Scan and the worker require a ready profile. X/Web3 need separate credentials and configured budgets.

## Expected outcomes

Failed or partial scans preserve listings and checkpoints. Budgets apply to manual scans too. Saving an excerpt waits for details. Manual entry never submits anything externally.

## Verification recipe

Use [shared verification setup](../verification/setup.md) for isolation, build identity, evidence and cleanup. `npx tsx --test tests/discovery.test.ts tests/public-boards.test.ts tests/next-sources.test.ts tests/vuejobs.test.ts tests/system.test.ts` uses isolated data and simulated provider responses. Live Scan calls need intentional source selection and its configured request allowance.

Recipes are migrated from existing scripts and historical checks; they were not re-executed during the wiki migration.

## Coverage and limitations

Fixture checks do not establish current provider access. [Coverage](../reference/source-coverage.md) gives dated live observations; incomplete API adapters are explicit.

## Verification history

[X status check — 7 October 2026](../verification/runs/2026-10-07T073652Z-x-status.md): recent budget-limited scans imported posts; the local runtime was stopped at inspection.

[Historical implementation checks](../verification/history.md) record previous selected scenarios and limitations. Those entries are historical evidence; new reports belong in [verification runs](../verification/index.md).


| Source | Identifier | Access |
| --- | --- | --- |
| Ashby | Board name, e.g. `linear` | Public posting API |
| Greenhouse | Board token, e.g. `anthropic` | Public job board API |
| Lever | Site name | Public postings API |
| Hacker News | `whoishiring` | Official Firebase API; current and preceding hiring threads |
| RSS / Atom | Public feed URL | Public feeds |
| X | Search query | Official recent-search API and app-only bearer token |
| Himalayas | Search keywords separated by `\|` | Public search API; two recent pages per keyword |
| Remote OK / Remotive / Jobicy | Fixed feed | Public JSON APIs |
| 4 Day Week | Category slugs separated by commas | Public v2 API; newest page plus resumable older pages |
| Arbeitnow | `de` or `uk` | Public visa-sponsorship job APIs |
| Hacker News · YC jobs | `jobstories` | Official Firebase API, separate from monthly hiring threads |
| Web3.career | Fixed feed | Official JSON API; separate token, up to 100 recent listings per scan |
| Public job board | Select a board | Public HTML, embedded page data or published feed/API; status reports access failures and setup requirements |
| Manual entry | Website URL | Open the site yourself and paste a posting; no automatic requests |

Fresh installations include **57 source configurations**, including 28 boards from the latest expansion. Existing Wellfound and Welcome to the Jungle entries are upgraded in place. This is a configuration count, not 57 distinct working job boards. See [current results and access limitations](../reference/source-coverage.md). X still requires local credentials and a configured budget.

For an existing installation, add missing catalog entries without changing existing source preferences:

```sh
npx tsx scripts/add-discovery-sources.ts
```

To install only the 28 public-board entries, use `npx tsx scripts/add-public-boards.ts`. Both installers are idempotent and preserve existing collector preferences.

Collection defaults to every four hours, with individual intervals editable in Sources. Effective scheduled intervals use the slower of the global and source settings. Himalayas runs daily, Remotive/VueJobs/Web3.career twice daily, specialist RSS daily, and most other additions two to four times daily. Each source has at most six scans per calendar day, including manual scans; collector cooldowns enforce daily Himalayas collection, at most four Remotive scans, and at most two Web3.career scans. Every scan also has a request budget. Fetches use conditional caching, a per-host delay, response-size limits, and Retry-After cooldowns. Partial HN/Lever/X/Himalayas scans retain checkpoints. Failed scans preserve existing jobs and drafts.

Public-board collectors run at most twice daily, with at most 12 HTTP requests per scan, including redirects and failures. The first page refreshes on each pass; supported pagination continues from saved checkpoints, and remaining requests process a SQLite description queue. Completed detail pages are reused and become eligible for revalidation after seven days. Blocked/challenged sources wait at least 24 hours; manual scans respect cooldowns. The Sources page distinguishes **Blocked**, **Unavailable**, **Failed** and **Needs API setup**. Adzuna, Jooble and Careerjet are registered but await publisher credentials and API adapter configuration; they make no requests. Web3 remains separate and pending its token. Public-page discovery never closes vacancies simply because they disappear from a partial result page.

Public feeds retain their source URLs and attribution. RSS extracts employer and location fields where supplied; excerpts and empty descriptions remain leads. Saving an RSS lead waits for a complete description. VueJobs can retrieve its public job page on save or through **Load full description**. For other excerpts, paste the full text in the Description editor and retry the cover-letter task. Truncated feeds do not close missing listings. Himalayas expiry timestamps are retained and already-expired incoming entries are marked closed. Pay periods/currencies remain unknown when a feed omits them; 4 Day Week salary cents are converted to currency units. These feeds are bounded discovery, not exhaustive mirrors. VueJobs discovery uses its publisher-advertised RSS feed. Public detail retrieval is on demand, not a crawl: one request per lookup, at most six per UTC day, with a six-hour failed-attempt cooldown and provider Retry-After handling. It accepts only matching JobPosting data also present in the public page text, keeps source attribution, and preserves full descriptions across shorter RSS refreshes. Manual edits take precedence. Unavailable/gated descriptions remain excerpts; no paywall bypass is used.

### Web3.career setup

1. Obtain your token from the [official API page](https://web3.career/web3-jobs-api).
2. In **Settings → Web3.career**, enter it and choose **Save token**. It is stored in the data directory’s `secrets/web3.json` with mode 0600 and is never returned to the browser. Alternatively use `JH_WEB3_API_TOKEN`; a dashboard-saved token takes precedence.
3. The enabled source becomes eligible for its scheduled scan. It reads up to 100 recent listings with full descriptions, without country or remote-only filters, twice daily. No pagination is offered by the API, so this is bounded coverage.

Missing credentials make no requests; HTTP 401/403 pauses further attempts until the token is replaced in Settings. Query-string credentials are excluded from the HTTP cache and error history, and credentialed redirects are not followed. Original `apply_url` values and follow links are retained as required by the [API terms](https://docs.bondex.app/api-reference/web3-career-jobs-api/api-overview). Authenticated Web3 collection still requires live verification after the user supplies a token.

### Manual job entry and public boards

**Sources → Open site** opens the provider for you. **Add job** accepts the role, employer, posting URL, location and description while keeping that board’s attribution. Adding a job does not generate a draft; saving it in Jobs does. Sources of type `manual` cannot be scheduled or scanned.

Wellfound and Welcome to the Jungle entries were subsequently upgraded to `public_board`. Their automated results and access limits are in [source coverage](../reference/source-coverage.md); manual Add job remains available. The earlier manual-only behavior is preserved in the [source-evaluation journal](../journal/2026-09-16-source-evaluation.md).

### X setup

1. Sign in to the [X developer console](https://console.x.com/), create an app, and obtain its **app-only bearer token**. This is the credential for reading public data; user access tokens are unnecessary. [Official access guide](https://docs.x.com/x-api/getting-started/getting-access).
2. In **Settings → X**, enter the bearer token and choose **Save token**. It is stored locally under the data directory with mode 0600 and is never returned by the API. Alternatively set `JH_X_BEARER_TOKEN` in `.env` or the Unraid template. A dashboard-saved token takes precedence.
3. Set a monthly post limit of at least 10, enable X, and save settings. The default is zero and disabled, so no paid requests begin before configuration. X API usage is separate from the Codex subscription; manage API credits and spending controls in the X console.
4. Open **Sources → X · Engineering** to edit the starter search, add more searches, or scan. Searches support the [official recent-search syntax](https://docs.x.com/x-api/posts/search-recent-posts), including `from:account` and `-is:retweet`.

The initial X scan looks back 24 hours. Later scans use fixed time windows and resume pagination without advancing the completed checkpoint early. The API only exposes recent history; after an extended outage, older posts may be unavailable. Post IDs remain strings. Results deduplicate across searches. Retrieval volume is reserved before requests; ambiguous failures retain reservations. The counter is conservative and is **not a currency spending guarantee**. The cap is shared by all X searches and resets by UTC calendar month. Sources have separate daily scan caps.

X batches divide the remaining monthly allowance across the remaining time and enabled searches. Because the API requires at least 10 posts per request, small budgets extend the interval between scheduled X scans beyond four hours. The next scan time is persisted. Manual scans share the monthly cap but can run before the scheduled time. High-volume searches may outpace the chosen budget.

X is a required integration, implemented with credential entry, saved queries, retrieval limits, and fixture coverage. Authenticated retrieval was verified locally on 15 September 2026 with a selected limit of 1,000 posts per UTC calendar month. The first two requests consumed 20 post reads and yielded 17 unique records. These are historical observations; Settings and scan history describe the current configuration and allowance. Fresh installations require their own locally configured credentials and settings.
