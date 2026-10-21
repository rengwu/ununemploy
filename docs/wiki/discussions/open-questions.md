---
title: Open questions and follow-up
section: Discussions
updated: 2026-10-20
---
# Open questions and follow-up

This page distinguishes unfinished verification and implementation from decisions. No new product direction is proposed by the documentation migration.

| Item | Current state | Next evidence needed |
| --- | --- | --- |
| Pi runtime and package size | Mac implementation and live exact-model compatibility are verified. The Windows Pi package is now 678.0 MiB unpacked, down from 1,002.8 MiB; build/install, private ACLs and offline native checks are recorded in the [20 October run](../verification/runs/2026-10-20-windows-pi.md). Pi Durable remains deferred | Complete fresh Windows ChatGPT sign-in and live inference before claiming authenticated Windows compatibility. See [AI runtime](../features/ai-runtime.md) and the historical [Mac-first handoff](../journal/2026-10-18-pi-runtime-handoff.md). |
| Actual Unraid installation | Unverified; local container checks exist | Run on the intended server, verify persistence and native Landlock compilation; [guide](../guides/unraid.md). |
| Windows and Linux native releases | Windows 11 x64 local build now includes WebView2, lifecycle handling, bundled runtimes, isolated compilation and a per-user installer with package integrity and replacement checks. Linux remains an assessed future option | Clean-machine installation/WebView2 provisioning, fresh interactive ChatGPT login, signing/distribution and a macOS regression run remain. See the [Windows run](../verification/runs/2026-10-17-windows-port.md) and [installer follow-up](../verification/runs/2026-10-17-windows-installer.md). |
| Web3.career authentication | Implemented, authenticated collection unverified | Configure a local token and record a bounded live scan. |
| Adzuna / Jooble / Careerjet | Deferred backlog; removed from setup and hidden from Sources, with stored records retained | A working adapter and explicit scope would be needed before offering them again; [coverage](../reference/source-coverage.md). |
| Broader integration cleanup | Deferred from the first corrective pass | Queue storage redesign, broad policy consolidation, cache retention and unrelated provider-specific repairs need a concrete benefit before expansion; [design rationale](../journal/2026-10-08-integration-design.md). |
| Reddit and TechReferrals | Reddit explicitly deferred by the user on 8 October; TechReferrals remains a conditional candidate | No Reddit implementation now. TechReferrals still needs readable access and lead-classification evidence; [evaluation](../journal/2026-10-08-source-evaluation.md). |
| Collection scaling | The [18 October fix](../verification/runs/2026-10-18-inbox-performance.md) removes temporary full-document sorting and repeated snapshot rebuilds during one refresh; 37,610-job checks and native startup passed | Cold snapshots still process the full collection synchronously. Reassess if larger inventories or slower machines approach the unchanged 15-second deadline; large imported-observation collections remain unmeasured. Earlier timeout reports remain historical evidence. |
| Legacy live browser recipes | Some depend on named real postings | Verify inventory prerequisites or create isolated fixtures before claiming a new pass. |

The four additions and bounded corrective refactor are complete; [verification](../verification/runs/2026-10-08T075217Z-integration-implementation.md). The Muse is completely out of scope, including registration, adapter work, credentials and setup. It is not an awaiting-setup item.

See [limitations](../reference/limitations.md) and [verification history](../verification/history.md). Updates should preserve dated findings and link resolved items to their new decision or run.
