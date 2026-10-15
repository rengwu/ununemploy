---
title: Integration corrections and four additions — 8 October 2026
section: Journal
updated: 2026-10-08
---
# Integration corrections and four additions — 8 October 2026

The user authorized the [interviewed corrective design](2026-10-08-integration-design.md) and then explicitly excluded The Muse completely. The current scope is Working Nomads, WordPress Jobs, RemoteJobs.com and Dynamite Jobs; Reddit remains deferred. The Muse has no source entry, adapter, credential flow, setup state or pending development item. Historical research remains labelled as superseded scope.

The refactor uses two small shared decision boundaries: `core/job-quality.ts` for content identity and description/metadata precedence, and `core/boards/queue-state.ts` for queue transitions. Ordinary TypeScript values cross these boundaries. The collector and existing SQLite shell retain network requests, transactions and clock acquisition. No dependency or database table was introduced for this change; no event framework, policy registry or queue redesign was added.

The changes preserve structured hiring restrictions when visible text replaces JSON-LD text, avoid new versions for receipt-time changes, revalidate rediscovered HTTP removals without confusing them with employer expiry, reserve one overdue detail slot and continue queued work after discovery parsing failures. Full-detail metadata remains authoritative until a successful full refresh. The matching version advances so obvious contradictory hiring evidence is reassessed locally; independent citizenship/authorization restrictions remain in force.

Working Nomads has a single public JSON request. WordPress and RemoteJobs.com extend existing RSS normalization with conservative employer/work-arrangement handling. All three have a 24-hour minimum. Dynamite Jobs supplies category/identity patterns to the existing public-board collector, including its request budget and persisted detail queue. The Sources UI uses its existing Kumo controls and labels.

The [verification run](../verification/runs/2026-10-08T075217Z-integration-implementation.md) records 198 passing tests, production/package checks, 2,397 baseline/current cache comparisons and 14 bounded live configurations. Of the compared descriptions, 404 gained preserved applicant restrictions without any other parser change. Source controls were exercised through the browser Scan entry point. Initial test isolation accidentally triggered canonical reassessment and a worker lock shutdown; the harness was corrected, the app restarted and data retention checked. Details and limits are recorded in the run rather than hidden by its final pass.

The four source configurations are installed in canonical local appdata (57 → 61), and the native bundle built at `2026-10-08T07:52:17.090Z` is updated. [Retention evidence](../evidence/2026-10-08T075217Z-integration-implementation/retention.json) and the [installed build/health check](../evidence/2026-10-08T075217Z-integration-implementation/installed.json) confirm the result. Existing source preferences and personal content are preserved. Broad cache cleanup, historical version deduplication, queue schema changes and unrelated blocked-provider repairs remain deferred.

All four initial scheduled scans completed and showed Ready in the native app. A roughly 26-second job-list request exposed a large-inventory inbox responsiveness issue during import; the source page recovered. That measured limitation is retained as follow-up rather than claimed fixed by the bounded integration pass.
