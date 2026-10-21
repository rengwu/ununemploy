import { readFileSync } from "node:fs";
import { offsetsMatchRange, type TimezoneRange } from "./timezone-range.ts";

// IANA country mapping stays server-side. Intl supplies current DST rules.
const zones = readFileSync(
  new URL("../data/geography/zone1970.tab", import.meta.url),
  "utf8",
)
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const [countries, , zone] = line.split("\t");
    return {
      countries: countries.split(","),
      formatter: new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        timeZoneName: "longOffset",
      }),
    };
  });
export function countryTimezoneOffsets(at = Date.now()) {
  const offsets = new Map<string, Set<number>>();
  for (const { countries, formatter } of zones) {
    const name = formatter
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")!.value;
    const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
    if (name !== "GMT" && !match)
      throw new Error(`Invalid timezone offset: ${name}`);
    const minutes = match
      ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "-" ? -1 : 1)
      : 0;
    for (const country of countries) {
      const values = offsets.get(country) || new Set<number>();
      values.add(minutes);
      offsets.set(country, values);
    }
  }
  return offsets;
}
export function matchesTimezoneRange(
  locations: Set<string> | undefined,
  range: TimezoneRange | null,
  offsets: Map<string, Set<number>>,
  rotation = 0,
) {
  if (!range) return true;
  for (const location of locations || []) {
    if (!location.startsWith("country:")) continue;
    if (
      offsetsMatchRange(offsets.get(location.slice(8)) || [], range, rotation)
    )
      return true;
  }
  return false;
}
