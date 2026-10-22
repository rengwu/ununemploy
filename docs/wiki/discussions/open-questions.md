---
title: Open questions and follow-up
section: Discussions
updated: 2026-10-23
---
# Open questions and follow-up

This page distinguishes unfinished verification and implementation from decisions. No new product direction is proposed by the documentation migration.

| Item | Current state | Next evidence needed |
| --- | --- | --- |
| Fresh Windows résumé onboarding | User reported attachment-reading, special-phrase demands, rejected profile edits and empty-action failures on another clean installation. Contradictory evidence guidance, misleading path errors, invented file-only instructions and missing bounded response correction are repaired locally; see the [21 October run](../verification/runs/2026-10-21-assistant-onboarding.md) | Verify a complete live-model onboarding conversation on a clean Windows installation. The original PDF and remote-machine action trace were not available; extraction quality and the exact rejected path remain unverified. |
| Pi runtime and package size | Mac implementation and live exact-model compatibility are verified. The compact Windows package has compiled runtime code and system WebView2 PDF export; the measured local setup is about 46 MiB downloaded and 209 MiB unpacked. See the [23 October delivery run](../verification/runs/2026-10-23-windows-delivery.md). Pi Durable remains deferred | Complete fresh Windows ChatGPT sign-in and live inference before claiming authenticated Windows compatibility. See [AI runtime](../features/ai-runtime.md) and the historical [Mac-first handoff](../journal/2026-10-18-pi-runtime-handoff.md). |
| Actual Unraid installation | Unverified; local container checks exist | Run on the intended server, verify persistence and native Landlock compilation; [guide](../guides/unraid.md). |
| Windows and Linux native releases | Windows now produces a single compiled per-user setup executable, a conventional uninstaller and versioned release automation, with tested integrity, replacement and retention. Linux remains an assessed future option | Clean-machine installation/WebView2 provisioning, fresh interactive ChatGPT login, signing and a macOS regression run remain. See the [Windows run](../verification/runs/2026-10-17-windows-port.md) and [installer follow-up](../verification/runs/2026-10-17-windows-installer.md). |
| Web3.career authentication | Implemented, authenticated collection unverified | Configure a local token and record a bounded live scan. |
| Adzuna / Jooble / Careerjet | Deferred backlog; removed from setup and hidden from Sources, with stored records retained | A working adapter and explicit scope would be needed before offering them again; [coverage](../reference/source-coverage.md). |
| Broader integration cleanup | Deferred from the first corrective pass | Queue storage redesign, broad policy consolidation, cache retention and unrelated provider-specific repairs need a concrete benefit before expansion; [design rationale](../journal/2026-10-08-integration-design.md). |
| Reddit and TechReferrals | Reddit explicitly deferred by the user on 8 October; TechReferrals remains a conditional candidate | No Reddit implementation now. TechReferrals still needs readable access and lead-classification evidence; [evaluation](../journal/2026-10-08-source-evaluation.md). |
| Collection scaling | The [18 October fix](../verification/runs/2026-10-18-inbox-performance.md) removes temporary full-document sorting and repeated snapshot rebuilds during one refresh; 37,610-job checks and native startup passed | Cold snapshots still process the full collection synchronously. Reassess if larger inventories or slower machines approach the unchanged 15-second deadline; large imported-observation collections remain unmeasured. Earlier timeout reports remain historical evidence. |
| Legacy live browser recipes | Some depend on named real postings | Verify inventory prerequisites or create isolated fixtures before claiming a new pass. |

The four additions and bounded corrective refactor are complete; [verification](../verification/runs/2026-10-08T075217Z-integration-implementation.md). The Muse is completely out of scope, including registration, adapter work, credentials and setup. It is not an awaiting-setup item.

See [limitations](../reference/limitations.md) and [verification history](../verification/history.md). Updates should preserve dated findings and link resolved items to their new decision or run.
