---
title: Compact Windows setup
section: Verification
updated: 2026-10-23
result: Untested
---
# Compact Windows setup

## Scope and build

Implement and verify the approved smaller bundle and direct Windows installation for [FEAT-desktop](../../features/desktop.md), carrying the [onboarding repairs](2026-10-21-assistant-onboarding.md) into the installer. The user requested jstack work-until-grill. No consequential implementation choice remained unresolved; the work proceeded through local implementation and checks.

Windows 11 x64, Node 22.23.3, Go 1.26.5, pi-ai 1.3.0, Inno Setup 7.1.0 and installed Evergreen WebView2. Base revision `159bce03bd1b8f0f68c91a2b22e6b9d4135ccf64`, with dirty implementation identified by the [source manifest](../../evidence/2026-10-23-windows-delivery/source-manifest.json). Source manifest SHA-256: `06743fbb47e73eace5402ca1e3af0094519a9fa5764b1632a0a06ce7b4555149`. The [local installer metadata](../../evidence/2026-10-23-windows-delivery/local-release.json) records the measured artifact; hosted release results are added after publication. The setup prototype was exercised again with a genuinely empty appdata directory: it opened signed out, with an empty profile and zero jobs. Its SQLite file also survived update and uninstall. Raw logs, generated synthetic documents and screenshots remain local under `.local-data/verification/`.

The installer checks use a temporary installation directory containing spaces, synthetic personal-data retention sentinel, no existing Inno registration and no Start menu icons. The native driver uses another isolated synthetic database with scheduling/inference disabled and only Windows system directories on PATH. No canonical user records or authentication are used.

## Results

| Scenario | Expected | Observed | Result |
| --- | --- | --- | --- |
| Smaller runtime | Exclude runtime compilation/frontend dependency trees and separate Chromium | Initial prototype: 45.98 MiB setup, 208.44 MiB unpacked, 567 files; baseline 677.95 MiB and 31,696 files. Runtime entry points and explicit assets work without development dependencies | Passed |
| Setup and upgrade | Install and replace without manual file operations; preserve personal data | Actual setup installed in about 32 seconds and updated in about 18 seconds on this host. Obsolete application file removed; synthetic personal-data sentinel retained | Passed |
| Uninstall | Remove application files and retain personal records | Actual registered uninstaller removed launcher/resources and retained the sentinel | Passed |
| Installed native journey | Run using only packaged code/runtimes plus system WebView2 | Jobs, filters/timezones, OAuth start/cancel, native Save As, PDF attachment, offline LaTeX, cover-letter PDF, ZIP restoration, dirty-Quit cancel, Close/reopen, Quit, crash cleanup and persistence passed | Passed |
| PDF fidelity and isolation | Preserve selectable text/pagination; disable document scripts and network requests | Legacy CV and four-page cover letter passed; accented Latin/Chinese text extracted. Direct native hostile markup produced original text, did not execute its script, and caused zero requests to a local probe server | Passed |
| PDF process containment | Native parser teardown must not crash the API | Initial worker-thread regression exited with Windows access-violation code 3221225477. Extraction was moved to a bounded child process; repeated/concurrent PDF regression passes | Passed |
| Focused code checks | Preserve assistant/profile/runtime/install invariants | 56 focused tests passed; separate repeated/concurrent PDF test passed; Go tests passed. TypeScript/Vite production build passed with the existing frontend chunk-size advisory | Passed |
| Fresh missing-WebView2 installation | Automatically provision the shared runtime with verified Microsoft bootstrapper | Implemented signature validation and readiness check; local host already has WebView2, so actual missing-runtime provisioning was not exercised | Untested |
| Clean-machine live onboarding | Complete ChatGPT sign-in and interpret the user's original resume naturally | No app-owned credentials or original PDF available. OAuth start/cancel and synthetic inference checks do not establish interpretation quality or subscription access | Untested |
| Hosted release workflow | Build, verify and publish the tagged setup on GitHub Actions | Pending first hosted run; local artifacts alone do not prove the workflow | Untested |

Evidence: [initial setup/native results](../../evidence/2026-10-23-windows-delivery/setup-initial.json), [PDF checks](../../evidence/2026-10-23-windows-delivery/pdf.json). The aggregate is **Untested** because the selected external/live-machine scenarios remain unverified.

## Failure investigation and limits

The first native PDF prototype rejected WebView2's initial in-memory data URL. The policy now permits only the exact first document navigation and blocks frames/subsequent navigation. Native and PDF isolation checks then passed. The fresh-appdata driver initially asserted authentication before the worker finished its startup check; it now waits for the reported state. One local build overlapped a setup compile and could not rename the previous output; the existing package remained intact. Build/compile steps must run sequentially, as in the release workflow.

The setup is unsigned. Signing, ARM64, automatic/delta updates and macOS/Unraid runtime execution were not part of this Windows delivery. The existing alternate PDF implementation remains for non-Windows-desktop environments; no claim of cross-platform runtime verification is made.
