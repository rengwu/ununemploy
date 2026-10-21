---
title: Job inbox and saved jobs
section: Features
updated: 2026-10-20
---
# Job inbox and saved jobs

Feature ID: `FEAT-job-inbox`

## Intent and basis

Jobs and Saved let the user inspect postings, filter results, record Seen state, save work and keep private notes. Based on the [accepted project boundaries](../decisions/index.md) and existing implementation documentation; this migration adds no product requirement.

## Entry points and prerequisites

Open Jobs or Saved after [profile readiness](profile.md); use the existing local collection or isolated fixtures.

## Expected outcomes

Opening a posting records Seen once; the default preview does not. Filters and pagination retain deliberate selection and unsaved notes. Saved preserves individual records and starts only [cover-letter generation](cover-letters.md).

In Jobs and Saved, the whole posting row selects its detail pane: title, company, location, match, date and empty cell space. The title remains a keyboard-accessible button with Enter/Space activation. Row selection uses the existing Seen tracking and unsaved-edit guard; it does not save or apply to a job.

The shared navigation follows the [dashboard UI decision](../decisions/dashboard-ui.md): expand/collapse stays in the unified header, Settings remains at the bottom, and System/Light/Dark lives in Settings → General → Appearance. Secondary job filters open through Filters; nondefault values keep a visible Active indicator when collapsed. Changing appearance applies immediately and retains the existing device-local preference across navigation and restarts.

## Verification recipe

Use [shared verification setup](../verification/setup.md) for isolation, build identity, evidence and cleanup. `npx tsx --test tests/job-query.test.ts tests/seen.test.ts tests/locations.test.ts tests/location-regions.test.ts` checks isolated data behavior. `npx tsx scripts/verify-dashboard.ts` uses the existing dev app and intercepts Seen writes; it expects real inventory. `npx tsx scripts/verify-seen-ui.ts` checks Seen with isolated fixtures.

Recipes are migrated from existing scripts and historical checks; they were not re-executed during the wiki migration.

For navigation/appearance changes, build and open the updated app. Toggle the sidebar from its header in both directions, repeat using the keyboard, open Settings from the footer, switch Light/Dark, then reopen the app and confirm persistence. Restore the initial appearance after checking. Use synthetic data for shareable screenshots or retain only sanitized control-state observations.

## Coverage and limitations

Live-dashboard recipes depend on inventory and were not rerun for this documentation migration.

## Verification history

[Large-inbox timeout fix — 18 October 2026](../verification/runs/2026-10-18-inbox-performance.md) records indexed reads, refresh reuse, timeout recovery and macOS checks after the Windows checkpoint was pulled.

[Cursor-inspired UI redesign — 16 October 2026](../verification/runs/2026-10-16-cursor-redesign.md) records the replacement controls, responsive/theme checks, preserved workflows and native installation.

[Lean cleanup first pass — 16 October 2026](../verification/runs/2026-10-15T165802Z-lean-first-pass.md): WebMCP removal, retired legacy CV writes with preserved downloads, and hidden/unscanned placeholder sources; 200 tests, build and isolated browser checks passed.

[Full job-row selection — 7 October 2026](../verification/runs/2026-10-07T123846Z-job-row-selection.md) passed isolated browser checks for company/location/match/date/padding, keyboard, mobile and Saved selection.

[Sidebar controls — 7 October 2026](../verification/runs/2026-10-07T122444Z-sidebar-controls.md) records the installed navigation and appearance update; interaction coverage remains incomplete after a UI automation outage.

[Historical implementation checks](../verification/history.md) record previous selected scenarios and limitations. Those entries are historical evidence; new reports belong in [verification runs](../verification/index.md).


## Dashboard loading


Jobs and Saved filter and paginate on the server, with 75 summaries per page. Full descriptions and match evidence load when the detail pane opens; document data loads when its editor opens. The eight-second status check uses ETags, so unchanged responses have no body. Collection changes refresh the visible results, and polling pauses while the browser tab is hidden. Failed or invalid responses show a Retry action without discarding existing data or edits. An initial failure changes the result count to **Jobs unavailable**, rather than leaving **Loading jobs…** visible. The request deadline remains 15 seconds.

Large collections use an ordering index and streamed job rows. Listing-quality reads omit duplicate description text while preserving the complete stored source evidence for details and backups. A partial saved-job index keeps bootstrap document choices from scanning every job document.

Related job, location and detail requests carry the bootstrap `X-Jobs-Revision` hint and reuse a snapshot at least that recent. This avoids repeated rebuilds when collection writes land between those requests. The next bootstrap revision picks up newer writes; the minute boundary still refreshes time-based freshness. Requests without a valid hint use the current revision. Snapshot construction still processes the whole collection synchronously; the measured improvement does not establish unlimited scaling.

The API now returns `{items, total, page, pageSize, totalPages, revision}` from `GET /api/jobs`, with zero-based pages and a maximum page size of 100. Use `GET /api/jobs/:id` for full details, `/api/job-locations` for filter options, and `/api/master` for the profile/template. `/api/bootstrap` contains status, counts and compact document choices, not the complete collection.


## Location filter


In **Jobs** or **Saved**, open **Filters → Any location**. The menu groups countries under geographic areas, with **APAC**, **EMEA** and **Americas** available as broad filters. **Southeast Asia** and **East Asia** come first, with Malaysia first within SEA and individual countries/areas selectable. Search also finds cities and original source labels; these do not crowd the default country list. Multiple selections match any selected location and combine with the other job filters. **Clear locations** resets the filter. Selections persist across page switches and reloads in the same browser tab.

