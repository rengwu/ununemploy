---
title: Assistant citations and public research
section: Verification
updated: 2026-10-19
result: Passed
---
# Assistant citations and public research

## Scope and build

Repair of [FEAT-assistant](../../features/assistant.md): existing replies displayed raw attachment IDs and the exact-URL reference policy forced the user to paste known GitHub contribution URLs. Read-only answers also received a redundant save footer.

macOS arm64, Node 22.19.0, Chromium and native WKWebView. Dirty base `169dca657a18b142fbcfabba2e965d9358c972c6`; [source manifest](../../evidence/2026-10-19-assistant-references/source-manifest.json) identifies the tested source snapshot, including pre-existing uncommitted Pi/inbox/timezone work. Isolated fixtures use synthetic candidate data; live retrieval uses public GitHub pages and no credentials or inference. Installed data stays outside the bundle.

## Results

| Scenario | Expected and observed | Outcome |
| --- | --- | --- |
| Attachment citations | Stored reply IDs resolve to safe filename links; bracket/ampersand filename remains literal; content endpoint returns matching image media type and bytes; reload retains link | Passed |
| Missing files and code examples | Unknown ID shows unavailable text; inline-code citation remains literal | Passed |
| Composer regression | Picker, image paste, draft reload, removal, image-only send, interrupted-send retry, mobile focus, history and New chat pass without browser errors | Passed |
| Public contribution research | Derives author-filtered commits and PR search from supplied repository/user-mentioned account; reads a commit detail without another user URL | Passed |
| Reference boundaries | Rejects unrelated repositories, unknown authors, arbitrary query fields, private file schemes and embedded credentials; concrete same-origin returned links extend access; off-origin links do not | Passed |
| Save messaging | Read-only turns have no automatic save footer; repeated old footers collapse at render time; actual edit receipts remain covered | Passed |
| Native installation | Three existing citations now display PDF filename links alongside the original upload link; no raw IDs remain. Database, settings and both auth stores unchanged during installation; installed files match build and strict/deep signature validation passes | Passed |
| Checks | 23 assistant/attachment tests pass, TypeScript and production/native builds pass | Passed |

Evidence: [native/preservation checks](../../evidence/2026-10-19-assistant-references/native.json), [browser results](../../evidence/2026-10-19-assistant-references/browser.json), [desktop](../../evidence/2026-10-19-assistant-references/desktop.png), [mobile](../../evidence/2026-10-19-assistant-references/mobile.png), [live public retrieval](../../evidence/2026-10-19-assistant-references/public-reads.json).

Commands: `npm run build`, `npx tsx --test tests/assistant.test.ts tests/attachments.test.ts`, `npx tsx scripts/verify-assistant-attachments.ts`, `npx tsx scripts/verify-assistant-references.ts REPOSITORY_URL AUTHOR`, and `npm run desktop:build -- --reuse-runtimes`.

## Findings and limits

The first build attempt exposed a missing required `dirty` field in the new test fixture; this was corrected. A UI run started against the previous frontend while that build had failed and timed out at the new citation assertion. The corrected production build and subsequent browser run passed; the timeout does not establish a failure in the new renderer.

This scope checks actual public HTTP retrieval and the action policy, with simulated model replies for browser/turn tests. A new live model research conversation is not claimed. GitHub lists return at most 30 records and reference text at most 24,000 characters; this is not an exhaustive contribution audit. Windows/Linux and off-origin crawling were not selected. Existing conversation text is rendered differently without rewriting stored history. Raw candidate data, credentials and local logs are excluded from evidence. No commit or push was requested.
