---
title: Dashboard UI
section: Decisions
updated: 2026-10-16
---
# Dashboard UI

DEC-ui. Current specification for the Cursor-inspired ununemploy interface. The user's 16 October request explicitly replaces the earlier Cloudflare Kumo requirement. [Research and implementation journal](../journal/2026-10-16-cursor-redesign.md); [submitted design answers](../journal/2026-10-15-grill-75e68001-4fc1-4146-ba18-0c71e2f23d42.md).

## Direction and scope

Adapt Cursor's components and Clarity's implementation to job hunting. The user delegated the blend between the compact desktop and Agents interfaces; an IDE layout is not required. Keep lowercase ununemploy, literal task-focused copy, local hosting and all existing data boundaries. Do not add ornamental labels, editor tabs, terminals or product features merely to resemble Cursor.

React, TypeScript and Vite remain. `src/ui.tsx` supplies ordinary semantic buttons, inputs, textareas, tables and feedback. Unstyled Base UI 1.8.0 supplies select, combobox, tabs, tooltip and modal interaction behavior. `src/ui.css` owns shared tokens and component appearance; `src/styles.css` owns app layout. Kumo imports, styles, tokens and the package dependency are removed. Phosphor icons and the assistant-ui conversation runtime remain.

The reference study inspected Clarity's design-system document, renderer styles, settings controls and fictional-fixture screenshots, then the installed Cursor 3.23.12 Agents, IDE and Settings UI. Clarity's observed extraction revision is `27b83eb469f745968d3e0ce311a1f45952cba542`; the sibling checkout inspected was `713fa7d040fd208dbc5b7d639aa48714ee191ece`. These observations inform this specification; Clarity's product structure is not imported.

## Visual language

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#fcfcfc` | `#181818` |
| Secondary panel | `#f3f3f3` | `#222222` |
| Fields | `#ffffff` | `#181818` |
| Raised surfaces | `#ffffff` | `#232323` |
| Main text | `#242424` | `#e7e7e7` |
| Secondary text | `#636363` | `#a0a0a0` |
| Separator | `#14141412` | `#ffffff0f` |
| Strong separator | `#14141425` | `#ffffff20` |
| Focus | `#506f80` | `#adbec8` |
| Selection | `#14141410` | `#ffffff12` |

Use system typography: 13px baseline, 12px controls/navigation, 11px metadata, 14px descriptions/chat with 1.65 line height. Document titles may use 20px. Controls use 5px radii and thin borders; menus/dialogs use 6px. Primary actions are neutral, with restrained semantic color plus meaningful text for errors/matches. Continuous panes replace card containers. Shadows are reserved for menus, dialogs, the assistant overlay and document paper.

The shell and assistant header are 44px; pane toolbars/tabs are 36px. Desktop navigation is 210–248px, with 28px rows. Standard buttons/selects are at least 26px, labelled fields 34px, and coarse-pointer controls at least 36px. Content uses a 20px gutter, or 16px on narrow screens. Focus remains visible. Motion is brief and disabled under reduced-motion preferences.

System is the default theme. Preserve existing explicit Light/Dark selections in `jh-theme`. System follows OS changes while the app is open; explicit selections win. Set the resolved theme before React renders to avoid an incorrect initial appearance. The code editor receives the same resolved theme; PDFs retain their document appearance.

## Shell and navigation

Jobs/Saved, User profile, CV, Sources and Settings remain labelled destinations. Settings stays at the bottom of the sidebar. Desktop navigation can collapse completely. At 767px and below, Open navigation opens a focus-isolated sheet and selecting a destination closes it. Keep existing routes, deep links and unsaved-edit guards.

The native WKWebView extends under a transparent macOS title bar. Real traffic lights share the header; the web UI reserves their space only inside the native wrapper. The passive app-name region is a native drag target and supports double-click zoom. Browser instances have no fake traffic lights. The wrapper's close, Quit, downloads and external-link restrictions remain in force.

## Jobs and Saved

Keep the opening inbox with an independently scrolling result list and detail pane. Search, Filters, Add job and Scan form the primary toolbar. Filters expands match, availability, work arrangement, location, Seen and eligibility. A visible Active indicator survives collapse whenever secondary filters differ from defaults. Review status, duplicate grouping, result count and sort remain beside the list. On narrow screens, opening a result switches to detail with Back to jobs.

A selected row has a neutral selected background, an inset edge and `aria-current` on the title. Seen remains independent of review status; automatic first-result preview does not mark Seen. Literal match text and source/availability/eligibility evidence remain readable. Description, Match, Notes and Cover letter retain keyboard-operable tabs and unsaved guards. Errors show Retry; a failed request must not appear as an empty collection.

Location is a searchable grouped multiselect. APAC/EMEA/Americas and geographic country groups remain, with Malaysia first within Southeast Asia. Cities appear when searched or already selected. Worldwide, Unspecified and Unresolved stay distinct. Choices combine with OR, and other filters with AND. Work arrangement remains separate.

## Documents and profile

CV remains an independent LaTeX source editor with rendered PDF preview, source download, compile diagnostics, zoom, versions and dirty guards. Cover letters remain inside Saved → job → Cover letter, with ordinary fields and paragraph text, preview, Copy text, PDF download, generation/retry and versions. No per-job resume generation or HTML/template editor is restored.

User profile remains a read-only Markdown view of canonical SQLite facts, with readiness, version restore and Edit with assistant in its toolbar. Reading content uses a constrained width; no separate profile chat is introduced.

## Sources and Settings

Sources uses compact tables, restrained status text and an accessible Add/Edit source dialog. Wide tables scroll inside their region on mobile. Scanning/provider semantics are unchanged.

Settings has General, Collection, AI and Connections navigation. General contains theme and ZIP backup controls. Sections stay mounted so switching between them preserves edits. Labels and fields align across rows, then stack in narrow containers. Explicit save behavior and credential handling remain unchanged; no new inference or delivery provider is added.

## Assistant

The user reaffirmed the right-hand overlay contract: 520px desktop width, fixed to the viewport, with no resize or shift of the page. Open assistant sits at the top right; Hide/Escape returns focus. At 600px and below it fills the viewport, traps focus and makes the background inert. Conversation, scroll and unsent text survive hiding/navigation; unsent text survives reload within the tab.

The message viewport scrolls independently above a rounded composer. Assistant messages sit directly on the canvas; user messages use a subdued panel. Enter sends, Shift+Enter adds a newline, Stop cancels, and errors remain retryable. Existing actual-save/compile receipts, context, draft preservation and links to edited documents remain. Markdown cannot execute raw HTML or load remote images.

## Verification

Use the isolated scenario driver `npx tsx scripts/verify-ui-design.ts` after `npm run build`, plus affected assistant, cover-letter, backup and native workflows. [Verification setup](../verification/setup.md) explains isolation and prerequisites. The known large-inbox request timeout is independent of this redesign; no performance fix is implied. Dated observations belong in [verification history](../verification/history.md).
