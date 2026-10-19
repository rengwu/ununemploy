---
title: Pi AI compatibility checkpoint
section: Verification
updated: 2026-10-18
result: Untested
---
# Pi AI compatibility checkpoint

## Scope and identity

The [accepted scope](../../decisions/index.md#accepted-first-pass) selects `pi-ai` first, preserving existing Retry recovery. This is the compatibility gate before replacing [FEAT-desktop](../../features/desktop.md)'s Codex runtime and [assistant](../../features/assistant.md) inference. Pi Durable is deferred.

Dirty base `169dca657a18b142fbcfabba2e965d9358c972c6`, macOS arm64 / Node 22.19.0. `@earendil-works/pi-ai` is pinned to 1.3.0 in a separate `.local-data/pi-evaluation/` installation with install scripts disabled. [Source identity](../../evidence/2026-10-18-pi-compatibility/source-manifest.json), [offline checks](../../evidence/2026-10-18-pi-compatibility/offline-results.json), and [component size measurement](../../evidence/2026-10-18-pi-compatibility/size-results.json).

## Selected checks

| Scenario | Expected | Observed | Outcome |
| --- | --- | --- | --- |
| Exact model and reasoning | Preserve gpt-5.6-sol and high | Published catalog contains the exact model and high mapping | Passed |
| Subscription-only request contract | No ambient/API-key fallback; proper Responses request | Isolated provider has API-key auth removed and empty ambient auth context. Mocked request uses public Responses endpoint, exact model/high, stream true, store false, strict JSON schema and no tools | Passed |
| Unavailable allowance | Surface error without retry or alternate billing | Mocked 429 subscription-sharing usage error surfaced after one request | Passed |
| Selective packaging | Measure actual importable component | Full npm dependency files total 69,081,645 bytes / 11,922 files; OpenAI-only esbuild bundle is 992,611 bytes and imports with exact model catalog intact | Passed |
| Fresh account connection and available model | Use provider-managed ChatGPT sign-in without Codex credential reuse | The local connection attempt ended with a generic sign-in/inference failure and no saved Pi credentials. Account compatibility is still unknown; a fresh user connection is required | Untested |
| Real structured inference and credential reload | Finish one synthetic model response and reopen app-owned credentials | Depends on the new connection | Untested |
| Full app migration, restart behavior and exports | Preserve existing actions/history/manual edits and verify native package | Not implemented by this compatibility checkpoint; current installed app remains Codex | Untested |

## Reproduce and continue

```sh
npm install --prefix .local-data/pi-evaluation --ignore-scripts --save-exact @earendil-works/pi-ai@1.3.0
node scripts/verify-pi-compatibility.mjs
node scripts/verify-pi-compatibility.mjs --connect
```

The offline invocation makes no provider requests. `--connect` creates a loopback status page and uses Pi's provider-owned OAuth flow with a persisted installation UUID and application name. The user completes sign-in/consent in their browser. After connection, the check lists account models and sends one tiny synthetic strict-JSON request, consuming ChatGPT allowance. It never reads Codex auth or application SQLite data. It stores its own credentials in a private evaluation directory, never in wiki evidence, and reloads them to check persistence. This single-process evaluation store is not yet the production multi-process credential store. Provider login, account model lookup or structured-response failure must be resolved without changing model or billing silently.

The initial connection page is no longer active. No completed authentication or real inference was observed; the sanitized failure does not establish a model-access or runtime incompatibility. The installed app remains on its existing Codex runtime and authentication.

The [official account model/inference guide](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) requires checking the signed-in account catalog and consuming completed streamed inference. A static SDK catalog entry alone does not prove account access. The [OpenAI connection guide](https://developers.openai.com/siwc/token-sharing-open-source) describes the separate application connection and stable host identity. The component size measurement excludes the native host, Node, document runtimes, compiled app, credential handling and final packaging; it is not a native package savings claim.

Once live compatibility passes, implement the production auth store and Settings connection, replace the existing inference transport while preserving the common serialization lease and validated atomic application actions, then verify failure/cancellation/restart recovery and native document workflows before removing bundled Codex. No product runtime or credentials have been switched by this checkpoint.
