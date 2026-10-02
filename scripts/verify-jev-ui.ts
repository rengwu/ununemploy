import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
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
const { processJevJob } = await import("../core/jev/service.ts");
const { app } = await import("../server/index.ts");
store.putSetting("app", {
  ...store.getSettings(),
  scheduleEnabled: false,
  aiEnabled: false,
});
const source = store.addSource({
  name: "Jev test board",
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
  await page.goto(`${origin}/#settings`);
  await page.reload();
  await page.getByLabel("Jev API key", { exact: true }).fill("fixture-key");
  await page.getByRole("button", { name: "Save API key", exact: true }).click();
  await page.getByLabel("Replace Jev API key", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Replace Jev API key", { exact: true }).inputValue(),
    "",
  );
  await page.getByLabel("Jev requests per day (UTC)").fill("25");
  await page.getByRole("button", { name: "Save Jev limit" }).click();
  await page.getByRole("button", { name: "Pause Jev" }).waitFor();
  await page.screenshot({
    path: join(output, "jev-settings-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pause Jev" }).click();
  await page.getByRole("button", { name: "Enable Jev" }).waitFor();
  await page.getByRole("button", { name: "Enable Jev" }).click();
  await page.getByRole("button", { name: "Pause Jev" }).waitFor();
  await page.goto(`${origin}/#jobs`);
  await page.reload();
  await page
    .getByRole("button", { name: "Frontend Engineer", exact: true })
    .click();
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByRole("button", { name: "Assess with Jev" }).click();
  await page.getByText("Queued for Jev assessment.").waitFor();
  await processJevJob(async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    const answers = Object.fromEntries(
      Object.entries(
        body.questions as Record<string, { criteria: Record<string, string> }>,
      ).map(([key, q]) => {
        const options = Object.keys(q.criteria);
        const evidenceKey = (needle: string) =>
          Object.entries(q.criteria).find(([, s]) => s.includes(needle))?.[0] ||
          "unknown";
        const choice =
          key === "match"
            ? "strong"
            : key === "arrangement"
              ? "hybrid"
              : key === "sponsorship"
                ? "available"
                : key === "eligibility"
                  ? "review"
                  : key === "location_evidence" ||
                      key === "arrangement_evidence"
                    ? evidenceKey("Berlin office")
                    : key === "sponsorship_evidence"
                      ? evidenceKey("Visa sponsorship")
                      : key.startsWith("place_")
                        ? "workplace"
                        : "unknown";
        return [
          key,
          {
            type: "choice",
            choice,
            confidence: 0.99,
            probabilities: Object.fromEntries(
              options.map((o) => [
                o,
                o === choice ? 0.99 : 0.01 / (options.length - 1),
              ]),
            ),
          },
        ];
      }),
    );
    return Response.json({
      model: "jev-1.13.0",
      answers,
      usage: { input_tokens: 600, output_tokens: 150 },
    });
  });
  await page
    .getByText("Hybrid · 99% model confidence", { exact: true })
    .waitFor();
  await page
    .getByText("Offered · 99% model confidence", { exact: true })
    .waitFor();
  assert.match(
    await page.locator(".detail-body").innerText(),
    /Berlin office three days/,
  );
  assert.match(
    await page.locator(".detail-body").innerText(),
    /Original arrangement/,
  );
  await page.screenshot({
    path: join(output, "jev-assessment-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(output, "jev-assessment-mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.goto(`${origin}/#settings`);
  await page.reload();
  await page
    .getByRole("heading", { name: "Jev", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(output, "jev-settings-mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("button", { name: "Remove API key" }).click();
  await page.getByLabel("Jev API key", { exact: true }).waitFor();
  await page.goto(`${origin}/#jobs`);
  await page.reload();
  await page
    .getByRole("button", { name: "Frontend Engineer", exact: true })
    .click();
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  assert.equal(
    await page.getByRole("heading", { name: "Jev assessment" }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Jev settings, queue, assessment evidence, desktop/mobile layout and key removal passed with isolated fixture data and simulated inference.",
  );
} finally {
  await browser.close();
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
