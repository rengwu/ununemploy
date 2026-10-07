---
title: Job inbox and saved jobs
section: Features
updated: 2026-10-07
---
# Job inbox and saved jobs

Feature ID: `FEAT-job-inbox`

## Intent and basis

Jobs and Saved let the user inspect postings, filter results, record Seen state, save work and keep private notes. Based on the [accepted project boundaries](../decisions/index.md) and existing implementation documentation; this migration adds no product requirement.

## Entry points and prerequisites

Open Jobs or Saved after [profile readiness](profile.md); use the existing local collection or isolated fixtures.

## Expected outcomes

Opening a posting records Seen once; the default preview does not. Filters and pagination retain deliberate selection and unsaved notes. Saved preserves individual records and starts only [cover-letter generation](cover-letters.md).

## Verification recipe

Use [shared verification setup](../verification/setup.md) for isolation, build identity, evidence and cleanup. `npx tsx --test tests/job-query.test.ts tests/seen.test.ts tests/locations.test.ts tests/location-regions.test.ts` checks isolated data behavior. `npx tsx scripts/verify-dashboard.ts` uses the existing dev app and intercepts Seen writes; it expects real inventory. `npx tsx scripts/verify-seen-ui.ts` checks Seen with isolated fixtures.

Recipes are migrated from existing scripts and historical checks; they were not re-executed during the wiki migration.

## Coverage and limitations

Live-dashboard recipes depend on inventory and were not rerun for this documentation migration.

## Verification history

[Historical implementation checks](../verification/history.md) record previous selected scenarios and limitations. Those entries are historical evidence; new reports belong in [verification runs](../verification/index.md).


## Dashboard loading


Jobs and Saved filter and paginate on the server, with 75 summaries per page. Full descriptions and match evidence load when the detail pane opens; document data loads when its editor opens. The eight-second status check uses ETags, so unchanged responses have no body. Collection changes refresh the visible results, and polling pauses while the browser tab is hidden. Failed or invalid responses show a Retry action without discarding existing data or edits.

The API now returns `{items, total, page, pageSize, totalPages, revision}` from `GET /api/jobs`, with zero-based pages and a maximum page size of 100. Use `GET /api/jobs/:id` for full details, `/api/job-locations` for filter options, and `/api/master` for the profile/template. `/api/bootstrap` contains status, counts and compact document choices, not the complete collection.


## Location filter


In **Jobs** or **Saved**, open **Any location**. The menu groups countries under geographic areas, with **APAC**, **EMEA** and **Americas** available as broad filters. **Southeast Asia** and **East Asia** come first, with Malaysia first within SEA and individual countries/areas selectable. Search also finds cities and original source labels; these do not crowd the default country list. Multiple selections match any selected location and combine with the other job filters. **Clear locations** resets the filter. Selections persist across page switches and reloads in the same browser tab.

Country filters include recognized cities using a bundled, server-only [GeoNames](https://www.geonames.org/) lookup. Regions include their member countries and narrower regions: Kuala Lumpur → Malaysia → Southeast Asia → APAC. Source text is preserved. Ambiguous codes/names such as bare CA, AZ or London are not assigned a country without sufficient context. **Unresolved** includes locations that could not be assigned a country/region; their original labels remain searchable. See [dataset attribution, coverage and exact regional definitions](../reference/geography.md).

**Worldwide** requires an explicit global statement. **Unspecified** includes missing and remote-only location fields. Select these alongside a country when desired. A country filter does not include a posting that only says APAC or Worldwide: those statements do not establish that every country is eligible. Region buckets organize browsing and do not determine work authorization.

The detail header labels explicit candidate restrictions as **Hiring locations** for Himalayas, Remotive, Jobicy, and We Work Remotely; other source fields are labeled **Location**. Filtering uses these listed fields, not incidental headquarters mentions in descriptions, and does not determine visa eligibility. Organic posts have free-form location headers: their dropdown values are limited to place names also found in structured boards (plus explicit Worldwide); unrecognized headers fall under Unspecified. Original posting text is preserved.


## Seen posts


Opening a job by clicking its title, using the keyboard, or choosing **View posting** records its first `seenAt` timestamp locally. A **Seen** label appears in the row. **Seen and unseen / Unseen / Seen** filters work in Jobs and Saved, independently of saved/applied status. The selected row has a blue background, edge marker and emphasized title in light and dark modes.

The default first-row preview does not count as a deliberate open. Under Unseen, opening a result removes it from the list while keeping its detail pane open. Seen state survives rescans and restarts and applies to that individual posting, not every inferred duplicate. Historical opens were not recorded, so tracking begins with this feature; older views cannot be reconstructed. This action never saves the job or queues a cover letter.
