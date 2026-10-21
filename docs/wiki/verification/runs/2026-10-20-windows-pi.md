---
title: Windows Pi build verification
section: Verification
updated: 2026-10-20
result: Passed
---
# Windows Pi build verification

## Scope and build

Verify the Windows package after the Mac Pi runtime, assistant attachment, timezone and inbox changes, and investigate potential bugs. This covers [FEAT-desktop](../../features/desktop.md#windows-11-x64), [FEAT-ai-runtime](../../features/ai-runtime.md), [FEAT-assistant](../../features/assistant.md) and [job inbox](../../features/job-inbox.md) behavior. It does not certify a public release or completed Windows account authentication.

Base revision `e49324633efcfcb71e87e20c0bc48cc80ab0451f`, with uncommitted repairs and regression/driver changes. The [source manifest](../../evidence/2026-10-20-windows-pi/source-manifest.json) fingerprints that dirty source and records the built executable, bundled module and package inventory. Environment: Windows 11 x64 build 26200, Node 22.23.3, Go 1.26.5 with GCC for race checks, installed Evergreen WebView2, pi-ai 1.3.0. Dates use the workstation's Asia/Kuala_Lumpur timezone; evidence timestamps use UTC.

Tests use synthetic profiles, jobs, files and isolated temporary databases, with scheduling, collection and inference disabled. The native driver gives the app a Windows-system-only PATH and drives the real WebView2/API/worker. Installation targets `.local-data/installed-windows`, replacing the previous synthetic Codex package without a Start-menu shortcut. The previously running built application exited through native Quit before rebuilding. Canonical appdata and existing Codex authentication are not used for verification.

## Initial failed attempts and repairs

1. **Startup crash:** Git's Windows checkout converted `data/geography/zone1970.tab` to CRLF. Splitting only on LF left a carriage return in timezone names on three-column rows, causing `Intl.DateTimeFormat` to reject `Europe/Andorra` during API import. The parser now accepts LF/CRLF. A subprocess regression imports the actual module with explicit CRLF data and checks Andorra and Nepal offsets.
2. **Credential privacy:** POSIX `0700`/`0600` modes did not prevent Pi connection files inheriting broad Windows read permissions. A synthetic Everyone-readable parent reproduced the exposure. The credential directory and existing connection/host-ID files now receive private Windows ACLs before access; writes inherit that ACL. The regression also broadens existing files and starts three competing processes to verify repair, stable host ID and serialized updates. An intermediate `Set-Acl` implementation failed on repeated access because of a Windows privilege check; the final implementation applies the changed access rules through `FileSystemInfo.SetAccessControl`, and the repeated-process checks pass.
3. **Verification portability:** The attachment link-boundary fixture required privileged Windows file symlinks. Windows now uses a directory junction to the same synthetic credential directory, preserving the resolved-path rejection check. This was a fixture issue, not an attachment product failure. The native driver now explicitly asserts the opening Jobs heading rather than inferring it from the presence of assistant controls.

Initial targeted tests failed before these changes. The final targeted group passed all 16 tests; the strengthened credential follow-up passed all three runtime tests. Failed attempts remain in private local logs and are not counted as passes.

The first native attempt reached successful CV compilation/preview but timed out waiting for the native Save As download. Its cause was not established. Download diagnostics were added to the driver without changing the product; the complete built-package rerun and a subsequent installed-package run both passed the same download check and all remaining scenarios. This is an unreproduced timeout, not a claimed download bug fix.

## Selected outcomes

| Scenario | Expected and observed | Outcome |
| --- | --- | --- |
| Fresh Windows package | Fresh staged production dependency installation, TypeScript/Vite, Go launcher/helper, offline compiler preparation and selective Pi bundling completed | Passed |
| Node regression suite | 218 tests: 217 passed, one Homebrew-only fixture skipped, zero failed; bundled document runtimes enabled | Passed |
| Go race suite | Desktop and compiler-isolation packages passed, including real AppContainer denial and descendant cleanup tests | Passed |
| Connection file privacy | Broadly readable parent and existing files repaired; stable private host ID and three concurrent process updates passed | Passed |
| Shared attachment UI | Picker, image-bearing paste event, draft reload/removal, failed-send retry, image-only send, history/citations/download, New chat and mobile passed with simulated inference and no browser errors | Passed |
| Timezone UI | Pointer/keyboard ranges and circular offset, country matching, reload/Saved persistence, effective labels, map failure/retry, light/dark/mobile and Escape passed without browser errors | Passed |
| Inbox recovery | Actual 15-second timeout, distinct error/empty states, Retry and bootstrap revision propagation passed | Passed |
| Installation and identity | Installer validated source and staged copies, replaced the old Codex fixture, and retained separate fixture data. Installed executable, inventory and repaired product-source hashes match the build | Passed |
| Native entry and OAuth | Actual opening Jobs heading and controls, timezone map/keyboard input, signed-out exact model/high state, two OAuth start/cancel cycles, private host ID and no saved token passed | Passed |
| Native documents and attachments | Dirty Quit cancellation retained edits; AppContainer compiled selectable PDF; native Save As saved it; packaged PDF worker extracted its text; attachment draft survived reload and removal | Passed |
| Export, restore and lifecycle | Bundled Chromium letter PDF, ZIP restore, Close/reopen same instance, native Quit, restart/crash descendant cleanup, saved job/profile/notes/counter retention and SQLite integrity passed | Passed |

The Vite build retains its existing large-chunk advisory; npm reports the upstream `node-domexception` deprecation. Neither failed the build. Native scenarios passed against both the built package and the installed copy, with system-only PATH. The full Node suite also includes nine installer corruption/path/rollback scenarios; the real running-update refusal was not repeated in this run. [Sanitized results](../../evidence/2026-10-20-windows-pi/results.json) contain the selected scenario outcomes. Viewport captures were inspected locally; raw logs, synthetic PDFs and screenshots stay under `.local-data/verification/`.

## Package size

The package contains 31,696 files totaling 710,885,985 bytes (678.0 MiB), including its checksum inventory. The earlier Windows package was 1,051,478,141 bytes (1,002.8 MiB): a reduction of about 324.8 MiB, or 32.4%. The selected Pi provider/OAuth module is 383,195 bytes; license notices are separate. Neither `codex.exe` nor the full pi-ai dependency tree is present. Node, Chromium for PDF export, Tectonic/TeX and other production dependencies remain bundled. This measures unpacked bytes, not ZIP download size.

## Limits and cleanup

Fresh completed Windows ChatGPT sign-in, live model inference, real provider token refresh/allowance exhaustion, clean-machine installation, automatic WebView2 provisioning, signing/GitHub publication, ARM64/other Windows versions and macOS regression are **Untested**, outside the selected local scenarios. OAuth start/cancel does not establish an authenticated session. No real provider scan, employer contact or application action occurred; Pi Durable remains deferred.

Isolated drivers close their own servers/browsers/processes and remove temporary data. Two synthetic diagnostic folders from failed ACL attempts remain because automatic approval review rejected their cleanup without a more specific reason. Generic build caches, the built package, isolated installed copy and private diagnostic logs remain locally. No independent second-agent review was performed. No commit, push or release was requested for this check.
