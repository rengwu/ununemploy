---
title: Large-inbox timeout fix and remote reconciliation
section: Verification
updated: 2026-10-18
result: Passed
---
# Large-inbox timeout fix and remote reconciliation

## Scope and build

Selected checks for [FEAT-job-inbox](../../features/job-inbox.md) and [FEAT-desktop](../../features/desktop.md). The reported native timeout came from rebuilding the full job snapshot: SQLite sorted large JSON documents without an ordering index, listing reads retained duplicate descriptions, and scanner writes between related requests could trigger repeated rebuilds. Bootstrap also scanned all job documents for cover-letter choices.

macOS arm64, Node 22.19.0. The final tested tree is dirty base `169dca657a18b142fbcfabba2e965d9358c972c6`, with the [source manifest](../../evidence/2026-10-18-inbox-performance/source-manifest.json) identifying every changed or new implementation/test file. The remote Windows checkpoint was fast-forwarded from `a7d9d64`; the local inbox fix was restored without conflicts. The remote portable fixture-path change and local regression tests are both present. No remote database migration collided with migration 12.

## Selected scenarios

| Scenario | Expected | Observed | Outcome |
| --- | --- | --- | --- |
| Full suite and production build | Preserve existing workflows and compile | 188 tests passed, one Windows-only installer test skipped; TypeScript/Vite passed with existing chunk-size warning | Passed |
| Query behavior | Indexed ordering, complete source evidence, correct refresh and document choices | Added fixtures check the query plan, original evidence retention, equivalent bootstrap choices, cross-connection writes, revision hints and minute expiry | Passed |
| Large-copy API | Complete each selected request within 10 seconds, below the unchanged 15-second UI deadline | 37,610 jobs; cold jobs 9,985 ms, rebuilds 6,889–7,729 ms, bootstrap 4,457 ms, same-refresh jobs 245 ms, locations 8 ms and detail 2 ms | Passed |
| Result equivalence | Preserve existing job payloads, locations, filtering and grouping | Pre-pull comparison at identical time: all full job payloads, location options and 11 filter/page results matched; cold snapshot 6,656 → 4,257 ms | Passed |
| Real browser deadline | Failure ends the loading label and Retry recovers | Synthetic request held beyond 15 seconds; Jobs unavailable, timeout, recovery, empty results and revision headers verified | Passed |
| Inbox interactions | Preserve deliberate selection and saved workflow | Seen, keyboard, mobile, filter/reload, mutation failure/retry and Saved selection checks passed after reconciliation | Passed |
| macOS platform regression | Shared Windows changes retain Mac lifecycle | Go race tests passed; packaged startup with minimal PATH, single instance, normal termination, stable origin, forced exit, recovery and SQLite/counter retention passed | Passed |
| Installation | Replace the bundle without modifying personal data/configuration | Database and desktop configuration hashes unchanged before relaunch; selected built/installed files matched and strict deep signature verification passed | Passed |
| Installed native inbox | Start actual services and show jobs without timeout | Reconciled native build showed 28,701 results from 37,748 stored jobs, no loading/timeout message, and healthy API | Passed |
| Windows execution, Linux, very large imported inventories | Establish additional platform/scale behavior | Not exercised on this Mac; retain the separate Windows evidence and outstanding distribution limits | Untested |

## Evidence and interpretation

[API timings](../../evidence/2026-10-18-inbox-performance/api-results.json), [result comparison](../../evidence/2026-10-18-inbox-performance/comparison.json), [browser results](../../evidence/2026-10-18-inbox-performance/loading-results.json), [synthetic timeout screenshot](../../evidence/2026-10-18-inbox-performance/timeout.png), [Seen checks](../../evidence/2026-10-18-inbox-performance/seen-results.json), [packaged lifecycle](../../evidence/2026-10-18-inbox-performance/desktop-lifecycle.json), [installation checks](../../evidence/2026-10-18-inbox-performance/install-results.json), and [native startup](../../evidence/2026-10-18-inbox-performance/native-startup.json) contain sanitized observations.

The identical-input before/after comparison was performed before the remote pull; the remote change did not alter the query implementation. The final combined-tree API run was repeated under concurrent machine workload, so its timings should not be treated as a controlled before/after comparison. The cold request approached the stricter 10-second test budget. Snapshot construction remains synchronous and proportional to inventory size; these checks do not establish performance on slower computers or indefinitely larger collections. No timeout was increased.

## Isolation and cleanup

Large-data checks used SQLite backup copies opened from a read-only source; mutations happened only in disposable copies, without a worker, scans or inference. Browser and lifecycle fixtures used fictional facts with collection and inference disabled. Test processes and temporary databases were removed. Raw logs, private comparison hashes and the original user backups remain outside the wiki. The installed app uses the existing canonical appdata and resumes its configured normal worker; authentication and source configuration were retained.
