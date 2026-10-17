---
title: LaTeX CV
section: Features
updated: 2026-10-17
---
# LaTeX CV

Feature ID: `FEAT-master-cv`

## Intent and basis

Edit and export an independent master CV, retaining legacy resumes and manual changes. Based on the [accepted project boundaries](../decisions/index.md) and existing implementation documentation; the [LaTeX-only decision](../decisions/index.md) supersedes the earlier dual-editor UI.

## Entry points and prerequisites

CV opens directly to LaTeX; prepare the compiler using [local setup](../guides/local-development.md).

## Expected outcomes

Save and Restore append versions; unsaved source remains downloadable. Invalid compilation preserves the last good PDF. Profile changes do not overwrite independent LaTeX text.

## Verification recipe

Use [shared verification setup](../verification/setup.md) for isolation, build identity, evidence and cleanup. After `npm run build`, run `npx tsx scripts/verify-latex.ts` for isolated browser preview, save/reload, downloads, errors, restore and mobile checks. `npx tsx --test tests/latex.test.ts tests/latex-runtime.test.ts` checks sandbox/runtime behavior.

Recipes are migrated from existing scripts and historical checks; they were not re-executed during the wiki migration.

## Coverage and limitations

The compiler/package cache must be ready. Native Linux sandbox support and actual Unraid execution remain unverified. Arbitrary uploaded LaTeX projects are outside initial support.

## Verification history

[Windows local build — 17 October 2026](../verification/runs/2026-10-17-windows-port.md) exercises AppContainer isolation, offline compilation, selectable native preview, Save and PDF download.

[Cursor-inspired UI redesign — 16 October 2026](../verification/runs/2026-10-16-cursor-redesign.md) records the replacement controls, responsive/theme checks, preserved workflows and native installation.

[Lean cleanup first pass — 16 October 2026](../verification/runs/2026-10-15T165802Z-lean-first-pass.md): WebMCP removal, retired legacy CV writes with preserved downloads, and hidden/unscanned placeholder sources; 200 tests, build and isolated browser checks passed.

[ZIP backups and LaTeX-only CV — 8 October 2026](../verification/runs/2026-10-07T182813Z-backups.md) records archive validation/replacement, the two-button browser and native flows, LaTeX/assistant checks and installation.

[Historical implementation checks](../verification/history.md) record previous selected scenarios and limitations. Those entries are historical evidence; new reports belong in [verification runs](../verification/index.md).


## LaTeX editor

Open **CV** to edit `Resume.tex` beside its actual PDF. **Recompile** (`Cmd/Ctrl+Enter`) updates the preview; **Save** (`Cmd/Ctrl+S`) creates a persistent source version. The version selector and **Restore version** retain previous edits. **Download PDF** exports the displayed build and is disabled when the source has changed; **Download .tex** always preserves the current source, including an unfinished edit. Errors link to source lines and leave the last good preview visible. Compilation uses no AI.

LaTeX has independent version history. Editing it never updates career facts or cover-letter evidence. On 8 October 2026 the user removed **Data and HTML**: CV now exposes only LaTeX, old HTML CV links open LaTeX, and the assistant no longer reads or edits HTML/legacy CVs. Existing legacy database records retain API-only read/download access through `GET /api/cv`, `GET /api/cv/:id` and `POST /api/cv/export` (HTML, PDF and DOCX). Obsolete `PUT /api/master`, `PUT /api/template`, `POST /api/cv/preview` and `POST /api/cv/:id/versions` routes are retired. Startup and profile/assistant edits no longer create legacy CV versions; the saved-job cover-letter editor uses plain text, a shared preview/PDF layout and Copy text. On first use, an existing `resume/output/pdf/john-goh-rengwu-resume.tex` under appdata is imported once. Otherwise a source document is initialized from the current master facts using the sb2nov-style template. Later edits are never overwritten by seed files or profile changes.

The Docker image includes Tectonic, the required fonts/packages, and a Linux Landlock sandbox. Compiles run offline, with shell escape disabled, a 30-second timeout, bounded output and a temporary work directory. They cannot read appdata or Codex authentication. The Linux host must support Landlock (kernel 5.13+ with Landlock enabled); compilation fails closed if it does not. No privileged container or Docker socket is required.

Local `npm run dev` and `npm start` automatically prepare LaTeX. Setup reuses an installed compiler (including Homebrew outside the launcher's PATH), or downloads a SHA-256-verified Tectonic 0.15.0 release into `<appdata>/latex-runtime/bin`. macOS and Linux arm64/x64 plus Windows x64 are implemented. Windows local setup needs Go to build its AppContainer helper; the Windows desktop package includes that helper. No Homebrew installation or administrator access is needed on macOS. To retry a failed download or prepare updated template packages:

```sh
npm run setup:latex
```

Setup checks offline compilation first and only downloads packages using a generic template without candidate data when needed. An existing package cache is reused; new installations use `<appdata>/latex-runtime/cache`. Runtime compilation uses only the cache and the OS sandbox, which blocks private files and networking. Optional overrides are `JH_TECTONIC_BIN`, `JH_LATEX_CACHE` and, on Linux/Windows, `JH_LATEX_SANDBOX`; invalid explicit overrides are reported instead of silently replaced. Native Linux development needs `gcc` and Linux development headers to build the included sandbox helper automatically; Docker already contains it. If setup fails, the rest of the app still starts and saved documents remain available. Only the bundled package set is supported initially; add trusted package requirements to `core/latex/starter.tex` and rerun setup/rebuild the image to expand it.

On Windows, compilation uses the AppContainer and Job Object boundary described in the [desktop specification](desktop.md#windows-11-x64). It has no network capabilities, reads private copies of generic runtime assets, and writes only its isolated work directory. The original cache and private sibling-file denial, child-process denial, and compiler cleanup after broker death are covered by native probes. The same 30-second/output/PDF limits apply.

Migration 006 stores LaTeX source versions and successful PDF builds in SQLite. They are included in the existing database backup. Unsaved preview builds are bounded; saved versions keep their compiled PDFs. Appdata and all existing documents are preserved across updates.
