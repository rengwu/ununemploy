---
title: Windows local port verification
section: Verification
updated: 2026-10-17
result: Passed
---
# Windows local port verification

## Scope and build

Verify [FEAT-desktop](../../features/desktop.md#windows-11-x64), Windows [LaTeX CV](../../features/master-cv.md), PDF export and backup behavior after the user resumed the port. This is a local Windows 11 x64 result, not clean-machine release certification or a macOS regression claim.

Base revision `a7d9d6433a7f2db962be1f1a9aebfb9c19f20efd`, with uncommitted changes. The [source/runtime manifest](../../evidence/2026-10-17-windows-port/source-manifest.json) identifies the dirty tree and final built/installed executables. Windows 11 x64 build 26200, Node 22.23.3, Go 1.26.5, GCC, installed WebView2, and bundled official Codex CLI 0.163.0. The built package is unsigned. The final npm development-command quote correction was synchronized into both fixture packages after the final full build; no executable/frontend changes followed that build.

Native tests seed synthetic temporary SQLite data, disable collection/scheduling/inference, then launch the actual packaged API/worker and WebView2. A separately selected Codex check uses the existing official ChatGPT login and sends only a synthetic boolean-response prompt. Installer checks target a workspace-local directory with no Start-menu shortcut. No canonical personal database is migrated or edited.

## Selected outcomes

| Scenario | Expected | Observed | Outcome |
| --- | --- | --- | --- |
| TypeScript, frontend and package | Build Windows package with correct runtimes | Final TypeScript/Vite build and offline generic compiler setup completed; existing Vite chunk-size advisory remains | Passed |
| Node regression suite | Preserve existing application behavior on Windows | 184 tests: 183 passed, one Homebrew-only scenario skipped, zero failed; real compiler/PDF tests enabled | Passed |
| Windows Go race suite | Bound lifecycle, origin and compiler behavior | All seven tests passed with `go test -race -v ./...` | Passed |
| Startup, save and persistence | Start real API/worker; retain manual fixture records | Installed executable became healthy; actual add/save APIs queued a cover letter and retained notes; restart retained profile, saved status, origin and counter; SQLite integrity OK | Passed |
| Native UI and unsaved edits | Render Jobs/CV without macOS inset; Cancel Quit retains edits | Actual WebView2 displayed the controls and synthetic content; cancelling native Quit kept edited source, which then saved | Passed |
| CV and native PDF download | Offline compile, selectable preview, Save, native Save As | Bundled AppContainer compiler produced the PDF; its text rendered in WebView2; native Save As saved a valid PDF at the verified fixture path | Passed |
| Cover-letter PDF and ZIP restore | Use bundled Chromium; restore personal records without settings/counter loss | Synthetic letter PDF had a valid PDF header; ZIP import restored notes changed after export and retained destination counters/settings | Passed |
| Close, duplicate launch, Quit and crash | Hide/reopen same instance, keep origin/data, reap owned processes | Close hid the window while health stayed OK; duplicate reopened the existing service; native Quit and forced launcher death reaped the observed tree; restart succeeded | Passed |
| Compiler security boundary | Deny private reads/writes, original-cache reads, copied-cache writes, network and child creation; kill compiler after broker death | Actual AppContainer probe denied all six operations; broker termination reaped the compiler; offline starter/diagnostic tests passed | Passed |
| Official Codex | Preserve official auth, exact model and reasoning; structured inference works | Bundled executable reported ChatGPT login; `gpt-5.6-sol` high returned the expected object with no tool operation | Passed |
| Installation/update | Stage replacement, retain separate data and refuse a running destination | First install and staged replacement succeeded; obsolete fixture package file removed, executable hash matched, separate fixture-data sentinel unchanged; installer rejected replacing the running installed app | Passed |

## Evidence and prior attempts

The [sanitized results](../../evidence/2026-10-17-windows-port/results.json) summarize completed checks. Runtime hashes and source paths contain no credentials or candidate facts. Actual Jobs and selectable CV viewport captures were inspected locally. Generated PDFs, screenshots and raw Node/Go/native logs remain in `.local-data/verification/windows/`, outside the wiki.

The [earlier paused checkpoint](2026-10-17-windows-checkpoint.md) preserves the initial Failed result. Resumed attempts exposed driver and platform issues before the passing checks: ordinary Playwright screenshots stalled; direct viewport capture worked. CDP attachment overrode download behavior until `noDefaults:true`; the modern Save dialog required its filename Edit control, checked before Save. Tectonic initialization needed redirected Windows directories and work-directory rename permission. A misleading Fontconfig diagnostic was removed using a private generic configuration. The Node suite initially failed on Unix fixture assumptions and a missing browser payload; it was rerun with Windows-compatible fixtures and the bundled runtimes. These failed attempts are not included as passing outcomes.

## Limits and cleanup

Clean-machine Windows installation, automatic WebView2 provisioning, a fresh interactive signed-out login, signed distribution, ARM64/other Windows versions and macOS runtime regression are **Untested** and outside this selected local run. Existing provider/live collection, large-inbox performance and actual Unraid deployment are unchanged. The Codex check establishes access at its recorded time, not future allowance or general model-output quality.

Native drivers terminate their owned fixture launchers/descendants and remove temporary databases. The workspace-local installed package and generic build/download caches remain for review. Personal appdata and existing authentication remain outside the package. No deployment, public post, employer contact or application action occurred. No independent second-agent review was performed.
