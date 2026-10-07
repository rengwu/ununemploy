---
title: Limitations and pending verification
section: Reference
updated: 2026-10-07
---
# Limitations and pending verification

- Server filtering uses a cached in-memory collection index, rebuilt after relevant writes and at most one minute later for time-based freshness. Memory and rebuild cost still grow with the collection; this is not indexed SQL search. The existing Vite large-bundle advisory remains.
- Base match ranking is deterministic and explainable; optional Jev assessments supplement it only when configured. Citizenship, sponsorship, remote-country restrictions, and research requirements are flagged for review. Unknown salary and eligibility remain visible.
- Organic posts may omit the full job description. Add the missing description before generating a useful draft.
- Collectors use supported APIs, feeds and bounded public-board HTML adapters. They do not bypass logins or anti-bot controls. Access failures and pending adapters are recorded in [source coverage](../reference/source-coverage.md).
- Completed Ashby, Greenhouse, and Lever snapshots mark missing listings closed while preserving saved jobs and CVs. Failed or partial scans do not close jobs. Organic posts do not establish whether a role remains open; check the posting before applying.
- PDF/Word layout was checked for the current master, a legacy resume and a generated cover letter; substantial content or template edits may change pagination.



## Pending integration and deployment checks

- Actual Unraid installation and native amd64 LaTeX compilation remain unverified. The host must support Landlock.
- Authenticated Web3.career collection and real TypeSafe/Jev inference remain unverified in the recorded results.
- Adzuna, Jooble and Careerjet need publisher credentials **and API adapter work**. Registering a source does not establish collection.
- Optional WebMCP registration and live invocation have not been verified in a supported browser.
- X authenticated retrieval has historical live verification. Budgeted recent search cannot guarantee exhaustive coverage; a historical successful run does not establish current credentials or provider availability.
- Legacy browser recipes that depend on named live postings can become stale as inventory changes. Use isolated fixtures where available and record missing live data as Untested.

See [verification history](../verification/history.md) for the exact historical claims and [new runs](../verification/index.md) for build-specific checks.
