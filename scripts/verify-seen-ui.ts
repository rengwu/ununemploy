import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-seen-ui-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = new URL(
  "../tests/fixtures/profile.json",
  import.meta.url,
).pathname;
process.env.JH_TEST_SERVER = "1";
process.env.JH_SCHEDULE_ENABLED = "false";
const store = await import("../core/db/index.ts");
for (const source of store.listSources())
  store.saveSource({ ...source, enabled: false });
const source = store.addSource({
  name: "Seen fixture",
  type: "ashby",
  identifier: "seen-ui",
  enabled: false,
  requestLimit: 1,
});
const jobs = [
  "Frontend Engineer",
  "Product Engineer",
  "Developer Tools Engineer",
].map(
  (title, i) =>
    store.ingestJob(source, {
      sourceItemId: String(i),
      title,
      company: "Example",
      url: `https://example.com/seen-${i}`,
      description:
        "Build React and TypeScript product experiences for web and native interfaces. Collaborate with product designers and develop coding tools.",
      location: "Singapore",
      arrangement: "Remote",
      salary: "",
      employmentType: "FullTime",
      publishedAt: store.now(),
      kind: "opening",
    }).job,
);
const { app } = await import("../server/index.ts");
const origin = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(15000);
const revealFilters = async () => {
  const toggle = page.getByRole("button", { name: /^Filters(?: · Active)?$/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
};
const chooseSeen = async (value: string) => {
  await revealFilters();
  await page
    .getByRole("combobox", { name: "Seen status", exact: true })
    .click();
  await page.getByRole("option", { name: value, exact: true }).click();
};
try {
  await page.goto(origin);
  await page.locator(".job-title").first().waitFor();
  await page.locator(".detail-header h2").waitFor();
  assert.ok(
    jobs.every((job) => !store.getJob(job.id)?.seenAt),
    "Default preview does not mark seen",
  );
  await chooseSeen("Unseen");
  const target = jobs[1];
  const marked = page.waitForResponse(
    (r) => r.url() === `${origin}/api/jobs/${target.id}/seen`,
  );
  await page
    .getByRole("row")
    .filter({
      has: page.getByRole("button", { name: target.title, exact: true }),
    })
    .locator(".company-line")
    .click();
  assert.equal((await marked).status(), 200);
  await page
    .getByRole("heading", { name: target.title, exact: true })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".job-title").length === 2,
  );
  assert.equal(
    await page.locator(".detail-header h2").innerText(),
    target.title,
  );
  assert.ok(store.getJob(target.id)?.seenAt);
  assert.equal(store.getJob(target.id)?.status, "new");
  assert.equal(store.listTasks().length, 0);
  await chooseSeen("Seen and unseen");
  await page.getByRole("button", { name: target.title, exact: true }).click();
  await page.locator(".selected-row .job-seen").waitFor();
  const styles = await page
    .locator(".selected-row td")
    .first()
    .evaluate((el) => ({
      background: getComputedStyle(el.closest("tr")!).backgroundColor,
      marker: getComputedStyle(el).boxShadow,
    }));
  assert.match(styles.marker, /inset/);
  assert.notEqual(styles.background, "rgba(0, 0, 0, 0)");
  await page.screenshot({
    path: ".local-data/verification/seen-selected-light.png",
  });
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-mode", "dark"),
  );
  await page.screenshot({
    path: ".local-data/verification/seen-selected-dark.png",
  });
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-mode", "light"),
  );
  await chooseSeen("Seen");
  await page.waitForFunction(
    () => document.querySelectorAll(".job-title").length === 1,
  );
  await page.reload();
  await page.locator(".job-seen").waitFor();
  await revealFilters();
  assert.match(
    await page
      .getByRole("combobox", { name: "Seen status", exact: true })
      .innerText(),
    /^Seen$/,
  );
  assert.equal(await page.locator(".job-title").innerText(), target.title);
  await chooseSeen("Unseen");
  await page.locator(".job-title").first().waitFor();
  const failedTarget = jobs[0];
  await page.route(`**/api/jobs/${failedTarget.id}/seen`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Seen verification failure" },
    }),
  );
  await page
    .getByRole("button", { name: failedTarget.title, exact: true })
    .click();
  await page.getByText("Seen verification failure", { exact: true }).waitFor();
  assert.equal(store.getJob(failedTarget.id)?.seenAt, undefined);
  await page.unroute(`**/api/jobs/${failedTarget.id}/seen`);
  const retry = page.waitForResponse(
    (r) => r.url() === `${origin}/api/jobs/${failedTarget.id}/seen`,
  );
  await page
    .getByRole("button", { name: failedTarget.title, exact: true })
    .press("Enter");
  assert.equal((await retry).status(), 200);
  await page.waitForFunction(
    () => document.querySelectorAll(".job-title").length === 1,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  assert.equal(
    await page.locator(".detail-header h2").innerText(),
    failedTarget.title,
  );
  await page.screenshot({ path: ".local-data/verification/seen-mobile.png" });
  await page.getByRole("button", { name: "Back to jobs", exact: true }).click();
  assert.equal(await page.locator(".job-title").count(), 1);
  const lastTarget = jobs[2];
  await page.locator(".job-location").click();
  await page
    .getByRole("heading", { name: lastTarget.title, exact: true })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".job-title").length === 0,
  );
  assert.ok(store.getJob(lastTarget.id)?.seenAt);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await chooseSeen("Seen and unseen");
  await page.locator(".job-title").first().waitFor();
  for (const [index, selector] of [
    [0, ".job-location"],
    [1, ".match"],
    [0, ".job-date"],
    [1, "td"],
  ] as const) {
    const target = jobs[index];
    const row = page.getByRole("row").filter({
      has: page.getByRole("button", { name: target.title, exact: true }),
    });
    await row
      .locator(selector)
      .first()
      .click(selector === "td" ? { position: { x: 5, y: 5 } } : {});
    await page
      .getByRole("heading", { name: target.title, exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".selected-row .job-title").innerText(),
      target.title,
    );
  }
  await page
    .getByRole("button", { name: jobs[0].title, exact: true })
    .press("Space");
  await page
    .getByRole("heading", { name: jobs[0].title, exact: true })
    .waitFor();
  assert.equal(store.listTasks().length, 0);
  assert.ok(jobs.every((job) => store.getJob(job.id)?.status === "new"));
  // Seed Saved independently of the save/generation workflow.
  for (const job of jobs)
    store.writeJob({
      ...store.getJob(job.id)!,
      status: "saved",
      savedAt: store.now(),
    });
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  const savedRow = page.getByRole("row").filter({
    has: page.getByRole("button", { name: jobs[1].title, exact: true }),
  });
  await savedRow.locator(".job-location").click();
  await page
    .getByRole("heading", { name: jobs[1].title, exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".selected-row .job-title").innerText(),
    jobs[1].title,
  );
  assert.equal(store.listTasks().length, 0);
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    checks: [
      "automatic preview stays unseen",
      "company click persists seen without saving",
      "location, match, date and empty cell padding select the row",
      "unseen detail stays open",
      "seen filter and reload",
      "mutation failure/retry",
      "keyboard Enter and Space open",
      "light/dark selection marker",
      "mobile detail/list",
      "mobile location click opens details and records seen",
      "Saved row location selects details without queuing generation",
    ],
    errors,
    styles,
  };
  writeFileSync(
    ".local-data/verification/seen-browser.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  await browser.close();
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
