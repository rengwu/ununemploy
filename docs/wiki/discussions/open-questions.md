---
title: Open questions and follow-up
section: Discussions
updated: 2026-10-17
---
# Open questions and follow-up

This page distinguishes unfinished verification and implementation from decisions. No new product direction is proposed by the documentation migration.

| Item | Current state | Next evidence needed |
| --- | --- | --- |
| Actual Unraid installation | Unverified; local container checks exist | Run on the intended server, verify persistence and native Landlock compilation; [guide](../guides/unraid.md). |
| Windows and Linux native releases | User plans to continue Windows porting on a Windows machine; no native port implemented or verified here. Linux remains an assessed future option | Follow the [Windows handoff](../journal/2026-10-16-desktop-portability.md#windows-handoff-17-october-2026): confirm target architecture, establish the launcher/lifecycle milestone, then integrate runtimes, compilation isolation and packaging. |
| Web3.career authentication | Implemented, authenticated collection unverified | Configure a local token and record a bounded live scan. |
| Adzuna / Jooble / Careerjet | Deferred backlog; removed from setup and hidden from Sources, with stored records retained | A working adapter and explicit scope would be needed before offering them again; [coverage](../reference/source-coverage.md). |
| Broader integration cleanup | Deferred from the first corrective pass | Queue storage redesign, broad policy consolidation, cache retention and unrelated provider-specific repairs need a concrete benefit before expansion; [design rationale](../journal/2026-10-08-integration-design.md). |
| Reddit and TechReferrals | Reddit explicitly deferred by the user on 8 October; TechReferrals remains a conditional candidate | No Reddit implementation now. TechReferrals still needs readable access and lead-classification evidence; [evaluation](../journal/2026-10-08-source-evaluation.md). |
| Collection scaling and bundle size | A native job-list request around 29,000 records took 25.6 seconds and briefly timed out during the new feed import; all scans completed and Sources recovered | The [16 October native rebuild](../verification/runs/2026-10-16-lean-native-install.md) again showed a timeout, followed by rows after retry with a remaining refresh warning. Profile inbox querying/grouping and ingestion on an isolated copy of a large collection; compare before/after timings before expanding the refactor. [Observed result](../verification/runs/2026-10-08T075217Z-integration-implementation.md). |
| Legacy live browser recipes | Some depend on named real postings | Verify inventory prerequisites or create isolated fixtures before claiming a new pass. |

The four additions and bounded corrective refactor are complete; [verification](../verification/runs/2026-10-08T075217Z-integration-implementation.md). The Muse is completely out of scope, including registration, adapter work, credentials and setup. It is not an awaiting-setup item.

See [limitations](../reference/limitations.md) and [verification history](../verification/history.md). Updates should preserve dated findings and link resolved items to their new decision or run.
