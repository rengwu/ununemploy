import assert from "node:assert/strict";
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import type { JobPage } from "../core/api-types.ts";
const origin = process.env.JH_VERIFY_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [],
  requests: { path: string; status: number }[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  const path = new URL(response.url()).pathname;
  if (path.startsWith("/api/"))
    requests.push({ path, status: response.status() });
});
page.setDefaultTimeout(15000);
// Keep this live collection check read-only; actual Seen persistence has an isolated harness.
await page.route("**/api/jobs/*/seen", (route) =>
  route.fulfill({ json: { seenAt: new Date().toISOString() } }),
);
const search = page.getByPlaceholder("Search jobs");
try {
  await page.goto(`${origin}/#jobs`);
  await page.locator(".job-title").first().waitFor();
  assert.ok((await page.locator(".job-title").count()) <= 75);
  const firstPage = await page.locator(".job-title").allTextContents();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText(/Page 2 of/).waitFor();
  assert.notDeepEqual(
    await page.locator(".job-title").allTextContents(),
    firstPage,
  );
  const expected = (await (
    await page.request.get(`${origin}/api/jobs?query=LangChain`)
  ).json()) as JobPage;
  await search.fill("LangChain");
  await page.waitForFunction(
    (title) => document.querySelector(".job-title")?.textContent === title,
    expected.items[0].title,
  );
  assert.equal(await page.getByText(/Page 2 of/).count(), 0);
  await page.locator(".job-title").first().click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Job notes", exact: true })
    .fill("Unsaved browser verification note");
  await page.waitForTimeout(8500);
  assert.equal(
    await page
      .getByRole("textbox", { name: "Job notes", exact: true })
      .inputValue(),
    "Unsaved browser verification note",
  );
  assert.ok(
    requests.some((r) => r.path === "/api/bootstrap" && r.status === 304),
    "Unchanged status uses 304",
  );

  const sample = (await (
    await page.request.get(`${origin}/api/jobs?pageSize=1`)
  ).json()) as JobPage;
  let release: () => void = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/jobs?**", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("query") !==
      "delayed-query"
    )
      return route.continue();
    await delayed;
    await route
      .fulfill({
        json: {
          ...sample,
          items: [
            { ...sample.items[0], title: "Stale result must never appear" },
          ],
        },
      })
      .catch(() => {});
  });
  const slowRequest = page.waitForRequest((r) =>
    r.url().includes("query=delayed-query"),
  );
  await search.fill("delayed-query");
  await slowRequest;
  await search.fill("LangChain");
  await page.waitForFunction(
    (title) => document.querySelector(".job-title")?.textContent === title,
    expected.items[0].title,
  );
  release();
  await page.waitForTimeout(300);
  assert.equal(
    await page.getByText("Stale result must never appear").count(),
    0,
  );
  await page.unroute("**/api/jobs?**");

  await page.route("**/api/jobs?**", (route) =>
    new URL(route.request().url()).searchParams.get("query") === "invalid-json"
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"items":',
        })
      : route.continue(),
  );
  await search.fill("invalid-json");
  await page
    .getByText(
      "The server returned an incomplete or invalid response. Retry to load the latest data.",
    )
    .waitFor();
  await page.unroute("**/api/jobs?**");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByText("No jobs match these filters.").waitFor();
  await search.fill("");
  await page.locator(".job-title").first().waitFor();
  await page.screenshot({
    path: ".local-data/verification/dashboard-performance.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.screenshot({
    path: ".local-data/verification/dashboard-performance-mobile.png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "CV", exact: true }).click();
  await page.locator(".cm-editor").waitFor();
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Review status", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    errors,
    requests,
    checks: [
      "server pagination",
      "filter page reset",
      "conditional polling",
      "unsaved notes",
      "stale response cancellation",
      "invalid JSON retry",
      "mobile overflow",
      "CV/Sources/Settings/Saved navigation",
    ],
  };
  writeFileSync(
    ".local-data/verification/dashboard-browser.json",
    JSON.stringify(result, null, 2),
  );
  console.log({ passed: true, checks: result.checks });
} finally {
  await browser.close();
}
