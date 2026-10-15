import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(15000);
try {
  await page.goto("http://127.0.0.1:2839/#jobs");
  await page.getByRole("button", { name: /^Filters(?: · Active)?$/ }).click();
  const trigger = page.getByRole("combobox", { name: "Location", exact: true });
  await trigger.click();
  await page.getByRole("option", { name: "APAC", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("option", { name: "AZ", exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("option", { name: "Bac Ninh, Vietnam", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("group", { name: "Southeast Asia", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page.getByRole("group", { name: "East Asia", exact: true }).count(),
    1,
  );
  await page.screenshot({
    path: ".local-data/verification/location-regions-menu.png",
  });
  const search = page.getByRole("combobox", {
    name: "Search locations",
    exact: true,
  });
  await search.fill("Kuala Lumpur");
  await page
    .getByRole("option", { name: "Kuala Lumpur, Malaysia", exact: true })
    .waitFor();
  await page.getByRole("option", { name: "Malaysia", exact: true }).waitFor();
  await page.screenshot({
    path: ".local-data/verification/location-regions-search.png",
  });
  await search.fill("Southeast Asia");
  const loaded = page.waitForResponse(
    (r) =>
      r.url().includes("/api/jobs?") &&
      decodeURIComponent(r.url()).includes("region:southeast-asia"),
  );
  await page
    .getByRole("option", { name: "All Southeast Asia", exact: true })
    .click();
  const result = await (await loaded).json();
  assert.ok(result.total > 0);
  await page.keyboard.press("Escape");
  assert.match(await trigger.innerText(), /Southeast Asia/);
  await page.reload();
  await page.getByRole("button", { name: /^Filters(?: · Active)?$/ }).click();
  await trigger.waitFor();
  assert.match(await trigger.innerText(), /Southeast Asia/);
  await trigger.click();
  await page
    .getByRole("button", { name: "Clear locations", exact: true })
    .click();
  await search.fill("Japan");
  await search.press("ArrowDown");
  await search.press("Enter");
  await page.keyboard.press("Escape");
  assert.match(await trigger.innerText(), /Japan/);
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await search.fill("East Asia");
  await page
    .getByRole("option", { name: "All East Asia", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("option", { name: "All Southeast Asia", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.screenshot({
    path: ".local-data/verification/location-regions-mobile.png",
  });
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    southeastAsiaResults: result.total,
    errors,
    checks: [
      "grouped regions/countries",
      "cities only in search",
      "city/country search",
      "regional filtering",
      "reload persistence",
      "keyboard selection",
      "mobile overflow",
    ],
  };
  writeFileSync(
    ".local-data/verification/location-regions-browser.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  await browser.close();
}
