---
title: Jev accounting investigation — 8 October 2026
section: Verification
updated: 2026-10-08
result: Untested
---
# Jev accounting investigation — 8 October 2026

## Scope

[FEAT-jev](../../features/jev.md): investigate a reported balance depletion through read-only local records, source inspection, current official provider documentation and isolated mocked checks. Selected scenarios cover request limits, cache reuse, worker serialization, failure accounting and automatic backlog selection. No product changes, paid inference, provider contact or live configuration changes were performed.

## Build and environment

- Revision: `4ec343f72bb38c1839cc7dd67c94dd7eee08d078`, dirty workspace with unrelated concurrent UI/documentation work. The selected Jev source was unchanged relative to HEAD. The [source manifest](../../evidence/2026-10-07T180900Z-jev-accounting/source-manifest.json) fingerprints the relevant source, fixtures and dependencies rather than claiming unrelated changes were verified.
- macOS, Node v22.19.0. `tests/jev.test.ts` uses a temporary database, fictional candidate fixture and mocked provider. A separate isolated mock diagnostic exercised the two accounting gaps. Its temporary database was removed after execution.
- Existing local databases were opened read-only. Private account observations and incident details remain in `.local-data/verification/jev-usage-2026-10-08/`, outside the shareable wiki. Provider-account billing was not independently reconciled.

## Results

| Scenario | Expected outcome | Observed outcome | Result | Evidence |
| --- | --- | --- | --- | --- |
| Existing Jev regression suite | No-key behavior, projection, cache, limits, failure blocking, retry delay and worker serialization remain enforced | 17 tests passed with simulated HTTP responses | Passed | [Sanitized summary](../../evidence/2026-10-07T180900Z-jev-accounting/checks.json); `tests/jev.test.ts` |
| Automatic backlog selection | Establish whether saving a key requires explicit per-job queuing | Fictional unqueued jobs were assessed after configuring a fake key | Passed | [Mock diagnostic](../../evidence/2026-10-07T180900Z-jev-accounting/checks.json); `core/jev/service.ts` |
| Token/currency ceiling | Determine whether reported usage stops requests before the request cap | Another mocked request occurred after 100 million reported input tokens while below the two-request cap; no token/currency ceiling exists | Passed | [Mock diagnostic](../../evidence/2026-10-07T180900Z-jev-accounting/checks.json); `core/jev/service.ts` |
| Invalid-answer usage accounting | Determine whether a response's valid usage survives invalid answers | The mock's 123,456 input tokens were omitted; the attempt reservation remained and the runtime blocked | Passed | [Mock diagnostic](../../evidence/2026-10-07T180900Z-jev-accounting/checks.json); `core/jev/assessment.ts` and `core/jev/service.ts` |
| Explain the reported account debit | Reconcile local attempts and usage with provider-account billing | Aggregate local records and account totals differ; a per-key/time or request-level billing trace is unavailable | Untested | Private local incident record; [provider pricing](https://docs.typesafe.ai/models) |

Passed diagnostic rows mean the stated behavior was established, not that the uncovered gaps are desirable or fixed. Aggregate result is Untested because the reported debit's cause remains unresolved.

## Limits and follow-up

**Later update, 8 October 2026:** the user said the account was probably used elsewhere, withdrew the investigation request, and requested temporary Jev disablement. The account discrepancy remains a historical observation; it is not evidence that this app caused the account's entire spend. Follow the [current Jev decision](../../features/jev.md) rather than continuing paid investigation.

The regression suite uses simulated usage and cannot certify provider billing. Current source and preserved local counters cannot prove every action taken by historical builds or other installations. The schema does not retain immutable attempt records, raw requests or provider request IDs. Current-input prompt reconstruction cannot substitute for historical payloads.

Historical completed assessments were observed locally; that establishes persisted prior results, not a new live inference check or an independent assessment-quality evaluation. [TypeSafe's batching documentation](https://docs.typesafe.ai/cookbooks/parallel_questions) says a batched call shares its state cost. Do not infer that each question multiplies the full input charge without provider evidence.

Next evidence needed: provider per-key/time usage or billing traces matched against local attempt windows. Suggested hardening, not implemented or newly accepted requirements: a durable request ledger, usage accounting before semantic validation, token/cost reservations, a separately enabled backlog mode and less duplicated evidence input.
