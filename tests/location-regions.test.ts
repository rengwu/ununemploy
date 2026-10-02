import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegionLocationIndex } from "../core/location-index.ts";
import { matchesLocations, searchLocation } from "../core/locations.ts";

const indexFor = (...locations: string[]) =>
  buildRegionLocationIndex(
    locations.map((location, i) => ({ id: String(i), location })),
  );
const matching = (index: ReturnType<typeof indexFor>, ...selected: string[]) =>
  [...index.byJob]
    .filter(([, values]) => matchesLocations(values, selected))
    .map(([id]) => Number(id));

test("country and regional selections expand upwards without inventing country scope for regional posts", () => {
  const index = indexFor(
    "Kuala Lumpur",
    "Singapore",
    "Tokyo",
    "APAC",
    "EMEA",
    "Worldwide",
    "Remote",
    "London, UK",
    "Toronto, Canada",
    "São Paulo, Brazil",
  );
  assert.deepEqual(matching(index, "country:MY"), [0]);
  assert.deepEqual(matching(index, "region:southeast-asia"), [0, 1]);
  assert.deepEqual(matching(index, "region:east-asia"), [2]);
  assert.deepEqual(matching(index, "region:apac"), [0, 1, 2, 3]);
  assert.deepEqual(matching(index, "region:emea"), [4, 7]);
  assert.deepEqual(matching(index, "region:americas"), [8, 9]);
  assert.deepEqual(matching(index, "country:MY", "__worldwide__"), [0, 5]);
});

test("ambiguous abbreviations, city names and qualified exclusions are not guessed", () => {
  const index = indexFor(
    "CA",
    "AZ",
    "BA",
    "Georgia",
    "London",
    "San Francisco, CA",
    "London, Canada",
    "Worldwide except US",
    "APAC excluding Malaysia",
    "Paris, Texas, United States",
  );
  for (const id of [0, 1, 2, 3, 4, 7, 8]) {
    assert.equal(
      [...index.byJob.get(String(id))!].some(
        (key) => key.startsWith("country:") || key.startsWith("region:"),
      ),
      false,
      String(id),
    );
    assert.equal(index.byJob.get(String(id))!.has("__unresolved__"), true);
  }
  assert.deepEqual(matching(index, "country:CA"), [6]);
  assert.deepEqual(matching(index, "country:US"), [5, 9]);
  assert.deepEqual(matching(index, "country:FR"), []);
  assert.deepEqual(matching(index, "__worldwide__"), []);
});

test("SEA and East Asian countries/areas remain separately available and prioritized", () => {
  const index = indexFor("Vienna, Austria");
  const firstCountries = index.options.filter((o) => o.kind === "country");
  assert.equal(firstCountries[0].value, "country:MY");
  assert.equal(
    firstCountries.filter((o) => o.group === "Southeast Asia").length,
    11,
  );
  for (const code of ["CN", "HK", "MO", "TW", "JP", "KR", "KP", "MN"])
    assert.equal(
      firstCountries.find((o) => o.value === `country:${code}`)?.group,
      "East Asia",
    );
  assert.deepEqual(
    index.options
      .filter((o) => o.group === "Regions" && o.kind === "region")
      .map((o) => o.label),
    ["APAC", "EMEA", "Americas"],
  );
});

test("city search offers a country and retains exact city selection and older filters", () => {
  const index = indexFor(
    "Bac Ninh",
    "Bangalore",
    "Kuala Lumpur, Malaysia",
    "London UK",
    "UK - London",
    "São Paulo",
  );
  assert.deepEqual(matching(index, "country:VN"), [0]);
  assert.deepEqual(matching(index, "country:IN"), [1]);
  assert.deepEqual(matching(index, "country:GB"), [3, 4]);
  assert.deepEqual(matching(index, "malaysia"), [2]);
  assert.deepEqual(matching(index, "kuala lumpur"), [2]);
  assert.equal(
    index.options.find((o) => o.value === "bac ninh")?.label,
    "Bac Ninh, Vietnam",
  );
  const country = index.options.find((o) => o.value === "country:MY")!;
  assert.ok(searchLocation(country, "Kuala Lumpur"));
  assert.ok(country.legacyValues?.includes("malaysia"));
  assert.equal(
    index.options
      .find((o) => o.value === "region:southeast-asia")
      ?.aliases?.includes("SEA"),
    true,
  );
});

test("all displayed region options have complete parent coverage for inferred country groups", () => {
  const index = indexFor(
    "Sydney, Australia",
    "Mumbai, India",
    "Almaty, Kazakhstan",
    "Berlin, Germany",
    "Dubai, UAE",
    "Nairobi, Kenya",
    "Mexico",
    "Buenos Aires, Argentina",
    "Seoul, South Korea",
    "Jakarta, Indonesia",
  );
  assert.deepEqual(matching(index, "region:apac"), [0, 1, 2, 8, 9]);
  assert.deepEqual(matching(index, "region:emea"), [3, 4, 5]);
  assert.deepEqual(matching(index, "region:americas"), [6, 7]);
  assert.deepEqual(matching(index, "region:latam"), [6, 7]);
});
