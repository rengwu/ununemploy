---
title: AI runtime
section: Features
updated: 2026-10-21
---
# AI runtime

Feature ID: `FEAT-ai-runtime`

## Intent and accepted scope

Replace the large bundled Codex executable with pi-ai while preserving the ChatGPT subscription, `gpt-5.6-sol`, high reasoning, existing application actions, queues, evidence and versioned saves. The [accepted scope](../journal/2026-10-17-grill-98222632-c041-4b36-850a-7b00e43f80b5.md) selects pi-ai first. Pi Durable and automatic resumption remain deferred; interrupted work still uses explicit Retry.

## Connection and inference

Settings → AI offers Sign in with ChatGPT, Continue with ChatGPT, Cancel sign-in, Check connection and Sign out. The SDK owns PKCE, OAuth state checks, code exchange and refresh. Its loopback callback uses port 1455; a busy port produces an explicit error. Signing in on another device supports pasting the final redirect URL into the app. Sign-in expires after 15 minutes. No account tokens appear in UI/API responses or logs.

`core/ai/pi-credentials.ts` stores credentials in `JH_DATA_DIR/pi-auth/credentials.json` with private file permissions and atomic replacement. A stable host identifier is stored alongside it. SQLite leases serialize read-modify-write refresh and deletion across API/worker processes; reads reload the file to avoid stale tokens. SDK refresh results are persisted even if the initiating inference request is cancelled. Sign out removes only this app-owned connection. Existing Codex authentication is never imported, modified or removed. Personal-record ZIP backups omit credentials, and ZIP import preserves destination credentials.

On Windows, POSIX file modes do not protect credentials. Before accessing connection files, each process removes inherited/broad ACL entries from the Pi directory and existing credential/host-ID files, allowing only the current user, SYSTEM and Administrators. New files inherit that private directory ACL. Links are rejected and permission failures stop connection access. Regression tests cover a broadly readable parent, previously exposed files and concurrent processes.

`core/ai/pi.ts` registers only the OpenAI provider from pinned `@earendil-works/pi-ai@1.3.0`; ambient environment/API-key auth is disabled. Account model discovery checks the exact requested model. Requests use the public Responses endpoint, `store:false`, streaming transport, high reasoning and a strict JSON schema. The app waits for successful stream completion and selects final-answer text instead of concatenating commentary before parsing structured output. There are no provider tools, shell processes, filesystem tools or silent model/billing fallbacks. Application actions still execute through the existing validated assistant loop.

The existing shared inference lease serializes assistant and cover-letter model jobs, including across an old/new worker overlap during upgrade. Timeout is four minutes; cancellation or lease loss aborts the request. Automatic HTTP retries are disabled. Authentication, subscription allowance and model-access failures leave stored records intact and expose retryable errors. A completed response with unusable final JSON carries a distinct error type and its usage, allowing the assistant's bounded [response correction](assistant.md#boundaries-and-recovery). Cover-letter generation retains its existing failure handling. The app never accepts a partial stream as a completed answer or retries transport/authentication/allowance errors as response corrections.

Legacy `JH_CODEX_MODEL` and `JH_CODEX_REASONING_EFFORT` variable names remain compatible; their defaults remain the exact selected model/high reasoning. `JH_CODEX_HOME` and `JH_CODEX_BIN` no longer configure the runtime.

## Packaging

Source development installs pi-ai normally. Native builds bundle only `core/ai/pi-sdk.ts` and its selected provider/OAuth flow, then remove the full SDK dependency tree from the staged application. `scripts/package-pi.ts` explicitly includes the SDK's otherwise dynamically loaded Node OAuth implementation. Build metadata records the SDK version and bundled module hash. No Codex executable is packaged. The source dependency and bundled output remain pinned; regenerate the bundle when upgrading the SDK.

Mac build/install behavior is recorded in the [19 October run](../verification/runs/2026-10-19-pi-attachments.md). The [20 October Windows run](../verification/runs/2026-10-20-windows-pi.md) checks the same Pi module without `codex.exe`, Windows packaging/installation, private credential ACLs and bundled OAuth start/cancel. Completed Windows account sign-in and live inference remain unverified. Docker no longer installs the Codex CLI; its Pi connection flow and deployment need an Unraid rerun.

## Verification recipe

- `npx tsx --test tests/pi-runtime.test.ts tests/system.test.ts tests/assistant.test.ts`: subscription-only configuration, cross-process credential serialization, exact request contract, image payload, quota/cancel/busy paths, queued letters and version preservation.
- `node scripts/verify-pi-compatibility.mjs`: isolated SDK contract check. `--connect` is opt-in live sign-in and a synthetic structured response; it never reads Codex credentials.
- `JH_PI_VERIFY_CREDENTIALS=/private/path/credentials.json JH_PI_VERIFY_APP=build/desktop/ununemploy.app/Contents/Resources/app npx tsx scripts/verify-pi-app.ts`: explicit live packaged-runtime check, using a fresh app-owned token and synthetic PDF/image/profile data. The temporary database and token copy are removed. The bounded check refuses a token nearing refresh to avoid splitting rotating credentials across stores. No real candidate data is sent.
- `npm run desktop:build -- --reuse-runtimes`, `npm run desktop:test`: build the native app and exercise lifecycle checks. Installation and live UI checks additionally follow the [desktop contract](desktop.md).

The production mock tests verify error/request behavior without account inference. The live driver checks packaged OAuth start/cancel, model availability, PDF/image interpretation and an attributable profile action. Other model interpretations, plan-limit exhaustion and credential refresh against the real provider remain separate scenarios.

## Verification history

[Onboarding recovery — 21 October 2026](../verification/runs/2026-10-21-assistant-onboarding.md) covers repairable completed-output classification, usage retention and the unchanged quota/cancel boundaries with synthetic model responses.

[Pi compatibility checkpoint — 18 October](../verification/runs/2026-10-18-pi-compatibility.md) remains historical. The initial live-check parser used `contentText(answer)` instead of `contentText(answer.content)`, causing a local TypeError after successful inference; that check was repaired on 19 October.

[Pi runtime and assistant attachments — 19 October](../verification/runs/2026-10-19-pi-attachments.md) records the implementation, scoped results and platform limits.
