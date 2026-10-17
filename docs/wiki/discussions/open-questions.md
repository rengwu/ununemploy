---
title: Open questions and follow-up
section: Discussions
updated: 2026-10-18
---
# Open questions and follow-up

This page distinguishes unfinished verification and implementation from decisions. No new product direction is proposed by the documentation migration.

| Item | Current state | Next evidence needed |
| --- | --- | --- |
| Mac-first Pi runtime and package size | User wants implementation first on Mac. Windows package measured 1,002.8 MiB unpacked; Codex is 325.5 MiB, with separate Chromium and npm dependency overhead. `pi-ai` first is recommended; Pi Durable is experimental and not yet selected | Verify ChatGPT sign-in and exact-model compatibility, preserve existing actions/state, measure an actual minimal package and run Mac acceptance checks before Windows release work. [Findings and handoff](../journal/2026-10-18-pi-runtime-handoff.md). |
| Actual Unraid installation | Unverified; local container checks exist | Run on the intended server, verify persistence and native Landlock compilation; [guide](../guides/unraid.md). |
| Windows and Linux native releases | Windows 11 x64 local build now includes WebView2, lifecycle handling, bundled runtimes, isolated compilation and a per-user installer with package integrity and replacement checks. Linux remains an assessed future option | Clean-machine installation/WebView2 provisioning, fresh interactive ChatGPT login, signing/distribution and a macOS regression run remain. See the [Windows run](../verification/runs/2026-10-17-windows-port.md) and [installer follow-up](../verification/runs/2026-10-17-windows-installer.md). |
| Web3.career authentication | Implemented, authenticated collection unverified | Configure a local token and record a bounded live scan. |
| Adzuna / Jooble / Careerjet | Deferred backlog; removed from setup and hidden from Sources, with stored records retained | A working adapter and explicit scope would be needed before offering them again; [coverage](../reference/source-coverage.md). |
| Broader integration cleanup | Deferred from the first corrective pass | Queue storage redesign, broad policy consolidation, cache retention and unrelated provider-specific repairs need a concrete benefit before expansion; [design rationale](../journal/2026-10-08-integration-design.md). |
| Reddit and TechReferrals | Reddit explicitly deferred by the user on 8 October; TechReferrals remains a conditional candidate | No Reddit implementation now. TechReferrals still needs readable access and lead-classification evidence; [evaluation](../journal/2026-10-08-source-evaluation.md). |
| Collection scaling | A native job-list request around 29,000 records took 25.6 seconds and briefly timed out during the new feed import; all scans completed and Sources recovered | The [16 October native rebuild](../verification/runs/2026-10-16-lean-native-install.md) again showed a timeout, followed by rows after retry with a remaining refresh warning. Profile inbox querying/grouping and ingestion on an isolated copy of a large collection; compare before/after timings before expanding the refactor. [Observed result](../verification/runs/2026-10-08T075217Z-integration-implementation.md). |
| Legacy live browser recipes | Some depend on named real postings | Verify inventory prerequisites or create isolated fixtures before claiming a new pass. |

The four additions and bounded corrective refactor are complete; [verification](../verification/runs/2026-10-08T075217Z-integration-implementation.md). The Muse is completely out of scope, including registration, adapter work, credentials and setup. It is not an awaiting-setup item.

See [limitations](../reference/limitations.md) and [verification history](../verification/history.md). Updates should preserve dated findings and link resolved items to their new decision or run.
