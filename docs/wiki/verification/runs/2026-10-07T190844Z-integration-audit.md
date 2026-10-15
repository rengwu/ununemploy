---
title: Integration audit — 8 October 2026
section: Verification
updated: 2026-10-08
result: Failed
---
# Integration audit — 8 October 2026

## Scope and build

[FEAT-discovery](../../features/discovery.md): existing collection, normalization, queue behavior and persistence, before the five authorized additions. See the [analysis and recommendations](../../journal/2026-10-08-integration-audit.md). Aggregate **Failed** reflects four reproduced correctness gaps; it does not mean that ordinary scans or the existing test suite failed.

**Later requirement clarification, 8 October:** the [user's design decisions](../../journal/2026-10-08-integration-design.md) retain detail-page metadata until refresh. The listing/detail merge row below tested the audit's earlier newest-card expectation, which is now superseded. Its historical observation/result is preserved; new verification must assert the accepted precedence. No code was fixed by that clarification, and the other three failing expectations remain unresolved.

Revision `4ec343f72bb38c1839cc7dd67c94dd7eee08d078`, pre-existing dirty working tree. Selected source/test fingerprint `718bb55088e5f6d9641c4917a079857907077cedcdf593eb788acbef6281e779`; [manifest](../../evidence/2026-10-07T190844Z-integration-audit/source-manifest.json). macOS, Node v22.19.0. No application code changed during this audit.

Canonical appdata was inspected through read-only SQLite connections, without importing the application database module. Tests and live scans used disposable databases and the repository's synthetic profile fixture. Live verification called the real `scan()` entry point, including HTTP, parsers and persistence, without starting a worker or invoking inference. Temporary databases were closed and deleted. Public cache bodies and raw logs remain outside the shareable wiki; evidence contains aggregate counts and synthetic reproductions only.

## Results

| Scenario | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| Existing focused regression | Scanning, budgets, persistence, geography, description quality and disabled Jev invariants pass | 70 tests passed; zero failed or skipped | Passed | [Checks and exact command](../../evidence/2026-10-07T190844Z-integration-audit/checks.json) |
| Type checking | Current TypeScript compiles without errors | `npm run check` exited 0 | Passed | [Checks](../../evidence/2026-10-07T190844Z-integration-audit/checks.json) |
| Representative live scan paths | Selected public providers fetch and persist usable identities within budgets | Ten configurations, 12 requests, 716 stored records, zero invalid identity/description-type records; 695 full descriptions. Lever stopped partial with its checkpoint retained | Passed | [Live results](../../evidence/2026-10-07T190844Z-integration-audit/live-scan.json) |
| Content version stability | A new retrieval time alone does not create a content change | Identical listing content yielded `updated=1` and two versions | Failed | [Synthetic results](../../evidence/2026-10-07T190844Z-integration-audit/reproductions.json) |
| Listing/detail merge | New title/salary can update while a previous full description survives | Old title and salary retained with full text | Failed | [Synthetic results](../../evidence/2026-10-07T190844Z-integration-audit/reproductions.json) |
| Rediscovered closed URL | Eligible for bounded revalidation, without immediately declaring it open | State remained closed; URL excluded from due queue | Failed | [Synthetic results](../../evidence/2026-10-07T190844Z-integration-audit/reproductions.json) |
| Hiring restriction preservation | Visible text replacement retains separate structured applicant restrictions | US restriction disappeared; Malaysian office and full-description label remained | Failed | [Synthetic results](../../evidence/2026-10-07T190844Z-integration-audit/reproductions.json) |
| Cache replay inventory | Enumerate accepted/rejected pages without changing live state | 114 listing responses: 110 accepted, 4 rejected. 2,212 detail responses: 2,025 full, 3 excerpts, 184 rejected. Replay covers 22 board identities | Passed | [Inventory](../../evidence/2026-10-07T190844Z-integration-audit/inventory.json), [rejection diagnosis](../../evidence/2026-10-07T190844Z-integration-audit/cache-diagnosis.json) |
| Unreadable discovery shell | Observe whether queued detail processing is independent | Discovery exception stopped the pass before any queued detail request; pending item retained | Passed | [Characterization result](../../evidence/2026-10-07T190844Z-integration-audit/reproductions.json) |
| All-provider current availability and field accuracy | Establish each configured provider's present-day behavior | Representative live paths only; cached rejections are not adjudicated as recoverable vacancies | Untested | [Scope and limits](#limits) |

Cache replay's Passed result means enumeration completed; it does not certify each parser response or each board. Read-only inventory also measured 7,644 historical versions differing only by nested retrieval timestamp and about 633 MB of cached response bodies. No history was deduplicated or removed.

## Reproduction

Existing suite command is in [checks.json](../../evidence/2026-10-07T190844Z-integration-audit/checks.json). Audit helpers are preserved as reviewed source attachments: [synthetic reproduction](../../evidence/2026-10-07T190844Z-integration-audit/reproduce.ts.txt), [bounded live driver](../../evidence/2026-10-07T190844Z-integration-audit/live-scan.ts.txt), [read-only inventory](../../evidence/2026-10-07T190844Z-integration-audit/inventory.ts.txt), and [cache diagnosis](../../evidence/2026-10-07T190844Z-integration-audit/diagnose-cache.ts.txt). Their original local paths are `.local-data/verification/integration-audit/*.ts`; run with `npx tsx <path>` from the repository root. Restoring an attachment to that location without its `.txt` suffix preserves relative imports. Live runs consume public request allowance; inventory drivers depend on available local cache and are not portable fixtures.

The initial typecheck output redirect raced temporary-directory creation and was rerun successfully. Cache-diagnosis helper development encountered an unmatched brace, corrected before the recorded result. Neither failure was an application result. The reproduction driver reports assertions as JSON so all four cases can be inspected in one run; its process exit code is not a passing application verdict.

## Limits

No new authenticated X, Web3 or model requests; no Reddit support; no new source installation; no refactor or parser fix; no deployment or application UI interaction. Other RSS feeds, Remotive, Jobicy, Arbeitnow, monthly HN and every public board were not freshly scanned in this run. Fixture coverage and historical observations remain distinct from new live checks. The ten live scans were intentionally small; they do not prove full pagination, semantic correctness of every field, continuing provider access, or Unraid behavior. All four reproduced expectations remain failing on the tested code and need separate post-fix verification.
