---
title: Pi runtime and assistant attachments
section: Verification
updated: 2026-10-19
result: Passed
---
# Pi runtime and assistant attachments

## Scope and build

Mac-first implementation of [FEAT-ai-runtime](../../features/ai-runtime.md), [FEAT-assistant](../../features/assistant.md), and the affected [desktop](../../features/desktop.md), [cover-letter](../../features/cover-letters.md) and [backup](../../features/backups.md) boundaries. The accepted Pi-only scope preserves explicit Retry recovery; Pi Durable is deferred. The user additionally requested local-file reading and screenshot paste.

Environment: macOS arm64, Node 22.19.0, pinned pi-ai 1.3.0, Chromium fixtures and native WKWebView. Dirty base `169dca657a18b142fbcfabba2e965d9358c972c6`; the [source manifest](../../evidence/2026-10-19-pi-attachments/source-manifest.json) identifies the verification-close source snapshot. Earlier inbox/timezone changes remain in the working tree. Native installation was checked against the built runtime, attachment routes and frontend files; code signature passed strict/deep validation.

## Results

| Selected scenario | Expected and observed | Outcome |
| --- | --- | --- |
| Real subscription compatibility | User completed fresh app-owned ChatGPT sign-in. Exact gpt-5.6-sol/high, account catalog, structured response and credential reload succeeded; existing Codex credentials were untouched | Passed |
| Packaged inference and actions | OpenAI-only packaged module starts/cancels OAuth, checks account access, reads synthetic PDF text and screenshot tokens, updates only the requested profile field and retains attributed evidence/version receipts | Passed |
| Response phases | Live testing exposed commentary and final-answer JSON being concatenated. Adapter now selects the explicit final-answer phase; regression rejects commentary-only output and malformed final JSON | Passed |
| Credential and failure boundaries | Cross-process serialized private credential writes, no ambient API-key billing, exact request/schema/image payload, no automatic quota retry, cancellation and shared-inference contention checks pass | Passed |
| Connection API | Isolated Start/Cancel preserves the existing synthetic token; late callback is rejected; Sign out removes only app-owned credentials and preserves profile revision | Passed |
| Attachment backend | PDF extraction, invalid/oversized files, literal local paths, remote/DNS-host rejection, credential/symlink exclusion, idempotent send and retry, follow-up retention and New chat cleanup pass | Passed |
| Composer workflow | Actual file picker, pasted image event, preview, draft reload, removal, image-only send, failed-send retry, history, New chat and mobile focus behavior pass with simulated inference and no browser errors | Passed |
| Native workflow | Installed app reopens its inbox, displays ready/gpt-5.6-sol/high in Settings, uploads a synthetic image through the native picker, enables Send, and removes it successfully without sending a message | Passed |
| Preservation and package | Database/configuration bytes unchanged during installation; existing Codex auth unchanged; profile/job/document/chat record counts unchanged after launch; synthetic native attachment removed | Passed |
| Checks | TypeScript/Vite production build, 204 Node tests passed with one Windows-only skip, one additional isolated auth-route test passed, and Go race tests passed | Passed |

Evidence: [live packaged checks](../../evidence/2026-10-19-pi-attachments/live.json), [browser checks](../../evidence/2026-10-19-pi-attachments/browser.json), [desktop](../../evidence/2026-10-19-pi-attachments/desktop.png), [mobile](../../evidence/2026-10-19-pi-attachments/mobile.png), [native/preservation/package checks](../../evidence/2026-10-19-pi-attachments/native.json), [test summary](../../evidence/2026-10-19-pi-attachments/checks.json).

## Findings repaired during verification

The isolated compatibility prototype incorrectly passed the whole response to `contentText`; it requires the content array. That caused a local TypeError after successful inference. Production testing then found a distinct response-phase issue: some successful responses repeat JSON in commentary and final-answer messages. Concatenating both caused JSON parsing to fail, safely rejecting the turn without committing staged edits. The final adapter parses only the final-answer message when phase metadata is present; a regression reproduces the observed response shape. The final packaged live scenario passed after this repair.

The initial live driver also needed corrections to its provenance-table query and an overly literal screenshot-text assertion (the model correctly returned the tokens separately in Markdown). These were verification-helper failures. Final checks use the actual evidence document and assert both tokens independently.

## Package measurement

The previous installed app occupied 1,039,716 KiB; the updated installed app occupied 763,616 KiB at the recorded check, a reduction of 276,100 KiB (about 270 MiB, 26.6%). The removed Codex runtime alone occupied 325,236 KiB. The selected minified Pi provider/OAuth bundle is 383,195 bytes, with dependency license notices included separately. Remaining size includes Chromium, Tectonic/TeX assets, Node and application dependencies; Pi's full dependency tree and the Codex executable are absent from the native package.

## Limits and cleanup

This Passed result applies to the selected Mac scenarios. Windows-native packaging, installer and credential ACL behavior, Docker/Unraid deployment, a real provider token refresh, actual subscription exhaustion and hardware clipboard paste in WKWebView were not selected as verified outcomes. Windows source/installer expectations were updated for Pi and require a Windows-machine rerun. Browser paste uses an image-bearing clipboard event on the actual composer; the native test separately exercises the real macOS picker. No release signing/notarization or Pi Durable adoption is claimed.

PDFs require extractable text; scanned PDF pages can be attached as images. Recent attachment context is bounded as specified in the feature record. No model has unrestricted filesystem or external-write tools. Synthetic browser/server/databases were removed; private logs and connection files remain outside the wiki. The approved Pi credential was moved from the isolated evaluation directory into canonical appdata, avoiding a second rotating credential store. The installed app is left open on Jobs. No commit or push was requested or performed.
