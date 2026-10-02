# ununemploy

Local job discovery, profile building, cover letters, and CV management. React, TypeScript, Vite, Cloudflare Kumo, Fastify, SQLite, and an internal worker. The official Codex CLI guides profile conversations and generates private drafts with `gpt-5.6-sol` and high reasoning through a ChatGPT subscription.

## Run locally

Requires Node 22.19+ and the official Codex CLI signed in with ChatGPT.

```sh
npm ci
test -f .env || cp .env.example .env
npx playwright install chromium
npm run dev
```

Open **http://127.0.0.1:5173**. The current workspace uses API port **4317** in `.env` because port 3000 was already occupied. Fresh installations default to API port 3000; change `JH_PORT` if needed. Vite proxies API requests to that port. No application login, hosted domain, or publishing service.

The development command starts the API, frontend, and worker. All persistent application data lives in `.local-data/` by default. The server must remain awake for scans to run; Unraid runs the same worker continuously.

## Workflow

- **Jobs:** search, filter, compare match reasons, review the description, save or dismiss. Saved jobs queue a tailored cover letter. Manually adding a posting or editing a short description also works.
- **Saved:** keep notes, open the cover letter, or manually record that you applied elsewhere.
- **Assistant:** the button in the top-right page header opens a sliding chat overlay on any page. Search collected jobs, research supplied public references, update profile facts, edit the actual LaTeX or HTML CV, and rewrite saved cover letters. Conversation and unsent text stay with you across pages; Escape hides the pane. **New chat** clears the conversation, remembered context and unsent draft while keeping saved facts and documents. Wait for a reply or stop it first.
- **User profile:** review the canonical facts as read-only Markdown and use **Edit with assistant** to change them. New installations open here with guided onboarding; discovery waits for the essential details. Previous profile versions can be restored.
- **CV:** edit the structured master facts and presentation, or open previously generated resumes marked “saved resume”.
- **Saved → job → Cover letter:** generate and edit the letter in its job detail, as JSON, with editable HTML/CSS and a preview. Save creates a version; restore appends a new version. PDF uses your template; DOCX uses a separate editable Word layout.
- **Sources:** add company boards, public job boards, HN, feeds, or X searches. Public boards also have direct site links and manual job entry. Review scan status, request counts, errors, and next scan times.
- **Settings:** collection schedule, Codex state, generation pause, X credentials/budget, and the Web3.career API token.

No application submission, employer upload, form filling, messaging, posting, replying, following, or reacting is implemented. External posting links open normally for you to use yourself. Notifications stay in the application.

### Dashboard loading

Jobs and Saved filter and paginate on the server, with 75 summaries per page. Full descriptions and match evidence load when the detail pane opens; document data loads when its editor opens. The eight-second status check uses ETags, so unchanged responses have no body. Collection changes refresh the visible results, and polling pauses while the browser tab is hidden. Failed or invalid responses show a Retry action without discarding existing data or edits.

The API now returns `{items, total, page, pageSize, totalPages, revision}` from `GET /api/jobs`, with zero-based pages and a maximum page size of 100. Use `GET /api/jobs/:id` for full details, `/api/job-locations` for filter options, and `/api/master` for the profile/template. `/api/bootstrap` contains status, counts and compact document choices, not the complete collection.

### Location filter

In **Jobs** or **Saved**, open **Any location**. The menu groups countries under geographic areas, with **APAC**, **EMEA** and **Americas** available as broad filters. **Southeast Asia** and **East Asia** come first, with Malaysia first within SEA and individual countries/areas selectable. Search also finds cities and original source labels; these do not crowd the default country list. Multiple selections match any selected location and combine with the other job filters. **Clear locations** resets the filter. Selections persist across page switches and reloads in the same browser tab.

