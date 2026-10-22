---
title: Windows delivery and package reduction proposal
section: Journal
updated: 2026-10-23
status: Accepted
---
# Windows delivery and package reduction proposal

## Original investigation

The user reports that manually zipping the Windows folder and its node_modules tree makes each test on another machine slow and cumbersome. They asked how to rectify delivery and package size. This page records observations and a proposed sequence, not an accepted implementation choice or a published release. The [desktop feature](../features/desktop.md#windows-11-x64) remains the current implementation contract. Earlier [Pi size research](2026-10-18-pi-runtime-handoff.md) remains historical.

Read-only GitHub CLI checks on 21 October found zero releases and zero Actions workflows in `rengwu/ununemploy`; no `.github/` directory exists in the checkout. A per-user PowerShell installer already exists, but no compiled setup executable or conventional uninstaller is produced. No release, workflow, installer or product change was made during this discussion.

## Observed package

The existing `build/desktop/windows` package contains 31,696 files totaling about 677.95 MiB unpacked. This is the existing built artifact, not a rebuild of the pending onboarding fix. Compressed size and transfer/install timing were not measured.

| Component | Unpacked MiB | Files |
| --- | ---: | ---: |
| Headless Chromium and browser support | 273.70 | 299 |
| Application, production dependencies and frontend | 234.89 | 31,091 |
| Node, Tectonic and isolation helper | 134.01 | 3 |
| Generic offline TeX cache | 18.98 | 297 |
| Native launcher | 9.89 | 1 |
| Inventory/build/lock metadata | 6.48 | 3 |
| Installer scripts | about 0.01 | 2 |

Node accounts for 82.94 MiB; Tectonic for 47.84 MiB; the isolation helper for 3.22 MiB. Large shipped dependency groups include native canvas (36.13 MiB), pdfjs-dist (35.89 MiB), Phosphor icons (31.50 MiB/9,089 files), Playwright core (12.83 MiB), esbuild platform binaries (11.15 MiB), date-fns (10.40 MiB/5,136 files), Base UI (9.48 MiB), assistant-ui (9.33 MiB), and react-dom (7.69 MiB). These figures overlap the application total and are not additive to it.

`scripts/build-desktop-windows.ts` installs the root production dependency tree. This includes frontend dependencies already compiled into `dist`. `scripts/desktop-bootstrap.mjs` registers tsx and `scripts/desktop-service.ts` starts a TypeScript worker, so runtime compilation tools are also shipped. `core/cv/export.ts` launches a separate Chromium for HTML-based PDF exports; the master LaTeX CV uses Tectonic independently.

## Recommended sequence

1. **Make delivery repeatable first.** Add an Inno Setup build producing one versioned `ununemploy-<version>-windows-x64-setup.exe`. Keep per-user install, appdata separation, running-app checks and safe replacement. Add a conventional uninstall entry that preserves personal records. Detect WebView2 and offer its official bootstrapper when missing. Ship bundled Node/TeX so testing needs no developer tool installation.
2. **Automate the release artifact.** A Windows GitHub Actions job should build from a versioned revision, run relevant tests, compile the setup executable, record compressed/unpacked sizes and file count, and attach the executable, checksums and notes to a prerelease. Cache generic downloads. The same script should work locally. Publish a normal release after clean-machine and upgrade checks; do not require testers to assemble or zip directories. Signing is a separate distribution step; an unsigned internal beta must be labelled accurately.
3. **Bundle runtime code and allowlist assets.** Compile/bundle API, worker and PDF extraction entry points, preserve migrations, templates, runtime skill and needed PDF/native assets, and remove frontend-only packages and tsx/esbuild from the installed runtime. Handle dynamic imports and native dependencies explicitly; deleting node_modules wholesale is not a safe implementation. Measure actual installed files and startup after the change.
4. **Remove the desktop Chromium payload.** For Windows, evaluate a restricted WebView2 PDF export path using the runtime already needed by the native UI. Verify cover-letter and legacy HTML exports, page breaks, fonts, selectable text, offline/network restrictions and cancellation before removing Chromium. Keep separate working strategies for macOS and browser/Unraid deployments. This could remove the measured 273.70 MiB browser payload from Windows, but the replacement has not been implemented or verified.
5. **Gate releases on a real installation journey.** Test installation with no Node/npm/Go or source checkout, missing WebView2 handling, fresh ChatGPT sign-in, résumé onboarding, profile persistence, CV compilation, letter PDF export, update over an existing installation and uninstall with personal-data preservation. Show version/revision in the application so reports identify the tested build. Automated mocks supplement the live onboarding check rather than establishing interpretation quality.

Keep the roughly 67 MiB Tectonic/cache payload initially to preserve offline CV readiness. Download-on-first-use compiler packs and automatic/delta updates are later options; neither is needed to eliminate manual zipping. No complete framework rewrite is proposed. A smaller bundle reduces both file-count overhead and download size, while the installer/release pipeline removes the manual delivery step immediately. Final size targets require a measured prototype; no compressed-size promise is made.

## Primary references consulted

- [Inno Setup features](https://jrsoftware.org/isinfo.php): single executable installers, non-administrative installation, compression, shortcuts and uninstall support. [Current licensing guidance](https://jrsoftware.org/isorder.php) should be checked for the project's use.
- [GitHub release CLI](https://cli.github.com/manual/gh_release_create): versioned releases with uploaded assets, draft/prerelease flags and generated notes. [Actions workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax): release publication requires scoped contents-write permission.
- [WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution): shared Evergreen runtime, presence checks and official bootstrapper deployment.
- [WebView2 printing](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/print): PDF file/stream APIs. Availability of the API does not establish integration in the current Go host or output fidelity.

## Bundle-first investigation — 23 October 2026

The user asked whether the bundle can be made smaller before the delivery work. Investigate and measure the runtime package first; the installer/release sequence above remains a proposal, not an accepted implementation order.

A local esbuild size experiment bundled the API, worker and PDF-extraction entry points with shared chunks, including the selected Pi OAuth flow. It produced **3,183,449 bytes (3.04 MiB) across 11 output files**, from 1,054 input modules. Playwright, PDF.js and native canvas were deliberately external. Node, Chromium, TeX, frontend output and runtime assets were excluded. This was `write:false` build analysis, not a runnable or verified distributable. Script and result remain in `.local-data/verification/package-audit/`; no product/build-script changes were made.

The shipped dependency tree also contains **1,958 source-map files totaling 32,415,682 bytes (30.91 MiB)**; PDF.js accounts for 20,001,232 of those bytes. Source maps can be retained as separate debugging artifacts. These savings overlap dependency removal and must not be added twice.

Recommended smaller-bundle work: first separate build-only frontend dependencies and bundle the backend; retain an explicit list of external packages/assets and licensing notices. Adapt migration/skill/geography/starter-file paths, worker startup, PDF worker location and dynamic loads, then verify the installed runtime without the development node_modules tree. Next evaluate the already-proposed Windows Chromium replacement. Audit the roughly 72 MiB PDF.js/native-canvas footprint separately; do not delete its native dependency merely because the application extracts text, since PDF.js initializes browser-graphics compatibility APIs in Node. Keep offline LaTeX support initially.

No final installed/download-size estimate is verified by this experiment. [esbuild bundling documentation](https://esbuild.github.io/api/#bundle) describes bundling reachable imports; [external-package handling](https://esbuild.github.io/api/#packages) explains why retained external dependencies remain part of the distributable.

## Accepted implementation - 23 October 2026

The user approved the smaller package, single setup executable and release delivery, then explicitly requested jstack work-until-grill. The proposal above is retained as the historical investigation. The current implementation is specified in the [desktop feature](../features/desktop.md#windows-11-x64).

Runtime code is bundled with explicit assets and notices. Windows PDF export uses isolated WebView2 instead of shipping Chromium. Offline LaTeX is retained. An Inno Setup executable supplies installation, upgrade and uninstall; GitHub Actions builds and tests versioned prereleases. Initial local output measured 45.98 MiB downloaded, 208.44 MiB unpacked and 567 files, versus 677.95 MiB and 31,696 files before. Later release metadata is authoritative for the final artifact.

Verification also exposed an intermittent native PDF dependency crash on worker-thread termination. Extraction now runs in a bounded child process to protect the API. See the [delivery verification run](../verification/runs/2026-10-23-windows-delivery.md) for build identity, observed behavior and remaining clean-machine/live-model limits.
