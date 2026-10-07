---
title: Dashboard UI
section: Decisions
updated: 2026-10-07
---
# Dashboard UI

Status: implemented locally with Kumo. See [verification history](../verification/history.md) for the scope of browser checks.

## User decisions

- Follow Cloudflare's dashboard and use official Kumo components.
- No ornamental labels, captions, subcaptions, subtitles, or flourishes. Every string must serve a task.
- Name actions plainly: Save, Edit, Dismiss, Retry, Download PDF, Download DOCX. These are examples for existing product actions, not a finalized toolbar.
- Keep the app fully local.
- The user approved the job inbox with filters and a detail pane, and the CV source editor with rendered preview. Career facts remain structured and CV presentation remains editable.

## Component system

Use React, TypeScript, and Vite for the frontend. Kumo requires React and React DOM; use `@cloudflare/kumo` and its Phosphor icon peer dependency. This replaces the proposed SvelteKit frontend. The Node.js backend, worker, SQLite database, and Unraid deployment remain local. [Kumo installation](https://kumo-ui.com/installation/), [Vite guide](https://vite.dev/guide/).

Use Kumo semantic colors and supported component variants. Let its tokens carry theme differences. Prefer styled components; use primitives only when the library lacks the needed control. Consult component APIs before implementation. [Kumo colors](https://kumo-ui.com/colors/), [component documentation](https://kumo-ui.com/components/button/).

Kumo blocks are adaptable examples. Optional descriptions and documentation panels in a demo are not requirements for this product. Omit them when they conflict with the user's direction. [Resource list block](https://kumo-ui.com/blocks/resource-list/).

## Cloudflare design guidance

Apply the official [kumo-design skill](https://github.com/cloudflare/kumo/blob/main/skills/kumo-design/SKILL.md), also published in the [design guide](https://kumo-ui.com/skill/). Research notes:

- Content and controls use 14px; larger sizes belong to headings.
- Sentence-case headings; preserve product names.
- Preserve font tracking. Use semibold headings and medium inline emphasis.
- Group related text; account for line height in padding.
- Hover colors change immediately.
- Use rings with shadows and borders for sticky separators.
- Closely nested corners use concentric radii.
- Align icons with the first text line; reduce inline monospace size slightly.
- Preserve content dimensions during collapse.
- Avoid nested LayerCards.
- Control dialog visibility through its open state.

These are Cloudflare's conventions, not locally invented universal rules. User requirements govern product copy and scope; examples containing subtitles do not authorize adding subtitles here.

## Usability and accessibility

Review against Jakob Nielsen's published heuristics: consistent terms and controls, visible operation status, recoverable mistakes, discoverable actions, efficient repeated work, and only relevant information. For this application, that means distinguishing an empty result from a failed scan, showing whether a cover letter is saved or generating, retaining edits after failures, and keeping filter state understandable. The implementation applies these heuristics to the approved page layouts. [Nielsen Norman Group](https://www.nngroup.com/articles/ten-usability-heuristics/).

Retain Kumo's keyboard and focus behavior; provide visible focus, meaningful input labels, and accessible names for icon controls. Follow documented interaction patterns when composing custom controls. Review loading, empty, error, disabled, and unsaved states as part of each implemented workflow. [Kumo accessibility](https://kumo-ui.com/accessibility/), [WAI-ARIA patterns](https://www.w3.org/WAI/ARIA/apg/patterns/).

## Approved workflow

- Opening screen: job inbox with filters, paginated results, and an adjacent detail pane for complete profiles; User profile onboarding for new users.
- Navigation: Jobs, Saved, User profile, CV, Sources, Settings.
- CV: master JSON facts and legacy saved resumes. Saved job → Cover letter: the complete job-specific letter editor, generation/retry, preview, versions and downloads live in the job detail. There is no separate Cover letters page or document picker. Old letter links redirect to the saved job tab. Both use editable Handlebars HTML/CSS, rendered previews, immutable saved versions, and PDF/Word downloads.
- User authorized implementation after accepting these two recommended workflows.

Cloudflare Kumo supplies controls and semantic color tokens. Custom CSS arranges the application panes; it does not replace the component system. Text uses Kumo's text-color tokens, with light and dark modes.

## App-wide assistant

Kumo 2.13.2 has inputs, buttons, tabs and selects but no dedicated conversation/message/composer component. Use [assistant-ui's external-store runtime](https://www.assistant-ui.com/docs/runtimes/custom/external-store) with its unstyled [Thread](https://www.assistant-ui.com/docs/primitives/thread), [Message](https://www.assistant-ui.com/docs/primitives/message) and [Composer](https://www.assistant-ui.com/docs/primitives/composer) primitives. This fits the existing SQLite-backed Codex queue without introducing a second inference provider. Controls remain Kumo, and presentation uses Kumo tokens. AI Elements and other shadcn-oriented kits were considered but would introduce another styled component system without improving the existing runtime integration.

The assistant is a 520px viewport-fixed overlay that slides in from the right without resizing or shifting the underlying page. A neutral chat-icon button in the top-right page header opens it, with an Open assistant tooltip below on hover/focus. The button participates in the header’s normal flex layout; Hide or Escape slides it offscreen and returns focus. It remains mounted so conversation, scroll and unsent text survive hiding and navigation. Unsent text also survives reload in the current browser tab. Reduced-motion settings disable the slide. The desktop overlay is nonmodal, allowing navigation while chatting; at 600px and below it fills the screen, traps keyboard focus and makes the underlying app inert while open.

The header identifies the current page/document context. The composer supports Enter to send, Shift+Enter for a newline, cancellation and recovery after failure. Activity text reports actual read/edit/compile stages. Saved-document links navigate to the actual job, letter or CV editor and hide the overlay. Clean editors refresh after changes; unsaved text and historical views are retained with a notice about the newer version. Markdown has no raw HTML or remote images.

User Profile is now a read-only facts viewer with Build profile/Edit with assistant. Facts include missing information, preferences, evidence references and additional fact status; historical sources are distinguished from current facts. Previous versions restore into a new revision. New users see the onboarding conversation in the same global assistant.

## Layout alignment

The page heading, filters, result controls, and outer table cells share a 24px horizontal gutter (16px on mobile). The page and sidebar headers share Kumo's 58px sidebar-header height. CV editor tabs and preview actions share a 56px row, so their borders and content start together.

Pane tabs use Kumo's `listClassName` extension to fit this row, with one separator and enough room for the library's keyboard focus ring. The native-control focus fallback lives in the base CSS layer so it does not override Kumo's focus styles. Notes fill the detail pane and resize vertically. Preview actions can scroll horizontally in very narrow panes.

## Location filtering

Jobs and Saved use Kumo’s documented grouped, searchable multi-select Combobox pattern: Group, GroupLabel and Collection retain library keyboard/focus behavior. APAC/EMEA/Americas provide broad filters, followed by SEA/East Asia country groups and other geographic groups. Malaysia appears first within SEA. Cities are searchable, and selected cities remain visible when the query clears. Worldwide, Unspecified and Unresolved remain independent options. Selections combine with OR and other filters with AND. [Kumo Combobox](https://kumo-ui.com/components/combobox/).

Location is distinct from work arrangement. The detail header identifies source-provided hiring restrictions without repeating the same location in the facts grid. Desktop, keyboard, light/dark themes, reload persistence, and the 390px mobile layout were checked for this control.

## Seen and selected rows

Seen is independent of review status and row selection. The Seen status filter uses the existing Kumo Select; seen rows show a literal Seen label. A deliberate open records the flag; automatically previewing the first result does not. Selection has a Kumo brand-tinted background, a 3px inset edge marker, an emphasized link-colored title and `aria-current` on the title button. Both color and the edge marker distinguish it from alternating table backgrounds. The same layout works in light and dark modes without shifting cell padding.

## Match, eligibility and listing quality

The existing Kumo Select controls now expose eligibility, stale/closed availability, and reversible duplicate grouping. Eligibility also appears in the job facts, independently of the match label. The Match tab shows score components and exact restriction evidence, with conflicts before general review notes. The description pane identifies its source, incomplete/stale states, and related posting links. Toolbar actions stay together when wrapping. Saved retains individual saved records. Desktop and 390px mobile checks cover these additions.
