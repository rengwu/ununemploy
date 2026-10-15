---
title: Cursor UI redesign
section: Journal
updated: 2026-10-16
status: Complete
---
# Cursor UI redesign

## Authorized direction

The user requested removal of Cloudflare Kumo and a complete UI redesign following Cursor, with Clarity's `docs/wiki/foundations/ui-design-system.md` as a reference. This supersedes the earlier Kumo visual-system requirement. Implementation is authorized; design answers were collected and the resulting design is implemented and installed.

The existing local job-discovery, private drafting, candidate-evidence and data-preservation boundaries still apply. Jobs/Saved, profile facts, independent LaTeX CV, cover-letter editor, Sources, Settings, backup flows and the app-wide assistant all belong in scope. This is a new presentation/component system; it does not authorize deleting features or adding IDE, terminal, application-submission or outreach capabilities.

## Study performed

- Read Clarity's full design-system topic (reference dated 16 October; its documented extraction revision is `27b83eb469f745968d3e0ce311a1f45952cba542`). Current sibling checkout HEAD at inspection: `713fa7d040fd208dbc5b7d639aa48714ee191ece`.
- Inspected actual renderer `style.css`, `workspace.css`, `settings.css`, shared dialog/field helpers in `api.tsx`, and `views/settings-controls.tsx`. Observed layered neutral light/dark surfaces, system typography, compact controls, independent pane scrolling, grouped Settings and native form semantics.
- Viewed retained fictional-fixture images of Clarity's compact light list and dark News workspace. Screenshot pixel sizes are not CSS dimensions.
- Inspected installed Cursor 3.23.12 through native computer use: Agents landing/sidebar/composer, IDE title bar and editor region, and Settings navigation/groups/controls. Cursor's Agents and IDE surfaces differ materially; neither name alone defines an unambiguous whole-app layout. Settings preference changes made while exploring were returned to Editor, the observed initial IDE preference. No prompts were submitted or projects opened.
- Inventoried Kumo imports across ten frontend files, its theme tokens and the current native title bar. Replacing it requires shared controls, shell, dialogs, filters, menus and editor/assistant surfaces rather than a token-only recolor.

## Proposed translation

Use compact system typography (13px content baseline, 12px controls, 14px reading/chat), neutral primary actions, subtle selected surfaces, thin continuous pane boundaries, small radii and contextual errors. Keep long-form descriptions readable. Rebuild reusable controls with native semantics and accessible behavior; choose implementation primitives routinely without introducing another visual framework. Preserve keyboard focus, modal cancellation, existing drafts, version/conflict behavior and reduced motion. Adapt touch targets and stacking for mobile instead of imposing desktop-sized hit areas.

The job inbox remains the opening workflow under the existing authorization. Its filters, compact result list and detail reader should form a coherent workspace. Sources and Settings need aligned rows and grouped controls; the LaTeX and cover-letter workspaces need coordinated editor/preview surfaces. Retain meaningful status text alongside restrained semantic color. The current large-inbox request timeout remains a separate known issue and must not be disguised as an empty state.

## Accepted choices

The [submitted answers](2026-10-15-grill-75e68001-4fc1-4146-ba18-0c71e2f23d42.md) delegate the blend of Cursor surfaces and explicitly emphasize domain fit and components rather than an IDE workspace. Keep the right-hand assistant overlay, use a unified native header, and default new installations to System while retaining explicit Light/Dark choices. The transcript filename uses the submission helper's UTC date; the local project date is 16 October.

## Implementation

The [dashboard decision](../decisions/dashboard-ui.md) is the single current specification. Shared native/headless controls replace Kumo; the shell, filters, lists, forms, Settings, document workspaces and assistant use a new neutral light/dark system. Secondary filters move behind an active-state disclosure. Settings uses four sections while retaining mounted form state. The native wrapper extends the webview beneath a transparent title bar, retains real traffic lights, and adds a passive app-name drag region without a privileged JS bridge.

Verification used synthetic fixture databases and locally built production assets. Early browser checks caught a missing flex constraint on the conversation container, which allowed a long thread to push its composer offscreen; the constraint was restored. A concurrent rebuild invalidated loaded lazy-chunk URLs in one test attempt; subsequent browser runs must start only after the build has completed. These intermediate findings were corrected before the final passing runs.

## Completion

Kumo is removed from dependencies, imports, styles and tokens. The new system covers every current page, both themes, menus/dialogs, keyboard behavior and mobile layout. The native app was rebuilt, verified, installed and reopened on Jobs with its existing Dark choice. All 24 canonical database table counts/content digests matched across installation, and the installed application/wrapper matched the tested bundle.

The [dated verification run](../verification/runs/2026-10-16-cursor-redesign.md) records the source fingerprint, browser/core/native checks, synthetic screenshots and limits. The pre-existing large-inbox request timeout remains unresolved. No live inference, provider setup, Unraid deployment or commit was performed for this redesign.
