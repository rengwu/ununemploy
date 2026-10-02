# Architecture

## Runtime

- React and TypeScript with Vite, official Cloudflare Kumo components, and CodeMirror.
- Fastify HTTP API and static frontend serving in production.
- SQLite through Node's built-in driver: WAL, versioned migrations, transactions, durable work queues and collection checkpoints.
- A separate worker handles scheduling and serialized Codex generation. Supervisord runs API/worker together in the Unraid image, with automatic process restart.
- Playwright/Chromium prints the editable HTML/CSS documents to PDF. The `docx` library produces an editable Word document with its own layout.
- One locally built `linux/amd64` image, an Unraid XML template, and persistent `/config` appdata. No hosted domain or application login.

## Discovery

HN monthly threads and YC jobs, Ashby, Greenhouse, Lever, RSS/Atom, X, Himalayas, Remote OK, Remotive, 4 Day Week, Arbeitnow, Jobicy, and Web3.career adapters normalize into a shared job record. Provider IDs and canonical URLs deduplicate incoming data. Matching uses an evidence-based deterministic rubric for role, technologies, domain, level and requirement gaps. Explicit eligibility conflicts are filterable separately from uncertain visa/relocation requirements. Cross-board duplicate groups retain every original record. Per-source description versions, source precedence, expiry and age-based staleness protect listing quality. See [the implemented matching and listing-quality design](MATCHING_AND_LISTING_QUALITY.md). Unknown compensation does not hide a job. The catalog supplies 31 configurations, including separate WWR categories and seven additional direct employer boards, VueJobs RSS, Web3.career pending its token, and two manual-entry boards. Manual entries never trigger source requests. RSS excerpts wait for complete descriptions before cover-letter generation. VueJobs supports bounded on-demand enrichment from a matching public job page (`core/vuejobs.ts`), triggered by Save or Load full description. Stored details survive subsequent feed excerpts; manual edits win. Lookups use one GET, a persistent six-per-day UTC cap, cooldowns, and the existing isolated HTTP transport. Other excerpt sources still require manual detail entry.

Default collection interval: four hours, with slower per-source intervals. Each source has at most six daily scans, per-scan request limits, conditional HTTP caching, rate-limit backoff, and resumable pagination. Manual scans honor provider cooldowns too (daily Himalayas, at most four Remotive scans/day). Large discovery boards refresh recent results while advancing a bounded backlog. Complete company-board snapshots mark missing listings closed; truncated discovery feeds do not. Already-expired incoming jobs are marked closed when an explicit expiry is supplied. Partial/failed scans retain jobs and progress. Saved records, notes, and CV history survive closure.

X is a first-class adapter using official recent search. It supports editable saved searches, app-only bearer token entry, persistent fixed-window pagination, string post IDs, cross-search deduplication, and a shared monthly retrieval cap. Batch sizes and scheduled scan times divide the remaining allowance across the rest of the month and enabled searches; low budgets lengthen intervals because the API requires a minimum batch of ten. The user's chosen local cap is 1,000 posts per UTC calendar month. Live access requires the user's developer account/token and any API credits required by X. No X user-context or engagement APIs are present.

## Location filtering

Jobs and Saved share a grouped Kumo multi-select, with APAC/EMEA/Americas, SEA/East Asia first, and countries/areas within geographic groups. Cities and original labels appear in search. `core/location-index.ts` enriches original tokens with country and region facets using an offline GeoNames lookup; it leaves ambiguous names/codes and exclusions unresolved. Region selection expands to narrower known areas, while a regional-only posting never becomes a claim about a specific hiring country. Worldwide, Unspecified and Unresolved remain independent choices. Original source text, location scope and eligibility assessment are unchanged. The server alone loads the gazetteer; no runtime network geocoding or database migration is needed. [Data provenance and definitions](../data/geography/README.md).

