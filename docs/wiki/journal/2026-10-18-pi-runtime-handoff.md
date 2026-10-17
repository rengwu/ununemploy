---
title: Package size and Mac-first Pi evaluation — 18 October 2026
section: Journal
updated: 2026-10-18
---
# Package size and Mac-first Pi evaluation — 18 October 2026

## User direction and status

The user wants a downloadable Windows release on GitHub. After reviewing the package size, they asked whether a lighter runtime such as Pi Durable could replace the bundled Codex executable. They then requested: “record this finding in the wiki, and commit and push. i'd like to first implement this on my mac machine”.

The accepted sequence is to preserve the Windows checkpoint and undertake the Pi implementation/evaluation on the user's Mac first. This handoff records research and measurements only: no Pi package has been installed, no authentication or runtime has been migrated, and no GitHub binary release has been published. The existing local builds still use official Codex. The initial recommendation is to evaluate `pi-ai` alone; choosing the full Pi Durable harness remains an implementation decision supported by evidence, not an already completed migration.

## Measured Windows package

On 18 October, a read-only recursive file-size inventory of `build/desktop/windows` counted **31,680 files totaling 1,051,478,141 bytes (1,002.8 MiB)**. This is the sum of unpacked file lengths, not compressed download size or filesystem allocation. The package is the [17 October installer checkpoint](../verification/runs/2026-10-17-windows-installer.md), whose [source manifest](../evidence/2026-10-17-windows-installer/source-manifest.json) records base revision `a7d9d6433a7f2db962be1f1a9aebfb9c19f20efd` and dirty-source fingerprint `8182adb21b6b3eb10820c2a06d26a8d2400f9c38dabbf292be707e0ecdd762a9`. These Windows measurements do not establish the size of a future Mac build.

| Package area | Files | Unpacked MiB | Purpose |
| --- | ---: | ---: | --- |
| `resources/codex` | 1 | 325.5 | Official model runtime executable |
| `resources/browsers` | 299 | 273.7 | Headless Chromium for cover-letter and legacy HTML PDF export |
| `resources/app` | 31,074 | 234.3 | Application, built frontend, generic geography and npm dependencies |
| `resources/bin` | 3 | 134.0 | Node 82.9 MiB, Tectonic 47.8 MiB, isolation helper 3.2 MiB |
| `resources/tex-cache` | 297 | 19.0 | Generic offline LaTeX assets |
| `ununemploy.exe` | 1 | 9.9 | Native Windows launcher |
| `resources/package-files.json` | 1 | 6.2 | Complete checksum inventory |
| Lock/build metadata and installer scripts | 4 | 0.3 | Package identity and installation |

Within `resources/app`, `node_modules` accounts for **229.6 MiB / 30,981 files**. The built frontend `dist` is only **3.3 MiB / 13 files**. `scripts/build-desktop-windows.ts` runs `npm ci --omit=dev`, but the root production dependency list includes frontend libraries already compiled by Vite. The installed package therefore retains full copies of those libraries alongside the compiled frontend.

Examples: `@phosphor-icons/react` is 31.5 MiB / 9,089 files; `pdfjs-dist` is 35.9 MiB; its native canvas package is 36.0 MiB; `@base-ui/react` is 9.2 MiB; and `react-dom` is 7.7 MiB. Source maps across application dependencies total 30.9 MiB; that figure overlaps the package sizes and must not be added again. The package also includes `tsx` and esbuild to execute TypeScript at runtime. A dependency split or compiled backend must be verified against actual server/worker imports and dynamic assets before pruning.

Replacing Codex would remove a **325.5 MiB component before adding replacement dependencies**. About 677.3 MiB of the current package remains. Pi does not replace Chromium, Node, Tectonic, the native wrapper or the frontend. Chromium removal requires a separate PDF-export change. Final Pi package size, compressed download size and installation speed are **unmeasured**; no size target is promised.

## Pi findings

Pi separates model access from durable orchestration:

