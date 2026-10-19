import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-inbox-loading-"));
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
  name: "Fixture careers",
  type: "ashby",
  identifier: "loading-fixture",
  enabled: false,
  requestLimit: 1,
});
store.ingestJob(source, {
  sourceItemId: "one",
  title: "Product Engineer",
  company: "Example",
  location: "Malaysia",
  arrangement: "Remote",
  salary: "",
  employmentType: "FullTime",
  url: "https://example.com/job",
  description: "Build accessible React and TypeScript product experiences.",
  publishedAt: store.now(),
  kind: "opening",
});
const { app } = await import("../server/index.ts");
const origin = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
const revisions: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (new URL(request.url()).pathname === "/api/jobs")
    revisions.push(request.headers()["x-jobs-revision"] || "");
});
await page.route("**/*", (route) =>
  new URL(route.request().url()).origin === origin
    ? route.continue()
    : route.abort(),
);
const evidence = resolve(".local-data/verification/inbox-performance");
mkdirSync(evidence, { recursive: true });
let release!: () => void;
const gate = new Promise<void>((r) => {
  release = r;
});
await page.route("**/api/jobs?*", async (route) => {
  await gate;
  await route.abort().catch(() => {});
});
try {
  await page.goto(origin + "/#jobs");
  await page.getByText("Loading jobs…", { exact: true }).first().waitFor();
  await page
    .getByText("Jobs unavailable", { exact: true })
    .waitFor({ timeout: 20000 });
  await page
    .getByRole("alert")
    .getByText("The request timed out. Retry to load the latest data.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByText("Loading jobs…", { exact: true }).count(),
    0,
  );
  await page.screenshot({ path: join(evidence, "timeout.png") });
  release();
  await page.unroute("**/api/jobs?*");
  await page
    .getByRole("alert")
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  await page.locator(".job-title").first().waitFor();
  assert.equal(
    await page.getByText("Jobs unavailable", { exact: true }).count(),
    0,
  );
  await page
    .getByRole("textbox", { name: "Search jobs", exact: true })
    .fill("No matching fixture");
  await page
    .getByText("No jobs match these filters.", { exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  assert.ok(
    revisions.length > 0 &&
      revisions.every((revision) => /^\d+:\d+$/.test(revision)),
  );
  writeFileSync(
    join(evidence, "loading-results.json"),
    JSON.stringify(
      {
        passed: true,
        checks: [
          "Real 15-second deadline shows timeout and Jobs unavailable",
          "No Loading jobs text remains after failure",
          "Retry recovers results",
          "Empty results remain distinct",
          "No browser exceptions",
          "Job requests carry the bootstrap revision",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Inbox loading/timeout/retry/empty checks passed");
} finally {
  release();
  await browser.close();
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
