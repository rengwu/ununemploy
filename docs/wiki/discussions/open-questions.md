---
title: Open questions and follow-up
section: Discussions
updated: 2026-10-07
---
# Open questions and follow-up

This page distinguishes unfinished verification and implementation from decisions. No new product direction is proposed by the documentation migration.

| Item | Current state | Next evidence needed |
| --- | --- | --- |
| Actual Unraid installation | Unverified; local container checks exist | Run on the intended server, verify persistence and native Landlock compilation; [guide](../guides/unraid.md). |
| Web3.career authentication | Implemented, authenticated collection unverified | Configure a local token and record a bounded live scan. |
| Jev provider access and quality | Simulated tests and UI checks exist | A configured account and selected real inference cases; [Jev](../features/jev.md). |
| Adzuna / Jooble / Careerjet | Catalog entries only, pending credentials and adapter work | Provider configuration plus actual adapters and bounded verification; [coverage](../reference/source-coverage.md). |
| Optional WebMCP | No supported browser verification recorded | Registration and real tool invocation in a supported context. |
| Collection scaling and bundle size | Existing performance limits | Measured evidence at larger inventories before choosing further changes. |
| Legacy live browser recipes | Some depend on named real postings | Verify inventory prerequisites or create isolated fixtures before claiming a new pass. |

See [limitations](../reference/limitations.md) and [verification history](../verification/history.md). Updates should preserve dated findings and link resolved items to their new decision or run.
