import { connectPiFixture } from "./pi-test-auth.ts";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const real = process.argv.includes("--real-generation");
const output = resolve(".local-data/verification");
mkdirSync(output, { recursive: true });
const directory = mkdtempSync(
  join(tmpdir(), "ununemploy-cover-letter-workflow-"),
);
process.env.JH_PROFILE_SEED = resolve("tests/fixtures/profile.json");
process.env.JH_DATA_DIR = directory;
process.env.JH_TEST_SERVER = "1";
process.env.JH_SCHEDULE_ENABLED = "false";
const store = await import("../core/db/index.ts");
const { validateGeneration } = await import("../core/ai/generate.ts");
const { fromProfile } = await import("../core/cv/render.ts");
const { defaultCoverLetterTemplate } =
  await import("../core/cover-letter/template.ts");
const { processCoverLetterTask } = await import("../core/ai/generate.ts");
store.putSetting("app", {
  ...store.getSettings(),
  scheduleEnabled: false,
  aiEnabled: true,
});
for (const source of store.listSources())
  store.saveSource({ ...source, enabled: false });
const source = store.addSource({
  name: "Workflow fixture",
  type: "ashby",
  identifier: "workflow-fixture",
  enabled: false,
  requestLimit: 1,
});
const job = store.ingestJob(source, {
  sourceItemId: "workflow-job",
  title: "Product Engineer",
  company: "Example company",
  url: "https://example.com/workflow-fixture",
  description:
    "Build practical developer tools with TypeScript and React. Collaborate with engineers on product quality and accessible web experiences.",
  descriptionQuality: "full",
  location: "Worldwide",
  arrangement: "Remote",
  salary: "",
  employmentType: "FullTime",
  publishedAt: store.now(),
  kind: "opening",
}).job;
const originalProfile = JSON.stringify(store.getProfile());
const legacy = store.saveCv({
  jobId: job.id,
  kind: "edited",
  document: fromProfile(store.getProfile()),
  template: store.getTemplate(),
  profileRevision: store.getProfile().revision,
  reviewNotes: [],
  evidence: null,
  parentId: null,
});
const originalLegacy = JSON.stringify(legacy);
const { app } = await import("../server/index.ts");
const origin = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
page.setDefaultTimeout(20000);
const errors: string[] = [],
  external: string[] = [],
  checks: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.origin === origin) return route.continue();
  external.push(url.origin);
  return route.abort();
});
const step = (name: string) => {
  checks.push(name);
  console.log(name);
};
const bodyField = page.getByRole("textbox", {
  name: "Letter body",
  exact: true,
});
const setBody = (value: string) => bodyField.fill(value);
const chooseVersion = async (version: number) => {
  await page
    .getByRole("combobox", { name: "Cover letter version", exact: true })
    .click();
  await page
    .getByRole("option", { name: new RegExp(`^Version ${version} ·`) })
    .click();
};
try {
  await page.goto(origin);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/jobs/${job.id}`) &&
        response.request().method() === "PATCH",
    ),
    page.getByRole("button", { name: "Save", exact: true }).click(),
  ]);
  const task = store.listTasks().find((t) => t.jobId === job.id)!;
  assert.ok(task);
  assert.equal(store.getJob(job.id)?.status, "saved");
  step("Save queues a private cover-letter task");
  await page.getByRole("tab", { name: "Cover letter", exact: true }).click();
  await page
    .getByText("Cover letter generation queued.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Generate CV", exact: true })
      .count(),
    0,
  );
  store.saveTask({
    ...task,
    state: "failed",
    error: "Temporary verification failure. Retry to continue.",
    updatedAt: store.now(),
  });
  await page
    .getByText("Temporary verification failure. Retry to continue.", {
      exact: true,
    })
    .waitFor();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tasks/${task.id}/retry`) &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Retry", exact: true }).click(),
  ]);
  assert.equal(
    store.listTasks().find((t) => t.id === task.id)?.state,
    "queued",
  );
  step("Generation failure is visible and Retry requeues the task");
  if (real) {
    await connectPiFixture();
    console.log(
      "Running Pi ChatGPT subscription generation (gpt-5.6-sol, high)…",
    );
    await processCoverLetterTask();
    const completed = store.listTasks().find((t) => t.id === task.id)!;
    assert.equal(
      completed.state,
      "complete",
      completed.error || "Generation did not complete",
    );
  } else {
    const cv = store.saveCoverLetter({
      jobId: job.id,
      kind: "generated",
      document: validateGeneration(
        {
          paragraphs: [
            {
              text: "I am interested in this role because it connects product engineering with practical AI tooling.",
              evidenceIds: ["job"],
            },
            {
              text: store.getProfile().basics.summary,
              evidenceIds: ["profile-summary"],
            },
            {
              text: "I would welcome a conversation about the work and the experience I could contribute.",
              evidenceIds: ["job"],
            },
          ],
          reviewNotes: [],
        },
        store.getProfile(),
        job,
      ).document,
      template: defaultCoverLetterTemplate,
      profileRevision: store.getProfile().revision,
      reviewNotes: [],
      evidence: null,
      parentId: null,
    });
    store.saveTask({
      ...task,
      state: "complete",
      error: null,
      resultId: cv.id,
      updatedAt: store.now(),
    });
  }
  await bodyField.waitFor();
  const first = store.listCoverLetterVersions(job.id)[0];
  writeFileSync(
    join(output, `cover-letter-draft-${real ? "real" : "fixture"}.json`),
    JSON.stringify(first, null, 2),
  );
  assert.equal(first.version, 1);
  step(
    real
      ? "Real Codex generation appears in the cover-letter editor"
      : "Fixture generation appears in the cover-letter editor",
  );

  await setBody("First paragraph.\nLine two.\n\n");
  assert.equal(await bodyField.inputValue(), "First paragraph.\nLine two.\n\n");
  await bodyField.press("End");
  await page.keyboard.insertText("Second paragraph.");
  assert.equal(
    await bodyField.inputValue(),
    "First paragraph.\nLine two.\n\nSecond paragraph.",
  );
  await page
    .frameLocator('iframe[title="Cover letter preview"]')
    .locator("main p")
    .nth(1)
    .getByText("Second paragraph.", { exact: true })
    .waitFor();
  step("Plain-text typing preserves line breaks and paragraph breaks");

  await page.getByText("Contact details", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Contact 1 link", exact: true })
    .fill("");
  await page.getByText("Contact details", { exact: true }).click();
  const edit = {
    ...first.document,
    paragraphs: [
      "Workflow verification: this manual edit must survive refreshes and failed saves.",
    ],
  };
  await setBody(edit.paragraphs.join("\n\n"));
  await page
    .frameLocator('iframe[title="Cover letter preview"]')
    .getByText(edit.paragraphs[0], { exact: true })
    .waitFor();
  await page.waitForTimeout(8500);
  await page
    .frameLocator('iframe[title="Cover letter preview"]')
    .getByText(edit.paragraphs[0], { exact: true })
    .waitFor();
  await page.route("**/api/cover-letters/*/versions", (route) =>
    route.fulfill({ status: 503, json: { error: "Temporary save failure" } }),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Temporary save failure", { exact: true }).waitFor();
  await page.getByText("Unsaved changes", { exact: true }).waitFor();
  assert.equal(store.listCoverLetterVersions(job.id).length, 1);
  await page.unroute("**/api/cover-letters/*/versions");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Unsaved changes"),
  );
  assert.equal(
    store.listCoverLetterVersions(job.id)[0].document.paragraphs[0],
    edit.paragraphs[0],
  );
  assert.equal(
    store.listCoverLetterVersions(job.id)[0].document.contacts[0].url,
    undefined,
  );
  step(
    "Editing, live preview, refresh preservation, failed save, and successful retry",
  );

  await setBody("Unsaved second edit");
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page
    .frameLocator('iframe[title="Cover letter preview"]')
    .getByText("Unsaved second edit", { exact: true })
    .waitFor();
  await page.getByRole("tab", { name: "Description", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Discard unsaved changes?" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page
    .frameLocator('iframe[title="Cover letter preview"]')
    .getByText("Unsaved second edit", { exact: true })
    .waitFor();
  await chooseVersion(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page
    .frameLocator('iframe[title="Cover letter preview"]')
    .getByText("Unsaved second edit", { exact: true })
    .waitFor();
  await chooseVersion(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore version", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].some(
        (b) => b.textContent === "Restore version",
      ),
  );
  const restored = store.listCoverLetterVersions(job.id);
  assert.equal(restored.length, 3);
  assert.deepEqual(restored[0].document, first.document);
  assert.deepEqual(restored[0].template, first.template);
  assert.equal(restored[1].document.paragraphs[0], edit.paragraphs[0]);
  assert.equal(restored[0].parentId, first.id);
  step("Unsaved navigation guards and restoration as a new immutable version");

  // Exercise load failure separately from preview/save errors.
  await page.route("**/api/cover-letters?jobId=**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Temporary cover letter load failure" },
    }),
  );
  await chooseVersion(2);
  await page
    .getByText("Temporary cover letter load failure", { exact: true })
    .waitFor();
  await page.unroute("**/api/cover-letters?jobId=**");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page
    .getByRole("button", { name: "Restore version", exact: true })
    .waitFor();
  await chooseVersion(3);
  step("Failed cover letter loads can retry");
  assert.equal(
    await page
      .getByRole("tab", { name: /Data.json|Template.html|Styles.css/ })
      .count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Download DOCX" }).count(),
    0,
  );
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy text", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Copied" }).waitFor();
  const { coverLetterText } = await import("../core/cover-letter/template.ts");
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    coverLetterText(first.document),
  );
  step("Copy text places the complete plain-text letter on the clipboard");

  await page.route("**/api/cover-letters/export", (route) =>
    route.fulfill({ status: 503, json: { error: "Temporary export failure" } }),
  );
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await page.getByText("Temporary export failure", { exact: true }).waitFor();
  await page.unroute("**/api/cover-letters/export");
  for (const format of ["PDF"]) {
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: `Download ${format}`, exact: true })
      .click();
    const file = await download;
    const path = join(
      output,
      `cover-letter-workflow-${real ? "real" : "fixture"}.${format.toLowerCase()}`,
    );
    await file.saveAs(path);
    const bytes = readFileSync(path);
    assert.ok(bytes.byteLength > 1000);
    assert.equal(
      bytes.subarray(0, format === "PDF" ? 4 : 2).toString(),
      format === "PDF" ? "%PDF" : "PK",
    );
  }
  step("Export failure preserves the draft; PDF download succeeds");
  await page.getByRole("button", { name: "CV", exact: true }).click();
  await page.locator(".latex-editor").waitFor();
  assert.equal(
    await page.getByRole("tab", { name: "Data and HTML", exact: true }).count(),
    0,
  );
  assert.equal(JSON.stringify(store.getCv(legacy.id)), originalLegacy);
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await page.getByRole("tab", { name: "Cover letter", exact: true }).click();

  await page
    .frameLocator('iframe[title="Cover letter preview"]')
    .getByText(first.document.paragraphs[0], { exact: true })
    .waitFor();
  assert.equal(store.listTasks().length, 1);
  step(
    "Legacy records stay stored; CV is LaTeX only and the job tab opens the cover letter without regenerating",
  );
  await bodyField.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(
      output,
      `cover-letter-workflow-${real ? "real" : "fixture"}.png`,
    ),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await bodyField.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(
      output,
      `cover-letter-workflow-${real ? "real" : "fixture"}-mobile.png`,
    ),
  });
  await page.reload();
  await bodyField.waitFor();
  await page
    .frameLocator('iframe[title="Cover letter preview"]')
    .getByText(first.document.paragraphs[0], { exact: true })
    .waitFor();
  assert.match(
    await page
      .getByRole("combobox", { name: "Cover letter version", exact: true })
      .innerText(),
    /Version 3/,
  );
  assert.equal(JSON.stringify(store.getProfile()), originalProfile);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  step(
    "Mobile/reload checks preserve restored content and master facts; no external browser requests",
  );
  writeFileSync(
    join(output, `cover-letter-workflow-${real ? "real" : "fixture"}.json`),
    JSON.stringify(
      {
        passed: true,
        realGeneration: real,
        checks,
        errors,
        external,
        versions: store.listCoverLetterVersions(job.id).length,
        masterUnchanged: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page
    .screenshot({ path: join(output, "workflow-failure.png") })
    .catch(() => {});
  writeFileSync(
    join(output, "cover-letter-workflow-failure.json"),
    JSON.stringify(
      { realGeneration: real, checks, error: String(error), errors, external },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
