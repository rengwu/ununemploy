---
title: Windows local port — 17 October 2026
section: Journal
updated: 2026-10-17
---
# Windows local port — 17 October 2026

The user resumed the [paused checkpoint](2026-10-17-windows-checkpoint.md) with “you may continue”. The sibling jstack checkout is present. Its shared contract and plan, feature-map, verify-change and wiki workflows were applied. This continuation implements the [Windows handoff](2026-10-16-desktop-portability.md#windows-handoff-17-october-2026); the [desktop specification](../features/desktop.md#windows-11-x64) is the current contract.

## Implemented scope

Windows 11 x64 retains React/Node and Go. The host uses native Win32 controls and the Wails WebView2 binding, with small reviewed COM adapters where generated string/callback bindings do not match the SDK ABI. The supervisor separates macOS socket/flock/process-group operations from Windows locks, readiness publication and Job Objects. A gated Node bootstrap establishes ownership before application imports. Close keeps services alive; explicit Quit checks dirty edits and stops the tree. Native Save As, local navigation, duplicate activation and crash recovery are exercised with synthetic data.

The local package now includes official Codex, Tectonic, isolated offline TeX assets and Chromium PDF export. The Windows Codex environment retains required OS/profile variables and hides console windows; model, reasoning, serialization and runtime-owned ChatGPT authentication remain unchanged. A small real structured inference passed using `gpt-5.6-sol`, high reasoning and the existing ChatGPT session. No candidate facts were sent.

Windows LaTeX uses a standard AppContainer without network capabilities, isolated input copies and a one-process Job Object attached during process creation. Private-file/cache/network/child-process probes and broker-death cleanup pass. An LPAC experiment failed during DLL initialization and was not adopted. Tectonic's known-folder lookup required the redirected AppContainer directories, and its temporary-format rename required Modify access within the isolated work tree. A minimal private Fontconfig configuration avoids a misleading error on otherwise successful compiles. No original cache or private appdata permissions are widened. [Microsoft AppContainer guidance](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer) and the pinned Tectonic source informed the implementation; the report distinguishes local observations from platform guarantees.

The builder stages before replacement and keeps an explicit code/generic-asset allowlist. A per-user PowerShell installer replaces application files, retains data outside the package, creates an optional Start-menu shortcut and requires no administrator access. The current build is unsigned and expects an installed WebView2 Runtime.

## Verification findings

The initial screenshot timeout was a capture-method issue: direct CDP viewport capture with `fromSurface:false` produced the rendered Jobs view. Playwright's CDP download overrides initially bypassed the native Save As event; `noDefaults:true` preserves host behavior. Windows' modern Save dialog required its observed filename Edit control, with the chosen path verified before Save. These driver failures are not reported as passing product checks until the corrected run.

The existing Node suite also assumed Unix filesystem URLs, shebang executables, symlink privileges and POSIX permission bits. Windows fixtures now use filesystem URL conversion, a compiled fake runtime, directory junction coverage and ACL-based privacy assertions. Production shell execution was not added to model inference.

See the [Windows verification run](../verification/runs/2026-10-17-windows-port.md) for exact source/runtime fingerprints, outcomes and remaining coverage. Raw logs and generated test documents remain local. No employer contact, application action, live discovery, personal-data migration, cloud deployment or public post occurred.

## Remaining release work

Verify on a clean Windows machine, including WebView2 provisioning and fresh interactive ChatGPT login. Signing/distribution, ARM64 and other Windows versions remain unverified. Shared macOS changes require a Mac regression run. The existing large-inbox timeout and actual Unraid/provider checks remain separate follow-up work.

## Installer follow-up

After a second pause/resume, installer checks reproduced acceptance of an incomplete package and a partial file move when a launcher was locked. The installer now validates a complete file checksum inventory before and after staging, rejects package/path junctions, checks the Evergreen WebView2 prerequisite, and uses same-volume directory renames with publication rollback. An optional `-Check` performs read-only validation. The [follow-up run](../verification/runs/2026-10-17-windows-installer.md) distinguishes actual installation behavior from injected missing-runtime and publication-failure scenarios. Clean-machine verification remains unavailable on this host; neither Windows Sandbox nor Hyper-V management tools is present.
