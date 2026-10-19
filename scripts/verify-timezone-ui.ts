import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-timezone-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = resolve("tests/fixtures/profile.json");
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
store.putSetting("app", {
  ...store.getSettings(),
  scheduleEnabled: false,
  aiEnabled: false,
});
const source = store.addSource({
  name: "Timezone fixtures",
  type: "ashby",
  identifier: "timezone-fixtures",
  enabled: false,
  requestLimit: 1,
});
for (const location of ["Malaysia", "Nepal", "United States", "Worldwide"]) {
  const job = store.ingestJob(source, {
    sourceItemId: location,
    title: `Engineer ${location}`,
    company: `Example ${location}`,
    location,
    arrangement: "Remote",
    salary: "",
    employmentType: "FullTime",
    url: `https://example.com/${encodeURIComponent(location)}`,
    description: "Build accessible React and TypeScript product experiences.",
    publishedAt: store.now(),
    kind: "opening",
  }).job;
  store.writeJob({ ...job, status: "saved", savedAt: store.now() });
}
const { app } = await import("../server/index.ts");
const origin = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", (r) =>
  new URL(r.request().url()).origin === origin ? r.continue() : r.abort(),
);
const evidence = resolve(".local-data/verification/timezone-labels");
mkdirSync(evidence, { recursive: true });
try {
  await page.goto(origin + "/#jobs");
  await page.locator(".job-title").first().waitFor();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Timezone", exact: true });
  await trigger.click();
  const min = page.getByRole("slider", { name: "Minimum UTC offset" }),
    max = page.getByRole("slider", { name: "Maximum UTC offset" });
  const offset = page.getByRole("slider", { name: "Timezone window offset" });
  assert.equal(await page.getByRole("slider").count(), 3);
  assert.equal(await offset.isEnabled(), true);
  const countryMatches = (code: string) =>
    page
      .locator(`.timezone-map [data-country="${code}"]`)
      .first()
      .getAttribute("data-matches");
  await page.locator(".timezone-map svg").waitFor();
  const thumb = await page.locator(".timezone-thumb").first().boundingBox();
  assert.ok(thumb);
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
  await page.mouse.down();
  await page.mouse.move(thumb.x + 70, thumb.y + thumb.height / 2, { steps: 5 });
  await page.mouse.up();
  assert.ok(Number(await min.getAttribute("aria-valuenow")) > -720);
  await min.focus();
  await min.press("Home");
  for (let i = 0; i < 17; i++) await min.press("PageUp");
  for (let i = 0; i < 3; i++) await min.press("ArrowRight");
  await max.press("End");
  for (let i = 0; i < 6; i++) await max.press("PageDown");
  assert.equal(await min.getAttribute("aria-valuetext"), "UTC+05:45");
  assert.equal(await max.getAttribute("aria-valuetext"), "UTC+08:00");
  await page.waitForFunction(
    () => document.querySelectorAll(".job-title").length === 2,
  );
  assert.equal(await countryMatches("MY"), "true");
  assert.equal(await countryMatches("NP"), "true");
  assert.equal(await countryMatches("US"), "false");
  assert.equal(await countryMatches("SG"), "true");
  assert.equal(await offset.isEnabled(), true);
  const offsetThumb = await page
    .locator(".timezone-thumb")
    .last()
    .boundingBox();
  assert.ok(offsetThumb);
  await page.mouse.move(
    offsetThumb.x + offsetThumb.width / 2,
    offsetThumb.y + offsetThumb.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    offsetThumb.x - 35,
    offsetThumb.y + offsetThumb.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  const pointerOffset = Number(await offset.getAttribute("aria-valuenow"));
  assert.ok(pointerOffset < 0);
  assert.equal(
    Number(await max.getAttribute("aria-valuenow")) -
      Number(await min.getAttribute("aria-valuenow")),
    135,
  );
  for (let i = pointerOffset; i < 0; i += 15) await offset.press("ArrowRight");
  await offset.press("PageUp");
  assert.deepEqual(
    await page
      .locator(".timezone-values")
      .first()
      .locator("span")
      .allTextContents(),
    ["UTC+06:45", "UTC+09:00"],
  );
  assert.equal(await min.getAttribute("aria-valuetext"), "UTC+06:45");
  assert.equal(await max.getAttribute("aria-valuetext"), "UTC+09:00");
  assert.equal(await min.getAttribute("aria-valuenow"), "345");
  assert.equal(await max.getAttribute("aria-valuenow"), "480");
  assert.equal(await countryMatches("NP"), "false");
  assert.equal(await countryMatches("MY"), "true");
  await page.waitForFunction(
    () => document.querySelectorAll(".job-title").length === 1,
  );
  await offset.press("Home");
  assert.deepEqual(
    await page
      .locator(".timezone-values")
      .first()
      .locator("span")
      .allTextContents(),
    ["UTC−06:15", "UTC−04:00"],
  );
  assert.equal(await min.getAttribute("aria-valuenow"), "345");
  assert.equal(await max.getAttribute("aria-valuenow"), "480");
  assert.equal(await countryMatches("US"), "true");
  assert.equal(await countryMatches("MY"), "false");
  const leftTransform = await page
    .locator(".timezone-map-world > g")
    .first()
    .getAttribute("transform");
  assert.equal(leftTransform, "translate(-360 0)");
  await offset.press("End");
  assert.equal(await min.getAttribute("aria-valuenow"), "345");
  assert.equal(await max.getAttribute("aria-valuenow"), "480");
  assert.equal(await countryMatches("US"), "true");
  assert.equal(
    await page
      .locator(".timezone-map-world > g")
      .first()
      .getAttribute("transform"),
    leftTransform,
  );
  await page.waitForFunction(
    () => document.querySelectorAll(".job-title").length === 1,
  );
  await page.screenshot({
    animations: "disabled",
    path: join(evidence, "wrapped.png"),
  });
  for (let i = 0; i < 11; i++) await offset.press("PageDown");
  assert.equal(await offset.getAttribute("aria-valuenow"), "60");
  assert.equal(await countryMatches("MY"), "true");
  assert.equal(await countryMatches("US"), "false");
  await page.waitForFunction(
    () => document.querySelectorAll(".job-title").length === 1,
  );
  await page.screenshot({
    animations: "disabled",
    path: join(evidence, "desktop.png"),
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({
    animations: "disabled",
    path: join(evidence, "dark.png"),
  });
  await max.press("Escape");
  await trigger.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Timezone",
  );
  await page.reload();
  await page.locator(".job-title").first().waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".job-title").length === 1,
  );
  await page.getByRole("button", { name: /^Filters/ }).click();
  assert.match((await trigger.textContent()) || "", /06:45.*09:00/);
  await page
    .locator(".navigation")
    .getByRole("button", { name: "Saved", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".job-title").length === 1,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  if (!(await trigger.isVisible()))
    await page.getByRole("button", { name: /^Filters/ }).click();
  await trigger.click();
  await page.locator(".timezone-map svg").waitFor();
  const popup = page.locator(".timezone-options");
  const box = await popup.boundingBox();
  assert.ok(
    box &&
      box.x >= 0 &&
      box.x + box.width <= 391 &&
      box.y >= 0 &&
      box.y + box.height <= 845,
  );
  assert.equal(await offset.getAttribute("aria-valuenow"), "60");
  await page.screenshot({
    animations: "disabled",
    path: join(evidence, "mobile.png"),
  });
  await page
    .getByRole("button", { name: "Clear timezone", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".job-title").length === 4,
  );
  assert.match((await trigger.textContent()) || "", /Any timezone/);
  assert.equal(await offset.isEnabled(), true);
  let failMap = true;
  await page.route("**/api/job-locations", (route) =>
    failMap
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Fixture failure" }),
        })
      : route.continue(),
  );
  await page.reload();
  await page.locator(".job-title").first().waitFor();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await trigger.click();
  const retryMap = page.getByRole("button", { name: "Retry map", exact: true });
  await retryMap.waitFor();
  assert.equal(await page.locator(".timezone-map svg").count(), 0);
  failMap = false;
  await retryMap.click();
  await page.locator(".timezone-map svg").waitFor();
  assert.deepEqual(errors, []);
  writeFileSync(
    join(evidence, "results.json"),
    JSON.stringify(
      {
        passed: true,
        checks: [
          "two range handles and one keyboard-accessible offset slider",
          "effective endpoint labels, trigger and accessible value text include rotation",
          "effective labels wrap at UTC limits without moving handle coordinates",
          "full-range offset remains available for map rotation",
          "map highlights Malaysia, Nepal, Singapore but excludes US for selected range",
          "offset updates map and jobs while keeping both selected endpoint values fixed",
          "full-turn endpoints produce identical map transforms and country matches",
          "pointer offset rotates the map without moving range handles",
          "map failure hides stale highlights and Retry map recovers",
          "light and dark appearance",
          "pointer dragging updates the range",
          "quarter-hour offsets and inclusive range",
          "country filtering excludes Worldwide without a country",
          "Escape returns focus",
          "range and independent offset persist after reload and in Saved",
          "mobile popup stays in viewport",
          "clear restores all jobs",
          "no browser errors",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Timezone browser checks passed");
} finally {
  await browser.close();
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
