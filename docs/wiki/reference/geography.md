---
title: Offline geography lookup
section: Reference
updated: 2026-10-18
---
# Offline geography lookup

`data/geography/geonames.json` is derived from [GeoNames](https://www.geonames.org/), downloaded on 17 September 2026. GeoNames data is licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution applies to the bundled derived dataset. Data is supplied without warranties of accuracy, timeliness or completeness.

Sources: [countryInfo.txt](https://download.geonames.org/export/dump/countryInfo.txt), [cities15000.zip](https://download.geonames.org/export/dump/cities15000.zip), [admin1CodesASCII.txt](https://download.geonames.org/export/dump/admin1CodesASCII.txt). The transformation retains country codes/names/continents and normalized primary/ASCII place names mapped to candidate countries; coordinates, population and other fields are omitted. Multiple possible countries are preserved. City coverage is cities above approximately 15,000 residents and capitals, plus first-level administrative areas. This is not a complete address database.

To refresh, download those three public files into `.local-data/geography/` and run `python3 scripts/build-geography.py`. Downloads happen only during this explicit maintenance step. The app reads the bundled lookup locally on the server; no external geocoding requests, accounts or additional runtime dependencies are used. The gazetteer is excluded from the browser bundle.

Browsing definitions live in `core/location-regions.ts`. Southeast/East/Central Asian subdivisions follow the [UN M49 geographic scheme](https://unstats.un.org/unsd/methodology/m49/) where applicable. Countries and separately listed areas such as Hong Kong, Macao and Taiwan remain individually selectable.

APAC, EMEA and Americas are operational groupings, not one universal geographic standard or work-authorization rule. Here APAC covers Southeast, East, South and Central Asia plus Oceania; EMEA covers Europe, Africa and Western Asia plus Iran. Iran is grouped with the Middle East for this business view, rather than M49 Southern Asia. Russia follows the country dataset's European assignment. The North America bucket means US/Canada, Greenland, Bermuda and Saint Pierre and Miquelon; Mexico, Central/South America and the Caribbean use Latin America & Caribbean. These assignments do not determine visa eligibility or promise that a region-only posting hires in every member country.

## Country timezones

`data/geography/zone1970.tab` is the unmodified country-to-timezone mapping from [IANA tzdata 2026e](https://data.iana.org/time-zones/releases/tzdata2026e.tar.gz), retrieved on 18 October 2026. Comma-separated country codes share a zone. The bundled `tzdb-LICENSE` and `tzdb-version.txt` retain upstream licensing and version metadata. The table is public domain. Refresh these three files together from an official release; verify every zone is supported by the bundled Node runtime.

`core/timezones.ts` uses this server-only mapping and `Intl.DateTimeFormat` to obtain current UTC offsets. It makes no external requests. Offset rules come from Node’s ICU/tzdb, independently of the country mapping; this Mac’s Node 22.19.0 reports tzdb 2025b. Recent government changes therefore require an updated Node runtime. The mapping includes all zones supported by that runtime in the checked release. Country matching uses existing conservative location resolution, not a new geocoder or inferred employer headquarters.

## Timezone map outlines

`src/timezone-map.json` derives 242 country/territory outlines from [Natural Earth’s 1:50m admin_0_countries GeoJSON](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson), retrieved on 18 October 2026. Natural Earth data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). The derived file retains a SHA-256 of the exact source. It is about 145 KB before compression and loads in a separate browser chunk only when the picker opens; no map library, tiles, account or runtime download is required.

Regenerate with `node scripts/build-timezone-map.mjs /path/to/ne_50m_admin_0_countries.geojson`. The script simplifies rings at 0.16° tolerance, projects to a 720×360 equirectangular map, retains English names and `ISO_A2_EH` codes, and adds markers for territories whose extent is under 1.5°. ISO-less outlines remain visible without a timezone match; coverage follows this small-scale dataset, not an exhaustive border or address database. This map does not determine timezone offsets, location resolution, eligibility or disputed-border policy. Those remain the existing country lookup and IANA rules.
