import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-locations-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = new URL("./fixtures/profile.json", import.meta.url).pathname;
import {
  buildLocationIndex,
  locationLabel,
  locationOptions,
  matchesLocations,
  parseLocationSelection,
  searchLocation,
} from "../core/locations.ts";
const { normalizeHimalayas, normalizeJobicy, normalizeRemotive, normalizeRss } =
  await import("../core/discovery.ts");
const { db } = await import("../core/db/index.ts");
after(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
import type { Source } from "../core/types.ts";

const values = (raw: string) =>
  locationOptions(raw).map((option) => option.value);

test("location facets separate explicit places and normalize common aliases without guessing countries", () => {
  assert.deepEqual(values("Remote - U.S. · USA · United States"), [
    "united states",
  ]);
  assert.deepEqual(values("London, UK | Singapore · Kuala Lumpur, Malaysia"), [
    "london",
    "united kingdom",
    "singapore",
    "kuala lumpur",
    "malaysia",
  ]);
  assert.deepEqual(values("Remote (US, Canada)"), ["united states", "canada"]);
  assert.deepEqual(values("Singapore (Remote) / Malaysia only"), [
    "singapore",
    "malaysia",
  ]);
  assert.deepEqual(values("San Francisco, CA"), ["san francisco", "ca"]);
  assert.ok(!values("San Francisco, CA").includes("canada"));
  assert.deepEqual(values("London"), ["london"]);
  assert.deepEqual(values("Montréal, Quebec"), ["montreal", "quebec"]);
  assert.deepEqual(values("Asia-Pacific"), ["apac"]);
});

test("remote and missing locations stay unspecified; worldwide requires an explicit unrestricted statement", () => {
  for (const raw of [
    "",
    "Remote",
    "Fully remote",
    "Not specified",
    "N/A",
    "Remote / Flexible",
  ])
    assert.deepEqual(values(raw), ["__unspecified__"], raw);
  for (const raw of ["Worldwide", "Anywhere in the World", "Remote, Global"])
    assert.deepEqual(values(raw), ["__worldwide__"], raw);
  for (const raw of [
    "Worldwide except US",
    "Worldwide (except US)",
    "Worldwide, excluding United States",
    "Outside US",
  ])
    assert.ok(
      !values(raw).some((value) =>
        ["__worldwide__", "united states"].includes(value),
      ),
      raw,
    );
});

test("multi-select uses OR across locations and keeps worldwide and unspecified independently selectable", () => {
  const jobs = [
    { id: "my", location: "Kuala Lumpur, Malaysia" },
    { id: "sg", location: "Singapore" },
    { id: "eu", location: "Europe" },
    { id: "remote", location: "Remote" },
    { id: "global", location: "Worldwide" },
  ];
  const index = buildLocationIndex(jobs);
  const match = (selected: string[]) =>
    jobs
      .filter((j) => matchesLocations(index.byJob.get(j.id), selected))
      .map((j) => j.id);
  assert.deepEqual(
    match([]),
    jobs.map((j) => j.id),
  );
  assert.deepEqual(match(["malaysia", "singapore"]), ["my", "sg"]);
  assert.deepEqual(match(["malaysia", "__worldwide__", "__unspecified__"]), [
    "my",
    "remote",
    "global",
  ]);
  assert.deepEqual(match(["missing-location"]), []);
  assert.deepEqual(
    index.options.slice(0, 2).map((o) => o.label),
    ["Worldwide", "Unspecified"],
  );
});

test("location search handles aliases, accents, and empty results without substring country mistakes", () => {
  assert.equal(
    searchLocation({ label: "United States", value: "united states" }, "USA"),
    true,
  );
  assert.equal(
    searchLocation({ label: "Australia", value: "australia" }, "US"),
    false,
  );
  assert.equal(
    searchLocation({ label: "Montréal", value: "montreal" }, "montreal"),
    true,
  );
  assert.equal(
    searchLocation({ label: "Singapore", value: "singapore" }, "malaysia"),
    false,
  );
  assert.equal(
    searchLocation(
      { label: "Unspecified", value: "__unspecified__" },
      "unknown",
    ),
    true,
  );
});

test("location filters restore safely from session storage", () => {
  assert.deepEqual(parseLocationSelection(null), []);
  assert.deepEqual(parseLocationSelection("not JSON"), []);
  assert.deepEqual(parseLocationSelection('{"value":"malaysia"}'), []);
  assert.deepEqual(
    parseLocationSelection('["malaysia",false,"singapore","malaysia",""]'),
    ["malaysia", "singapore"],
  );
});

test("organic header metadata does not become location options or false location matches", () => {
  const index = buildLocationIndex([
    { id: "board", sourceType: "ashby", location: "Singapore · London, UK" },
    {
      id: "hn",
      sourceType: "hn",
      location:
        "Singapore | Founding Operations | 0.50%–1.50% | 000 + equityCompany:",
    },
    {
      id: "noise",
      sourceType: "hn",
      location:
        "√PMF | Full-Time | $120,000 | TypeScript | contact@example.com",
    },
    { id: "x", sourceType: "x", location: "" },
  ]);
  assert.deepEqual([...index.byJob.get("hn")!], ["singapore"]);
  assert.deepEqual([...index.byJob.get("noise")!], ["__unspecified__"]);
  assert.ok(
    !index.options.some((option) =>
      /equity|founding|pmf|000|typescript/i.test(option.label),
    ),
  );
  assert.equal(matchesLocations(index.byJob.get("x"), ["singapore"]), false);
});

test("source candidate restrictions are labeled as hiring locations, including existing records", () => {
  const h = normalizeHimalayas({
    jobs: [
      {
        guid: "https://himalayas.app/job/1",
        title: "Engineer",
        locationRestrictions: ["Malaysia", "Singapore"],
      },
    ],
  })[0];
  const r = normalizeRemotive({
    jobs: [
      {
        id: 1,
        title: "Engineer",
        url: "https://remotive.com/job/1",
        candidate_required_location: "Europe",
      },
    ],
  })[0];
  const j = normalizeJobicy({
    jobs: [
      {
        id: 1,
        jobTitle: "Engineer",
        url: "https://jobicy.com/job/1",
        jobGeo: "APAC",
      },
    ],
  })[0];
  assert.ok([h, r, j].every((job) => job.locationScope === "hiring"));
  const wwr = normalizeRss(
    "<rss><channel><item><title>Example: Engineer</title><link>https://weworkremotely.com/jobs/1</link><region>Anywhere in the World</region></item></channel></rss>",
    { identifier: "https://weworkremotely.com/jobs.rss" } as Source,
  )[0];
  assert.equal(wwr.locationScope, "hiring");
  assert.equal(
    locationLabel({ sourceType: "himalayas", sourceName: "Himalayas" }),
    "Hiring locations",
  );
  assert.equal(
    locationLabel({
      sourceType: "rss",
      sourceName: "We Work Remotely · Programming",
    }),
    "Hiring locations",
  );
  assert.equal(
    locationLabel({ sourceType: "ashby", sourceName: "Employer" }),
    "Location",
  );
  assert.equal(
    locationLabel({
      sourceType: "rss",
      sourceName: "VueJobs",
      locationScope: "listed",
    }),
    "Location",
  );
});