- `@earendil-works/pi-ai` provides model calls, streaming, provider authentication and selective provider imports. Its OpenAI provider documents ChatGPT sign-in. [Pi AI documentation](https://github.com/earendil-works/pi/blob/main/packages/ai/README.md)
- `@earendil-works/pi-durable` adds persistent conversations, model/tool tasks and recovery, with Node SQLite and JSONL storage. It can run locally in the existing Node process; adopting it does not require Cloudflare or Rivet hosting. Upstream marks its API experimental and subject to change. [Pi Durable documentation](https://github.com/earendil-works/pi/blob/main/packages/durable/README.md)
- OpenAI's current documentation lists Pi among open-source Sign in with ChatGPT integrations and describes eligible ChatGPT plan usage for open-source clients. This establishes a documented integration route, not proof of this application's registration, exact model access or billing behavior. [Supported integrations](https://learn.chatgpt.com/docs/sign-in-with-chatgpt), [developer integration](https://developers.openai.com/siwc/token-sharing-open-source)

These sources were consulted on 18 October 2026; their main-branch APIs may change. Pin the actual package versions and record their provenance during implementation. Published package metadata retrieval did not complete during this assessment, so no installed dependency-size measurement was obtained.

## Proposed implementation on Mac

Start with a small compatibility implementation around `core/ai/codex.ts`'s existing inference interface. `core/assistant/service.ts`, `core/profile/chat.ts` and `core/ai/generate.ts` already coordinate bounded actions, chat/turn history, queues and saved versions. Replacing model transport with `pi-ai` first may avoid a second orchestration/state system. Adopt Pi Durable only if its checkpointed execution provides a concrete benefit and its state/replay behavior is deliberately integrated with those existing records.

The user's Mac-first direction permits evaluating a replacement for the earlier official-Codex-only architecture. It does not establish that Pi is already the supported runtime. During implementation, reconcile the runtime requirement in `AGENTS.md` and the architecture/feature documentation with the verified choice. Preserve ChatGPT subscription intent, `gpt-5.6-sol`, high reasoning, serialized model work, and explicit pauses for unavailable authentication, model access or allowance. Do not silently fall back to API-key billing or another model. Use the provider's documented authentication flow with application-owned credentials; do not copy or modify the existing Codex credential store as an assumed migration shortcut.

Preserve canonical SQLite facts, source attribution, queued drafts, document versions, manual edits, collection checkpoints and counters. Keep the existing constrained `core/assistant` actions and atomic save validation. Pi's generic coding tools, unrestricted shell/filesystem access, outreach, external notifications and application submission are outside the product scope. The local app still needs no application account; ChatGPT connection is for AI access.

Suggested Mac acceptance checks, all **unexecuted for Pi**:

1. Establish the current Mac baseline, including shared supervisor changes from the Windows port. Use isolated synthetic data before changing canonical appdata.
2. Verify fresh ChatGPT sign-in, persisted credentials after restart, cancellation and sign-out/error states without exposing tokens. Confirm the exact model/high reasoning and that no alternate billing path is used.
3. Exercise structured responses, schema rejection, queue serialization, unavailable allowance, cancellation and restart recovery; prevent duplicated document edits when work resumes.
4. Exercise attributable profile updates, an actual master LaTeX edit/preview, and saved cover-letter generation/rewrite. Check retained manual edits, histories and failure preservation through real UI entry points.
5. Build the Mac app with only required runtime dependencies; compare unpacked bytes, file count, compressed size and startup against the baseline. Check native lifecycle and PDF exports. Do not claim Windows readiness from a Mac pass.
6. Record versions, tested revision/fingerprint and outcomes in a new verification run. Carry the verified design back to Windows before its release checks.

## Windows release follow-up

The repository checkpoint makes code and this handoff available on the Mac; it is not a binary release. After the Mac work, remaining Windows release items include a versioned ZIP or installer with checksums and release notes; pinned runtime provenance and redistribution notices; a usable fresh sign-in path; clean-machine Windows/WebView2 and initial Jobs-route verification; installation/removal UX; and signing/distribution assessment. The current PowerShell installer requires an installed WebView2 runtime and has no conventional uninstaller. Existing [installer verification](../verification/runs/2026-10-17-windows-installer.md) remains scoped to its recorded build and scenarios.
