import assert from "node:assert/strict";
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
// Do not mark the user's real postings viewed during browser verification.
await page.route("**/api/jobs/*/seen", (route) =>
  route.fulfill({ json: { seenAt: new Date().toISOString() } }),
);
try {
  await page.goto("http://127.0.0.1:2839/#jobs");
  await page.getByPlaceholder("Search jobs").waitFor();
  const choose = async (label: string, value: string) => {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: value, exact: true }).click();
  };
  await page.getByPlaceholder("Search jobs").fill("Valkyrie Aero");
  await page.getByText("No jobs match these filters.").waitFor();
  await choose("Eligibility", "Incompatible");
  await page
    .getByRole("button", {
      name: "Software Engineer, Frontend (HMI)",
      exact: true,
    })
    .click();
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page
    .getByRole("heading", { name: "Eligibility: Incompatible" })
    .waitFor();
  assert.match(await page.locator(".detail-body").innerText(), /citizen/i);
  await page.screenshot({
    path: ".local-data/verification/matching-eligibility.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByPlaceholder("Search jobs").waitFor();
  assert.match(
    await page
      .getByRole("combobox", { name: "Eligibility", exact: true })
      .innerText(),
    /Incompatible/,
  );
  await choose("Eligibility", "Any eligibility");
  await page
    .getByPlaceholder("Search jobs")
    .fill("Full-Stack Developer (Python, React, AI)");
  await page
    .getByRole("button", {
      name: "Full-Stack Developer (Python, React, AI)",
      exact: true,
    })
    .first()
    .waitFor();
  const grouped = await page
    .getByRole("button", {
      name: "Full-Stack Developer (Python, React, AI)",
      exact: true,
    })
    .count();
  await page
    .getByRole("button", {
      name: "Full-Stack Developer (Python, React, AI)",
      exact: true,
    })
    .first()
    .click();
  await page.getByText(/Other listings \(\d+\)/).click();
  assert.ok((await page.locator(".listing-sources a").count()) > 0);
  await page.screenshot({
    path: ".local-data/verification/matching-duplicates.png",
    fullPage: true,
  });
  await choose("Duplicate listings", "Show duplicates");
  await page.waitForFunction(
    (count) =>
      Array.from(document.querySelectorAll(".job-title")).filter(
        (row) => row.textContent === "Full-Stack Developer (Python, React, AI)",
      ).length > count,
    grouped,
  );
  const ungrouped = await page
    .getByRole("button", {
      name: "Full-Stack Developer (Python, React, AI)",
      exact: true,
    })
    .count();
  assert.ok(ungrouped > grouped, `${ungrouped} > ${grouped}`);
  await page.getByPlaceholder("Search jobs").fill("Laioutr");
  await page
    .getByRole("button", { name: /AI Engineer.*Full Stack/ })
    .first()
    .click();
  await page
    .locator(".detail-body")
    .getByText(/excerpt|hiring post/i)
    .first()
    .waitFor();
  assert.match(
    await page.locator(".detail-body").innerText(),
    /excerpt|hiring post/i,
  );
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  assert.match(
    await page.locator(".detail-body").innerText(),
    /provisional|incomplete/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".local-data/verification/matching-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.getByRole("button", { name: "Back to jobs", exact: true }).click();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.screenshot({
    path: ".local-data/verification/matching-mobile-list.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  writeFileSync(
    ".local-data/verification/matching-browser.json",
    JSON.stringify(
      {
        passed: true,
        grouped,
        ungrouped,
        consoleErrors: errors,
        checks: [
          "eligibility filter",
          "restriction evidence",
          "reload persistence",
          "duplicate grouping",
          "source links",
          "description quality",
          "mobile overflow",
        ],
      },
      null,
      2,
    ),
  );
  console.log({ passed: true, grouped, ungrouped });
} finally {
  await browser.close();
}