Country filters include recognized cities using a bundled, server-only [GeoNames](https://www.geonames.org/) lookup. Regions include their member countries and narrower regions: Kuala Lumpur → Malaysia → Southeast Asia → APAC. Source text is preserved. Ambiguous codes/names such as bare CA, AZ or London are not assigned a country without sufficient context. **Unresolved** includes locations that could not be assigned a country/region; their original labels remain searchable. See [dataset attribution, coverage and exact regional definitions](data/geography/README.md).

**Worldwide** requires an explicit global statement. **Unspecified** includes missing and remote-only location fields. Select these alongside a country when desired. A country filter does not include a posting that only says APAC or Worldwide: those statements do not establish that every country is eligible. Region buckets organize browsing and do not determine work authorization.

The detail header labels explicit candidate restrictions as **Hiring locations** for Himalayas, Remotive, Jobicy, and We Work Remotely; other source fields are labeled **Location**. Filtering uses these listed fields, not incidental headquarters mentions in descriptions, and does not determine visa eligibility. Organic posts have free-form location headers: their dropdown values are limited to place names also found in structured boards (plus explicit Worldwide); unrecognized headers fall under Unspecified. Original posting text is preserved.

### Seen posts

Opening a job by clicking its title, using the keyboard, or choosing **View posting** records its first `seenAt` timestamp locally. A **Seen** label appears in the row. **Seen and unseen / Unseen / Seen** filters work in Jobs and Saved, independently of saved/applied status. The selected row has a blue background, edge marker and emphasized title in light and dark modes.

The default first-row preview does not count as a deliberate open. Under Unseen, opening a result removes it from the list while keeping its detail pane open. Seen state survives rescans and restarts and applies to that individual posting, not every inferred duplicate. Historical opens were not recorded, so tracking begins with this feature; older views cannot be reconstructed. This action never saves the job or queues a cover letter.

### Matching and listing quality

The Match tab separates role fit from eligibility, shows score components, and distinguishes professional technology experience from project evidence. Record work authorization and relocation preferences in **User profile**. Clear citizenship/authorization conflicts are hidden by **No known conflict**; uncertain sponsorship stays visible. **Any eligibility** shows all outcomes.

**Group duplicates** combines likely copies while retaining every original job, note, and CV. Use **Show duplicates** or **Other listings** to inspect originals. Saved keeps every saved/applied record. Complete source descriptions and manual edits take precedence over feed excerpts, and changed source payloads have local version history.

Old or unchecked feed entries become **Stale**, rather than looking newly active on every scan. Use **Include stale and closed** to see them. Explicit employer closure takes priority over feed copies. See [matching rules, freshness thresholds, limitations and evaluation](docs/MATCHING_AND_LISTING_QUALITY.md).

### Existing installations

The app keeps its existing `job-hunter.db` database filename, `JH_*` environment settings, and browser storage keys so saved jobs, CVs, credentials, and preferences continue to work after the rename. Use `ununemploy:local` for new Docker builds and keep the existing appdata mount when updating an installation.

## Sources

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

Fresh installations include **57 source configurations**, including 28 boards from the latest expansion. Existing Wellfound and Welcome to the Jungle entries are upgraded in place. This is a configuration count, not 57 distinct working job boards. See [current results and access limitations](docs/COVERAGE_EXPANSION.md). X still requires local credentials and a configured budget.

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

### Manual sources

**Sources → Wellfound / Welcome to the Jungle → Open site** opens the board for you. **Add job** accepts the role, employer, posting URL, location, and description while keeping that board’s attribution. Adding a job does not generate a draft; saving it in Jobs does. These entries cannot be scheduled or scanned. No supported automated reading route was established for either board.

### X setup

1. Sign in to the [X developer console](https://console.x.com/), create an app, and obtain its **app-only bearer token**. This is the credential for reading public data; user access tokens are unnecessary. [Official access guide](https://docs.x.com/x-api/getting-started/getting-access).
2. In **Settings → X**, enter the bearer token and choose **Save token**. It is stored locally under the data directory with mode 0600 and is never returned by the API. Alternatively set `JH_X_BEARER_TOKEN` in `.env` or the Unraid template. A dashboard-saved token takes precedence.
3. Set a monthly post limit of at least 10, enable X, and save settings. The default is zero and disabled, so no paid requests begin before configuration. X API usage is separate from the Codex subscription; manage API credits and spending controls in the X console.
4. Open **Sources → X · Engineering** to edit the starter search, add more searches, or scan. Searches support the [official recent-search syntax](https://docs.x.com/x-api/posts/search-recent-posts), including `from:account` and `-is:retweet`.

The initial X scan looks back 24 hours. Later scans use fixed time windows and resume pagination without advancing the completed checkpoint early. The API only exposes recent history; after an extended outage, older posts may be unavailable. Post IDs remain strings. Results deduplicate across searches. Retrieval volume is reserved before requests; ambiguous failures retain reservations. The counter is conservative and is **not a currency spending guarantee**. The cap is shared by all X searches and resets by UTC calendar month. Sources have separate daily scan caps.

X batches divide the remaining monthly allowance across the remaining time and enabled searches. Because the API requires at least 10 posts per request, small budgets extend the interval between scheduled X scans beyond four hours. The next scan time is persisted. Manual scans share the monthly cap but can run before the scheduled time. High-volume searches may outpace the chosen budget.

X is a required integration, implemented with credential entry, saved queries, retrieval limits, and fixture coverage. Authenticated retrieval was verified locally on 15 September 2026. The user selected 1,000 posts per UTC calendar month, and scheduled X collection is enabled in the local workspace. The first two requests consumed 20 post reads and yielded 17 unique records. Fresh installations require their own locally configured credentials and settings.

## Optional Jev assessment

**Settings → Jev** accepts an optional TypeSafe API key for job fit, geography, work arrangement, sponsorship and eligibility assessment. Saving a key enables bounded background assessment (default 100 requests per UTC day). **Match → Assess with Jev** prioritizes a job. Confident, evidenced results update matching/filtering while preserving original source fields; uncertain eligibility remains visible for review. Pause or remove the key to restore the original behavior. No key means no Jev requests.

Jev receives relevant career/eligibility facts and posting text through TypeSafe's separately billed API. Keys, caches and counters persist locally. Cover-letter generation remains on Codex. See [setup, data sent, eligibility rules and verification limits](docs/JEV.md). Authenticated Jev inference has not yet been verified.

## Master CV and cover-letter generation

### LaTeX editor

Open **CV → LaTeX** to edit `Resume.tex` beside its actual PDF. **Recompile** (`Cmd/Ctrl+Enter`) updates the preview; **Save** (`Cmd/Ctrl+S`) creates a persistent source version. The version selector and **Restore version** retain previous edits. **Download PDF** exports the displayed build and is disabled when the source has changed; **Download .tex** always preserves the current source, including an unfinished edit. Errors link to source lines and leave the last good preview visible. Compilation uses no AI.

LaTeX has independent version history. Editing it never updates career facts or cover-letter evidence. **CV → Data and HTML** retains the structured profile, HTML/CSS editor, Word exports and legacy saved resumes. On first use, an existing `resume/output/pdf/john-goh-rengwu-resume.tex` under appdata is imported once. Otherwise a source document is initialized from the current master facts using the sb2nov-style template. Later edits are never overwritten by seed files or profile changes.

The Docker image includes Tectonic, the required fonts/packages, and a Linux Landlock sandbox. Compiles run offline, with shell escape disabled, a 30-second timeout, bounded output and a temporary work directory. They cannot read appdata or Codex authentication. The Linux host must support Landlock (kernel 5.13+ with Landlock enabled); compilation fails closed if it does not. No privileged container or Docker socket is required.

For macOS development:

```sh
brew install tectonic
npx tsx scripts/setup-latex.ts
```

The setup command downloads packages using a generic template without candidate data. Runtime compilation uses only the cache and the macOS sandbox, which blocks user/appdata/project and other temporary files and networking. Optional overrides are `JH_TECTONIC_BIN`, `JH_LATEX_CACHE` and, on Linux, `JH_LATEX_SANDBOX`. For Linux development, compile `deploy/latex/sandbox.c` with `gcc -O2 -Wall -Wextra` to the configured sandbox path, use a writable package-cache path during setup, and then run the same setup script. Only the bundled package set is supported initially; add trusted package requirements to `core/latex/starter.tex` and rerun setup/rebuild the image to expand it.

Migration 006 stores LaTeX source versions and successful PDF builds in SQLite. They are included in the existing database backup. Unsaved preview builds are bounded; saved versions keep their compiled PDFs. Appdata and all existing documents are preserved across updates.

The versioned SQLite profile is the canonical facts record. **User profile** renders it directly and uses the bundled onboarding skill to guide chat edits. Discovery requires a name, current location, target roles, useful career/education/project background, and work-arrangement preferences. Contact details, citizenship and visa answers are optional; unknown eligibility remains unknown. Both manual and scheduled scans enforce this gate, including after a restore removes essential information. Scheduling still respects Settings.

Chat history, queued turns, quoted change evidence and document versions persist locally. The app-wide assistant reads records through explicit application actions, stages changes, validates them and commits coordinated edits atomically with version checks. Replies link to the saved records and report their actual versions and preview results. Stop discards uncommitted work; authentication failures, interrupted requests and conflicts support retry. A failed PDF compilation is reported explicitly and retains the prior preview while preserving the newly versioned source. Editors refresh after successful assistant changes unless they contain unsaved text or are showing a historical version.

Profile facts and document wording remain distinct. A request to update a project in the CV can update the facts and actual LaTeX document together. A profile-only correction updates master facts and the data/HTML representation; it does not silently overwrite independent LaTeX wording. A wording-only letter or CV edit leaves the underlying facts alone. Profile updates refresh deterministic matching and invalidate relevant Jev assessments. Review resulting facts and documents: schema and quote checks cannot prove every interpretation is correct. See [assistant capabilities and architecture](docs/ASSISTANT.md).

Fresh databases start empty. `JH_PROFILE_SEED=/absolute/path/to/profile.json` explicitly imports a structured profile only on first initialization (optional local evidence). `data/candidate-profile.json` and `docs/MASTER_CV.md` retain the original local evidence; neither overwrites an existing profile. See [the profile guide](core/profile/skills/build-user-profile/SKILL.md).

Saving snapshots the job description, master profile revision, and cover-letter template. Generation is serialized and produces first-person paragraphs, targeting 250–350 words, with relevant examples from the confirmed profile. The application supplies the name, contact details, company, role, salutation, and signature; the generated prose cites internal evidence IDs and is checked for unknown references and unsupported numeric claims. These checks do not prove semantic truth: review the draft before using it. Unconfirmed details appear in review notes, outside the letter.

Cover letters have their own storage and version history. Migration 004 converts unfinished resume tasks to cover-letter tasks, pausing interrupted runs for retry. Completed resumes and manual edits stay intact under CV. Existing saved jobs with only a resume show **Generate cover letter**; the update does not bulk-generate new documents. New saved jobs generate letters automatically. The master CV remains independently editable and exportable.

Codex has no shell, browser, connector, plugin, or messaging capabilities in generation runs. Job text is treated as untrusted source material. Authentication, model-access, allowance, or validation failures keep the saved job and expose a retryable task. There is no model or paid API fallback. Retry paused tasks after restoring access or allowance.

## Checks

```sh
npm run check
npm test
npm run build
```

`npx tsx scripts/verify-assistant-ui.ts` checks the overlay, onboarding, jobs, document edits, preview refresh, unsaved text and desktop/mobile behavior with isolated synthetic data and simulated inference; PDF compilation is real. The old `verify-profile-ui.ts` command delegates to this workflow. `npx tsx scripts/verify-assistant-runtime.ts` performs an opt-in real Codex profile/LaTeX edit and PDF compilation with synthetic facts; it consumes subscription allowance. `verify-profile-runtime.ts` retains the earlier profile-only runtime check.

Tests use an isolated temporary database and mock source responses/Codex process output. `scripts/verify-generation.ts` performs a real subscription inference against an already-collected Linear posting without saving it to your job list. It consumes subscription allowance. `scripts/verify-exports.ts` retains checks for master and legacy resume exports. `scripts/verify-container.ts` exercises the amd64 image, PDF export, volume ownership, backup, and restart persistence with an isolated Docker volume, fixture data, and scheduling disabled.

`npx tsx scripts/verify-dashboard.ts` checks pagination, filtering, polling, retry behavior, unsaved notes and mobile layout against the local running app without saving jobs. `npx tsx scripts/verify-cv-workflow.ts` now runs the cover-letter save/edit/restore/download browser flow in an isolated temporary app with simulated generation. Add `--real-generation` to use the configured Codex subscription; this consumes allowance. Both modes passed, including one real generation, controlled failure/retry checks, and rendered PDF/Word inspection. See [verification](docs/VERIFICATION.md) for scope and artifacts. The optional WebMCP surface has not been validated in a supported browser context.

## Unraid and backups

See [Unraid setup](deploy/unraid/README.md) and [XML template](deploy/unraid/ununemploy.xml). The image is built locally and is not published to a registry.

```sh
npx tsx scripts/backup.ts
```

This uses SQLite's online backup API and writes a consistent snapshot under the data directory's `backups/` folder. To restore, stop both API and worker, preserve the existing appdata folder, replace `job-hunter.db` with the chosen backup, and remove stale `job-hunter.db-wal` / `job-hunter.db-shm` files before restarting. Back up `secrets/` and `codex/` separately if you want credentials restored too; they are not in database backups.

## Current limits

- Server filtering uses a cached in-memory collection index, rebuilt after relevant writes and at most one minute later for time-based freshness. Memory and rebuild cost still grow with the collection; this is not indexed SQL search. The existing Vite large-bundle advisory remains.
- Base match ranking is deterministic and explainable; optional Jev assessments supplement it only when configured. Citizenship, sponsorship, remote-country restrictions, and research requirements are flagged for review. Unknown salary and eligibility remain visible.
- Organic posts may omit the full job description. Add the missing description before generating a useful draft.
- The collector does not bypass logins, anti-bot controls, or crawl arbitrary job-board HTML. Add supported APIs/feeds instead.
- Completed Ashby, Greenhouse, and Lever snapshots mark missing listings closed while preserving saved jobs and CVs. Failed or partial scans do not close jobs. Organic posts do not establish whether a role remains open; check the posting before applying.
- PDF/Word layout was checked for the current master, a legacy resume and a generated cover letter; substantial content or template edits may change pagination.

## Public source and local data

The repository excludes local candidate evidence, app databases, generated documents and credentials. Automated tests use the fictional profile in `tests/fixtures/profile.json`; it is not a default profile or real candidate evidence. Run `npm test` and `npm run build` to check a source checkout.
