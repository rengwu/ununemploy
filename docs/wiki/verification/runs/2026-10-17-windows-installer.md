---
title: Windows installer integrity and replacement
section: Verification
updated: 2026-10-17
result: Passed
---
# Windows installer integrity and replacement

## Scope and build

Continuation of the authorized Windows port after the user resumed development. Selected scope: [FEAT-desktop](../../features/desktop.md#windows-11-x64) package completeness, prerequisite checks, failure recovery and preservation of the existing installation. The preceding [local port run](2026-10-17-windows-port.md) remains the evidence for earlier runtime work.

Base revision `a7d9d6433a7f2db962be1f1a9aebfb9c19f20efd`, with uncommitted changes. Windows 11 x64 build 26200, PowerShell 5.1, Node 22.23.3, Go 1.26.5, Evergreen WebView2 155.0.4283.60. Tests use tiny synthetic package payloads and temporary personal-data sentinels. They never execute the dummy runtime files. No personal database or authentication is copied into a package.

The [source and artifact manifest](../../evidence/2026-10-17-windows-installer/source-manifest.json) fingerprints 183 source files (`8182adb21b6b3eb10820c2a06d26a8d2400f9c38dabbf292be707e0ecdd762a9`), records the build metadata and package inventory hash, and confirms all 10 selected built/installed artifact hashes match. The [sanitized results](../../evidence/2026-10-17-windows-installer/results.json) retain test counts, baseline findings and the actual native-driver outcomes.

Before the fix, the preceding installer accepted a package containing only an identifying build JSON and dummy launcher, without Node. The locked-file reproduction also exposed a partial recursive move with PowerShell Move-Item: the old installer script moved to a previous directory, while the locked launcher and Node fixture remained in the original directory. Those failed baseline behaviors are historical findings; the selected results below concern the corrected installer.

## Selected outcomes

| Scenario | Expected | Observed | Outcome |
| --- | --- | --- | --- |
| Corrected checksum and path validation | Reject incomplete/altered packages before replacement | Same-size runtime corruption, missing dependencies, unlisted files, missing inventory, duplicate/traversing paths and junctions rejected; existing fixture application and separate data retained | Passed |
| Install/replace an older package | Support repair without requiring an old checksum inventory | First install and replacement succeeded; obsolete file removed, broken old runtime replaced and separate data sentinel retained | Passed |
| Locked installed file | Fail without partially moving the application | Initial PowerShell Move-Item attempt left a partial previous directory. The corrected Directory.Move path rejected the real locked-file operation with all checked old files retained and no staging/previous leftovers | Passed |
| Publication recovery | Restore the previous package after publication fails | An explicitly injected staging-to-destination failure restored the old directory and sentinel; other directory operations and cleanup ran normally | Passed |
| WebView2 prerequisite | Detect present runtime and explain absence | Actual installed runtime detected; simulated registry absence returned the required-runtime message and official download URL | Passed |
| Targeted tests | Preserve installer and existing desktop behavior | Nine installer scenarios (10 Node-reported tests including their parent) and four existing desktop tests passed | Passed |
| Complete package | Build and validate every packaged file | TypeScript/Vite/native build completed; all 31,679 inventoried files passed the actual installer's read-only check, including Unicode dependency filenames | Passed |
| Installed native package | Validate and run the replaced full payload | Full fixture installation succeeded; all 14 selected native checks passed, including running-update refusal, local shell/CV rendering, unsaved-edit cancellation, native PDF download, letter PDF, backup restore, persistence, Close/reopen, Quit and crash cleanup. The UI observation is corrected below | Passed |

## Findings and limits

The reproduced old behavior and corrected results are distinguished above. Missing WebView2 registration and publication failure are injected tests, not claims of a clean Windows OS or an independently observed publication failure. Microsoft's [WebView2 distribution guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution) supplies the Evergreen registration locations and manual-install option.

The initial full-package inventory used sequential file streams and was stopped during its read-only staging phase because it was too slow on roughly 31,700 files. The prior build remained intact. Inventory generation now uses eight concurrent streams with bounded memory; this changes build throughput, not checksum coverage.

The first full-package check caught ANSI decoding of a Unicode dependency filename in PowerShell 5.1. The helper now reads JSON explicitly as UTF-8, and the targeted tests include a Unicode filename. After the successful full build, only this packaging-helper correction was copied into the package and its complete inventory regenerated; no executable/frontend changes followed that build. The refreshed package passed its checksum/prerequisite check.

Copying and verifying the approximately 1 GB / 31,700-file package took several minutes on this host. The running-application rejection currently follows source verification, so that negative check also pays the checksum cost. These checks belong to installation; the ordinary launcher does not run them.

Windows Sandbox and Hyper-V management tools are absent on this machine. Clean-machine installation, actual missing-runtime provisioning, fresh interactive ChatGPT authentication, signing/distribution, other architectures/Windows versions and macOS regression remain **Untested** and outside this selected follow-up. No new real model invocation or live provider scan was selected. Checksum inventories detect copying/corruption issues; they do not establish publisher authenticity.

Actual Settings and selectable CV viewport captures were inspected. The driver's `windows-jobs.png` filename and nativeUI result text overstate its coverage: the image shows Settings → AI, and the driver asserts the assistant header, native inset and window visibility, not Jobs content. The sanitized evidence records the original claim and this correction. Initial Jobs routing/content is **Untested** in this installer follow-up; this does not replace the preceding run's distinct observations. Raw logs, synthetic fixture artifacts and generated documents remain local under `.local-data/verification/`. Tests remove their own temporary trees; the workspace-local installed package remains available for review. No canonical personal records, external messages or cloud deployment are part of this run.
