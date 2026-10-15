import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-jev-ui-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = new URL(
  "../tests/fixtures/profile.json",
  import.meta.url,
).pathname;
process.env.JH_TEST_SERVER = "1";
process.env.JH_JEV_API_KEY = "";
const store = await import("../core/db/index.ts");
mkdirSync(join(directory, "secrets"), { recursive: true });
writeFileSync(
  join(directory, "secrets/jev.json"),
  JSON.stringify({ token: "retained-fixture-key" }),
  { mode: 0o600 },
);
store.putSetting("jevSettings", { enabled: true, dailyLimit: 200 });
const { app } = await import("../server/index.ts");
store.putSetting("app", {
  ...store.getSettings(),
  scheduleEnabled: false,
  aiEnabled: false,
});
const source = store.addSource({
  name: "Test board",
  type: "ashby",
  identifier: "test",
  enabled: false,
  requestLimit: 1,
});
store.ingestJob(source, {
  sourceItemId: "test",
  title: "Frontend Engineer",
  company: "Test employer",
  location: "Germany",
  arrangement: "Remote",
  employmentType: "FullTime",
  salary: "",
  url: "https://example.com/test-job",
  description:
    "Build customer products using React and TypeScript. Work from our Berlin office three days per week. Visa sponsorship is available for this role. We welcome applicants who relocate to Germany. Collaborate on frontend architecture and interface design with the engineering team.",
  descriptionQuality: "full",
  publishedAt: store.now(),
  kind: "opening",
});
const origin = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const output = resolve(".local-data/verification");
mkdirSync(output, { recursive: true });
try {
  for (const [size, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/#settings`);
    await page.reload();
    await page
      .getByRole("heading", { name: "Settings", exact: true })
      .waitFor();
    assert.doesNotMatch(
      await page.locator("body").innerText(),
      /jev|typesafe/i,
    );
    assert.equal(await page.getByLabel(/Jev/).count(), 0);
    await page.screenshot({
      path: join(output, `jev-retired-settings-${size}.png`),
      fullPage: true,
    });
    await page.goto(`${origin}/#jobs`);
    await page.reload();
    await page
      .getByRole("button", { name: "Frontend Engineer", exact: true })
      .click();
    await page.getByRole("tab", { name: "Match", exact: true }).click();
    assert.doesNotMatch(
      await page.locator("body").innerText(),
      /jev|typesafe/i,
    );
    assert.equal(await page.getByRole("button", { name: /Jev/ }).count(), 0);
    await page.screenshot({
      path: join(output, `jev-retired-match-${size}.png`),
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Jev retired: retained key and settings; no Jev settings, job actions or labels on desktop/mobile.",
  );
} finally {
  await browser.close();
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
