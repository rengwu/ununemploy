---
title: Wiki migration verification — 7 October 2026
section: Verification runs
updated: 2026-10-07
result: Passed
---
# Wiki migration verification — 7 October 2026

## Scope

[FEAT-documentation](../../features/documentation.md): adoption of the local jstack skills, migration of existing public project guides, and the generated offline reader. Selected scenarios cover document/link integrity, historical content retention, runtime/private-file exclusions, desktop navigation/search/source/download, mobile layout and offline operation. Product behavior is outside this run.

## Build and environment

- Repository revision: `0f061483881ac7faa17ad9ca3d86d1b905d77e22`, dirty working tree including pre-existing automatic LaTeX setup work and this documentation migration.
- Platform: macOS arm64; Node `v22.19.0`; existing project Playwright Chromium.
- Reader asset: jstack revision `4a3109a2e4fd3be9836b7a14a2bf76ce14ce567d`, copied unchanged with bundled licenses.
- Instance: local `docs/wiki/index.html` opened through `file:` in an isolated browser context. No app API, account, model, source scan or network service is needed.
- [Build identity and SHA-256 source manifest](../../evidence/2026-10-07T042714Z-wiki-migration/build-identity.json) identify the tested documentation. The fingerprint excludes its own evidence and run report and the generated HTML to avoid circular hashes; it includes all other wiki Markdown, the builder and the repository documentation entry points.

## Results

| Scenario | Expected | Observed | Result |
| --- | --- | --- | --- |
| Wiki build and current snapshot check | Valid metadata, internal links and current HTML | Build and `--check` passed for all 30 pages | Passed |
| Migration audit | All project documents mapped, historical content retained, special files excluded | 11 checks passed; see [document audit](../../evidence/2026-10-07T042714Z-wiki-migration/document-audit.json) | Passed |
| Desktop reader | Navigation, search, source and Markdown download work | All 30 routes rendered; links/search/source worked and downloaded Markdown exactly matched its source; [reader results](../../evidence/2026-10-07T042714Z-wiki-migration/reader-check.json) | Passed |
| Mobile reader | Usable navigation and no document overflow | At 390px, navigation toggled and closed after selection; no horizontal document overflow on any page; [reader results](../../evidence/2026-10-07T042714Z-wiki-migration/reader-check.json) | Passed |
| Offline and errors | No external requests or JavaScript errors | Offline context, zero external requests and zero page errors; [reader results](../../evidence/2026-10-07T042714Z-wiki-migration/reader-check.json) | Passed |
| Report format | Valid outcome metadata | jstack report checker found one report and zero errors | Passed |

## Evidence

[Desktop screenshot](../../evidence/2026-10-07T042714Z-wiki-migration/desktop.png) and [mobile screenshot](../../evidence/2026-10-07T042714Z-wiki-migration/mobile.png) were visually inspected. Both showed readable content and intact navigation without clipped controls. The screenshots contain only public project documentation. The check drivers remain private development intermediates under `.local-data/wiki-migration/`; product test drivers were unchanged.

## Limits and follow-up

This verifies documentation integrity and selected reader interactions. It does not revalidate the product, external references, current provider access, real inference, or Unraid deployment. Feature recipes were mapped from source and historical notes; they were not rerun during migration. Earlier raw logs and candidate records remain private outside this wiki. The browser context is closed after checks; evidence is retained.