Seen state is an optional first-open timestamp in each existing job document. `POST /api/jobs/:id/seen` atomically adds it once, preserving all other fields and avoiding CV/task changes. The regular job revision triggers invalidate query caches; `/api/jobs?seen=seen|unseen|all` applies the filter before duplicate grouping. GETs and default previews do not mark jobs seen. An explicit selection stays open across background updates even if its new Seen state removes it from Unseen results, until the user changes filters/pages or selects another job.

## Dashboard data loading

`GET /api/bootstrap` returns counts, task summaries without generation inputs, sources/settings and separate compact CV and cover-letter job choices. It does not load the job collection. Jobs/Saved request a filtered, sorted page from `/api/jobs`; only opening a detail pane requests `/api/jobs/:id`. Location options and master CV context have separate endpoints. Summary fields are explicitly allowlisted and exclude descriptions, notes, source histories and match evidence.

Filtering uses a cached server-side collection index. Migration 003 adds transactional revision triggers for jobs, observations, tasks, CV versions and source identity changes, so worker writes invalidate the API cache across processes. A minute bucket also expires time-dependent freshness. Index rebuilding uses a single SQLite read snapshot. Memory and rebuild work remain proportional to collection size; this does not claim SQL-indexed search.

ETags allow unchanged reads to return bodyless 304 responses. The browser polls status every eight seconds sequentially while visible, then revalidates the current page/detail only when its revision changes. Search is debounced; superseded requests are aborted and cannot overwrite newer results. Network/JSON errors retain the last good response with Retry, and reads have a 15-second timeout.

## Save to cover letter

1. Saving a job records its review status and enqueues one idempotent first-save task.
2. The task snapshots the description, profile revision, and template.
3. The official Codex CLI uses the user's ChatGPT subscription, exact requested model `gpt-5.6-sol`, and high reasoning. Generation is serialized and has no shell, browser, plugins, connectors, or messaging tools.
4. The output contains 3–5 first-person paragraphs with internal evidence references and separate review notes. The prompt targets 250–350 words and connects relevant experience to the opening. The application validates shape, evidence IDs, numeric claims, candidate evidence, and a 600-word ceiling; it adds a review note above 400 words. Name/contact/company/role/salutation/signature fields come from the application. These checks cannot establish semantic truth; the user reviews the result.
5. A new cover-letter version is written transactionally to its own table. Manual edits and regeneration append versions, preserving prior work.
6. The user reviews, edits, and downloads. No submission, employer upload, form filling, outreach, or engagement path exists.

Missing descriptions wait for user input. Authentication, model, allowance, or generation failures preserve saved work and expose retry controls. The runtime manages its own official authentication state; there is no custom refresh logic or billing fallback.

## Document management

The approved UI uses a source editor beside a rendered preview. The master is structured JSON with evidence references and explicit open questions. HTML/Handlebars and CSS are editable. Cover letters have separate version histories and independent edits. CV retains the master and legacy job-specific resumes; it no longer offers per-job generation. Migration 004 converts unfinished `cv` tasks to `cover_letter`, resets their document template, and pauses interrupted work. Completed resume records and task history remain unchanged. Saving/retrying uses cover-letter task keys and the worker only consumes that kind. `/api/cover-letters` exposes list/read/version/preview/export routes, separate from the retained `/api/cv` endpoints. Conflicting master edits are rejected by revision checking; successful master edits reassess job matches without changing existing drafts. Unsaved CV navigation prompts preserve deliberate review, while unfinished job notes are cached locally until saved. Loading failures can be retried, preview updates do not erase action errors, and editing/document switching is disabled during a save to prevent late responses from replacing newer input.

## Verification and remaining configuration

[VERIFICATION.md](VERIFICATION.md) records the actual checks. [README.md](../README.md) and [Unraid setup](../deploy/unraid/README.md) cover operation. Authenticated X collection is verified and enabled locally with the user's 1,000-post monthly cap. The Unraid package is tested locally; it has not been installed on the user's server. The complete document browser workflow passed in an isolated app, including real Codex generation, editing/restoration, exports, controlled failures, keyboard use and mobile checks. Optional WebMCP invocation remains unverified.
