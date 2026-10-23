---
title: Assistant onboarding recovery
section: Verification
updated: 2026-10-23
result: Untested
---
# Assistant onboarding recovery

## Scope and build

Repair the reported fresh-Windows résumé onboarding failures in [FEAT-assistant](../../features/assistant.md), [FEAT-profile](../../features/profile.md) and [FEAT-ai-runtime](../../features/ai-runtime.md). Selected scenarios cover real PDF upload/extraction, ordinary ownership confirmation, attributed edits, rejected paths, malformed/empty responses, atomic saves, cancellation and subscription failure. Live-model interpretation and the original PDF are selected follow-ups but unavailable; the aggregate is **Untested**, despite the passing local checks below.

Windows x64, bundled Node 22.23.3, pinned pi-ai 1.3.0 and bundled Playwright Chromium headless shell. Base revision `159bce03bd1b8f0f68c91a2b22e6b9d4135ccf64`, dirty implementation identified by the [source manifest](../../evidence/2026-10-21-assistant-onboarding/source-manifest.json). Manifest SHA-256: `73877b9621466dc3b330582a13202143353a5e02f9adb10fe100e0cf61ab9940`. Tests and browser driver use separate temporary databases, empty profiles and fictional candidate data. No worker/scheduler or external discovery is started. Browser traffic is restricted to its ephemeral loopback server.

## Findings and changes

The embedded profile skill required quotes from the latest user message, contradicting the app's existing support for attachment and earlier-message evidence. The generic “unsupported profile change” error actually identified a disallowed JSON Pointer path, not insufficient user authorization; the screenshots' assistant explanation was therefore not a reliable diagnosis. The original rejected path is unknown because the other machine's action trace was not supplied.

The action loop immediately failed on an empty intermediate response, invalid step fields or an attempted finish with unresolved edit failures. It now provides bounded correction feedback within the same turn. Completed model responses with invalid final JSON carry a distinct error type and usage; subscription, authentication, transport and cancellation errors remain outside correction. At most two correction rounds supplement the ten normal rounds. No partial save is allowed.

File-only sends also inserted a synthetic read-only request. They now use “Attached files.” while retaining idempotent retries of the old label. The onboarding skill distinguishes ownership confirmation, original factual evidence and explicit read-only requests. Source registration remains application-owned; validation errors identify how the assistant should repair its own paths.

## Results

| Scenario | Expected outcome | Observed outcome | Result |
| --- | --- | --- | --- |
| Baseline regression | Reported bad-path/empty-response behavior can be exercised | Initial five-test run failed four new recovery expectations; PDF evidence was present, rejected-path finish failed, and invalid/empty steps stopped immediately. Subscription pause passed | Passed |
| PDF and natural follow-up | Attachment evidence remains available after a short confirmation and supports atomic profile edits | Real PDF upload/extraction through the API, “yeah that's my profile”, rejected source-registry path, correction and one saved revision with original quotes/attachment attribution passed | Passed |
| Response recovery | Correct malformed steps/output without a new user message or duplicate action | Invalid step fields, empty intermediate action, completed malformed JSON/commentary-only classification, correction progress and usage retention passed | Passed |
| Recovery boundaries | Bounded failure never saves partial edits or claims empty success | Repeated failure, contradictory done-plus-calls, empty final reply, cancellation, quota pause, unknown capabilities, version conflicts and unresolved edits passed | Passed |
| File-only retries | New label is neutral; previous sends remain idempotent | Neutral-label API assertion and an old-label replay both passed | Passed |
| Browser onboarding | Actual initial UI, picker, Send, natural follow-up and automatic correction reach saved facts without user Retry | Synthetic PDF journey passed with simulated inference, saved-version receipt, reload and visible canonical profile; no browser errors | Passed |
| Focused regression/build | Changed behavior preserves existing assistant/profile/attachment/runtime contracts | 46 focused tests passed; the four runtime tests passed again after completing typed fixtures. TypeScript and Vite production build passed; existing large-chunk advisory remains | Passed |
| Live-model clean-install onboarding | Real model imports a résumé and continues naturally on the affected Windows installation | No app-owned Pi credential was available in this workspace or standard native appdata. Scripted responses verify execution, not model interpretation | Untested |
| Original PDF quality | Determine whether the reported file extracts completely and in useful reading order | Only screenshots were supplied. Original bytes and extracted text were unavailable. Synthetic text PDFs pass; no extractor change or original-file quality claim is made | Untested |

Evidence: [browser results](../../evidence/2026-10-21-assistant-onboarding/browser.json), [sanitized check summary](../../evidence/2026-10-21-assistant-onboarding/checks.json). Raw local logs and synthetic screenshots remain under `.local-data/verification/assistant-onboarding/`; private screenshots from the report were not copied into the wiki. Two initial browser-driver attempts failed on test selectors (the empty-profile assistant is already open; the rendered name includes its field label). Corrected selectors passed. Initial type checks identified incomplete test fixtures; these were corrected before the final build.

## Commands and limits

Using `build/desktop/windows/resources/bin/node.exe` as `node` on this host:

```sh
node --import tsx --test tests/assistant-onboarding.test.ts tests/assistant.test.ts tests/profile-chat.test.ts tests/attachments.test.ts tests/pi-runtime.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node --import tsx scripts/verify-assistant-onboarding.ts
node ../jstack/skills/verify-change/scripts/check-reports.mjs docs/wiki
node docs/wiki/_build.mjs
node docs/wiki/_build.mjs --check
```

The browser driver uses `PLAYWRIGHT_BROWSERS_PATH=build/desktop/windows/resources/browsers`. It closes its own browser/server/database and removes its temporary fixtures. Real user appdata and credentials were not modified. No new installer, native installation, clean-machine distribution, commit, push or deployment was performed. The existing installed package therefore does not contain this source fix. A live end-to-end conversation and original-document extraction check remain necessary before claiming the reported experience fully resolved.

## Delivery follow-up - 23 October 2026

The preceding delivery status describes the original source-only verification. These repairs now ship in [v0.2.0-beta.7](https://github.com/rengwu/ununemploy/releases/tag/v0.2.0-beta.7), clean revision `125446e992552a774ec95718690a8b3bf8a3d865`. The [Windows delivery run](2026-10-23-windows-delivery.md) records the compact installer, hosted installed-application checks, anonymous public download and later PDF process-containment repair. Original-file extraction quality and live-model interpretation remain untested; publication does not change those results.