Country filters include recognized cities using a bundled, server-only [GeoNames](https://www.geonames.org/) lookup. Regions include their member countries and narrower regions: Kuala Lumpur → Malaysia → Southeast Asia → APAC. Source text is preserved. Ambiguous codes/names such as bare CA, AZ or London are not assigned a country without sufficient context. **Unresolved** includes locations that could not be assigned a country/region; their original labels remain searchable. See [dataset attribution, coverage and exact regional definitions](../reference/geography.md).

**Worldwide** requires an explicit global statement. **Unspecified** includes missing and remote-only location fields. Select these alongside a country when desired. A country filter does not include a posting that only says APAC or Worldwide: those statements do not establish that every country is eligible. Region buckets organize browsing and do not determine work authorization.

The detail header labels explicit candidate restrictions as **Hiring locations** for Himalayas, Remotive, Jobicy, and We Work Remotely; other source fields are labeled **Location**. Filtering uses these listed fields, not incidental headquarters mentions in descriptions, and does not determine visa eligibility. Organic posts have free-form location headers: their dropdown values are limited to place names also found in structured boards (plus explicit Worldwide); unrecognized headers fall under Unspecified. Original posting text is preserved.


## Timezone filter

In Jobs or Saved, open **Filters → Any timezone**. Drag either handle to select an inclusive UTC offset range from UTC−12:00 to UTC+14:00 in 15-minute increments. Arrow keys move by 15 minutes; Page Up/Down move by an hour; Home/End move to the permitted endpoint. Handles cannot cross. **Clear timezone** restores unrestricted results. The selection is shared across Jobs/Saved and survives reload in the same browser tab; changing it resets pagination and combines with the other filters.

A posting matches when any resolved country has at least one current UTC offset in the selected range after the circular rotation described below. Countries with several timezones match any actual offset, not the gaps between offsets. This is deliberately country-level: a city resolved to the US can match any US timezone. Region-only, Worldwide-only, remote-only and unresolved locations are excluded while the filter is active because they do not establish a country. Listing text and eligibility are unchanged; this filter does not infer required working hours.

Country mappings come from the bundled IANA table; Node’s timezone rules determine the offset, including daylight saving at the current instant. The cached snapshot refreshes at the next minute boundary. See [timezone data provenance](../reference/geography.md). The API accepts `timezone=[minimumMinutes,maximumMinutes]`, or `null`/omitted for no restriction, and rejects reversed, out-of-bounds or non-quarter-hour ranges.

The picker includes an offline world map. Highlighted countries/territories match the current draft range; hovering shows the country and its current UTC offsets. A country with multiple zones is highlighted as a whole when any zone matches. The accessible map description lists matching names. Small territories use visible markers. Outlines are geographic context, not precise timezone boundaries or a new location resolver. The map uses the exact country-offset values returned by `/api/job-locations` from the same snapshot as filtering. It updates immediately while dragging, and results update when a slider adjustment is committed. A failed offset lookup replaces the map with **Retry map** instead of showing misleading highlights.

**Offset** rotates the map and its matching coordinate system underneath the fixed range. It does not move either range handle or change either stored coordinate. The two endpoint labels, accessible slider value text, map description and closed trigger display the effective UTC range after rotation. Labels update while dragging and wrap into the supported UTC bounds; for example, base −05:15/00:00 with −12:00 rotation displays +06:45/+12:00. The separate Offset value continues to show the rotation itself. The map wraps horizontally through its seam instead of staying bounded at Alaska/Russia. The independent offset uses 15-minute steps from −12 through +12 hours, covering one complete turn; both ends represent the same rotation. It remains usable with the full range. Positive offset moves the map west and the matching window east. Job results update on commit.

Matching wraps on a 24-hour clock: a country's current offset minus the rotation minus the selected minimum, modulo 1,440 minutes, must be within the selected width. Consequently UTC+14 and UTC−10 share a clock position; calendar dates are not part of this filter. A selection at least 24 hours wide includes every recognized country. The displayed −12…+14 coordinates remain available for selecting fractional offsets. The range and offset persist independently across reopening, reload and Jobs/Saved navigation. Old stored ranges start with offset zero. **Clear timezone** resets both range and rotation. With no active range, rotating the map alone leaves jobs unrestricted. The API additionally accepts `timezoneOffset` in quarter-hour minutes from −720 to +720, defaulting to zero.

[Timezone range verification — 18 October 2026](../verification/runs/2026-10-18-timezone-filter.md) records fixtures, browser interactions and native installation.

[Timezone map and offset verification — 18 October 2026](../verification/runs/2026-10-18-timezone-map.md) covers the map, width-preserving shifts, bounds, error recovery and native update.

[Wrapping timezone offset — 18 October 2026](../verification/runs/2026-10-18-timezone-wrap.md) supersedes the initial clamped-shift behavior with a rotating seam and fixed selection values.

[Effective timezone labels — 18 October 2026](../verification/runs/2026-10-18-timezone-labels.md) verifies that endpoint labels reflect rotation while handle coordinates stay fixed.

[Windows verification — 20 October 2026](../verification/runs/2026-10-20-windows-pi.md) records the CRLF timezone-data startup repair, seasonal/quarter-hour regression, timezone browser workflow and inbox timeout/Retry checks.

## Seen posts


Opening a job by clicking anywhere in its row, using the title button with the keyboard, or choosing **View posting** records its first `seenAt` timestamp locally. A **Seen** label appears in the row. **Seen and unseen / Unseen / Seen** filters work in Jobs and Saved, independently of saved/applied status. The selected row has a blue background, edge marker and emphasized title in light and dark modes.

The default first-row preview does not count as a deliberate open. Under Unseen, opening a result removes it from the list while keeping its detail pane open. Seen state survives rescans and restarts and applies to that individual posting, not every inferred duplicate. Historical opens were not recorded, so tracking begins with this feature; older views cannot be reconstructed. This action never saves the job or queues a cover letter.
