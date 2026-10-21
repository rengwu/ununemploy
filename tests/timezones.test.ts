import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import {
  countryTimezoneOffsets,
  matchesTimezoneRange,
} from "../core/timezones.ts";
import {
  formatUtcOffset,
  parseTimezoneRange,
  parseTimezoneOffset,
  offsetsMatchRange,
} from "../core/timezone-range.ts";
const winter = countryTimezoneOffsets(Date.parse("2026-01-15T12:00:00Z"));
const summer = countryTimezoneOffsets(Date.parse("2026-07-15T12:00:00Z"));
const country = (...codes: string[]) =>
  new Set(codes.map((code) => `country:${code}`));

test("timezone data loads from a Windows CRLF checkout", () => {
  const directory = mkdtempSync(join(tmpdir(), "ununemploy-timezone-crlf-"));
  try {
    mkdirSync(join(directory, "core"));
    mkdirSync(join(directory, "data/geography"), { recursive: true });
    writeFileSync(join(directory, "package.json"), '{"type":"module"}');
    for (const file of ["timezones.ts", "timezone-range.ts"])
      copyFileSync(
        new URL(`../core/${file}`, import.meta.url),
        join(directory, "core", file),
      );
    writeFileSync(
      join(directory, "data/geography/zone1970.tab"),
      "# IANA fixture\r\nAD\t+4230+00131\tEurope/Andorra\r\nNP\t+2743+08519\tAsia/Kathmandu\r\n",
    );
    const moduleUrl = pathToFileURL(join(directory, "core/timezones.ts")).href;
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `const {countryTimezoneOffsets}=await import(${JSON.stringify(moduleUrl)}); console.log(JSON.stringify([...countryTimezoneOffsets(Date.parse('2026-01-15T12:00:00Z'))].map(([key,values])=>[key,[...values]])));`,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    assert.deepEqual(JSON.parse(output), [
      ["AD", [60]],
      ["NP", [345]],
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("rotation wraps across the date line without changing the selected coordinates", () => {
  const range: [number, number] = [600, 720];
  assert.equal(offsetsMatchRange([-660], range, 120), true);
  assert.equal(offsetsMatchRange([780], range, 120), true);
  assert.equal(offsetsMatchRange([480], range, 120), false);
  assert.deepEqual(range, [600, 720]);
  for (const offset of [-660, -600, 0, 345, 480, 840]) {
    assert.equal(
      offsetsMatchRange([offset], range, -720),
      offsetsMatchRange([offset], range, 720),
    );
    assert.equal(offsetsMatchRange([offset], [-720, 840], 480), true);
  }
  assert.equal(offsetsMatchRange([-600], [840, 840]), true);
  assert.equal(offsetsMatchRange([840], [-600, -600]), true);
  assert.equal(offsetsMatchRange([345], [330, 330], 15), true);
  assert.equal(offsetsMatchRange([], [-720, 840], 120), false);
});
test("stored rotation accepts quarter-hours and rejects malformed or unbounded offsets", () => {
  for (const input of [null, "bad", "15.5", "1", "735", "-735"])
    assert.equal(parseTimezoneOffset(input), 0);
  for (const offset of [-720, -15, 0, 15, 720])
    assert.equal(parseTimezoneOffset(String(offset)), offset);
});
test("map offset arrays and server country sets agree across seasonal ranges", () => {
  for (const offsets of [winter, summer])
    for (const [code, values] of offsets)
      for (const range of [
        [-720, 840],
        [345, 480],
        [-345, -345],
        [0, 0],
      ] as [number, number][])
        for (const rotation of [-720, -315, 0, 60, 720])
          assert.equal(
            offsetsMatchRange([...values], range, rotation),
            matchesTimezoneRange(country(code), range, offsets, rotation),
          );
});
test("country timezone ranges include fractional offsets and inclusive endpoints", () => {
  assert.equal(matchesTimezoneRange(country("MY"), [480, 480], winter), true);
  assert.equal(matchesTimezoneRange(country("IN"), [330, 330], winter), true);
  assert.equal(matchesTimezoneRange(country("NP"), [345, 345], winter), true);
  assert.equal(matchesTimezoneRange(country("NP"), [330, 330], winter), false);
  assert.equal(matchesTimezoneRange(country("KI"), [840, 840], winter), true);
});
test("multi-zone countries match any actual offset, not gaps in a country's span", () => {
  assert.equal(matchesTimezoneRange(country("US"), [-600, -600], winter), true);
  assert.equal(matchesTimezoneRange(country("US"), [-300, -300], winter), true);
  assert.equal(
    matchesTimezoneRange(country("US"), [-345, -345], winter),
    false,
  );
  assert.equal(
    matchesTimezoneRange(country("US", "MY"), [480, 480], winter),
    true,
  );
});
test("current offsets account for daylight saving and unrecognized countries are excluded", () => {
  assert.equal(matchesTimezoneRange(country("GB"), [0, 0], winter), true);
  assert.equal(matchesTimezoneRange(country("GB"), [0, 0], summer), false);
  assert.equal(matchesTimezoneRange(country("GB"), [60, 60], summer), true);
  for (const values of [
    undefined,
    new Set(["region:apac"]),
    new Set(["__worldwide"]),
    country("XX"),
  ]) {
    assert.equal(matchesTimezoneRange(values, [-720, 840], summer), false);
    assert.equal(matchesTimezoneRange(values, null, summer), true);
  }
});
test("stored ranges reject malformed, reversed, fractional-step and out-of-bounds values", () => {
  for (const input of [
    null,
    "oops",
    "{}",
    "[0]",
    "[60,0]",
    "[-735,840]",
    "[0,855]",
    "[1,15]",
    '["0",60]',
  ])
    assert.equal(parseTimezoneRange(input), null);
  assert.deepEqual(parseTimezoneRange("[-330,345]"), [-330, 345]);
  assert.equal(formatUtcOffset(-330), "UTC−05:30");
  assert.equal(formatUtcOffset(345), "UTC+05:45");
});
