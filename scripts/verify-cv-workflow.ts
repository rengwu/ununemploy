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
import type { CvContext, JobPage } from "../core/api-types.ts";
import type { Job } from "../core/types.ts";

const real = process.argv.includes("--real-generation");
const output = resolve(".local-data/verification");
mkdirSync(output, { recursive: true });
const directory = mkdtempSync(
  join(tmpdir(), "ununemploy-cover-letter-workflow-"),
);
const live = process.env.JH_VERIFY_API || "http://127.0.0.1:4317";
const context = (await (await fetch(`${live}/api/master`)).json()) as CvContext;
const candidates = (await (
  await fetch(`${live}/api/jobs?query=Linear&availability=all&eligibility=all`)
).json()) as JobPage;
const candidate =
  candidates.items.find(
    (job) => job.company === "Linear" && /AI/.test(job.title),
  ) || candidates.items.find((job) => job.company === "Linear");
assert.ok(
  candidate,
  "A collected Linear posting is needed for this verification.",
);
const posting = (await (
  await fetch(`${live}/api/jobs/${candidate.id}`)
).json()) as Job;
process.env.JH_DATA_DIR = directory;
process.env.JH_TEST_SERVER = "1";
process.env.JH_SCHEDULE_ENABLED = "false";
const store = await import("../core/db/index.ts");
const { validateGeneration } = await import("../core/ai/generate.ts");
const { fromProfile } = await import("../core/cv/render.ts");
const { defaultCoverLetterTemplate } =
  await import("../core/cover-letter/template.ts");
const { processCoverLetterTask } = await import("../core/ai/generate.ts");
store.saveProfile(context.profile, store.getProfile().revision);
store.putSetting("template", context.template);
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
  title: posting.title,
  company: posting.company,
  url: "https://example.com/workflow-fixture",
  description: posting.description,
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
  template: context.template,
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
const setCode = async (value: string) => {
  await page.locator('.cm-content[contenteditable="true"]').click();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+A" : "Control+A",
  );
  await page.keyboard.insertText(value);
};
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
    console.log(
      "Running official Codex subscription generation (gpt-5.6-sol, high)…",
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
  await page.locator(".cm-content").waitFor();
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

  const edit = {
    ...first.document,
    paragraphs: [
      "Workflow verification: this manual edit must survive refreshes and failed saves.",
    ],
  };
  await setCode(JSON.stringify(edit, null, 2));
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
  step(
    "Editing, live preview, refresh preservation, failed save, and successful retry",
  );

  await setCode(
    JSON.stringify({ ...edit, paragraphs: ["Unsaved second edit"] }, null, 2),
  );
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
  await page
    .getByRole("tab", { name: "Data.json", exact: true })
    .press("ArrowRight");
  await page.keyboard.press("Enter");
  await page
    .getByRole("tab", { name: "Template.html", selected: true })
    .waitFor();
  await page.getByRole("tab", { name: "Data.json", exact: true }).click();
  step(
    "Failed cover letter loads can retry and editor tabs work from the keyboard",
  );

  await page.route("**/api/cover-letters/export", (route) =>
    route.fulfill({ status: 503, json: { error: "Temporary export failure" } }),
  );
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await page.getByText("Temporary export failure", { exact: true }).waitFor();
  await page.unroute("**/api/cover-letters/export");
  for (const format of ["PDF", "DOCX"]) {
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
  step("Export failure preserves the draft; PDF and DOCX downloads succeed");
  await page.getByRole("button", { name: "CV", exact: true }).click();
  await page.getByRole("tab", { name: "Data and HTML", exact: true }).click();
  await page.getByRole("combobox", { name: "CV", exact: true }).click();
  await page
    .getByRole("option", {
      name: `${job.company} · ${job.title} (saved resume)`,
      exact: true,
    })
    .click();
  await page
    .frameLocator('iframe[title="CV preview"]')
    .getByText("Experience", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: /^Generate/ }).count(),
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
    "Legacy resumes stay readable; job tab opens the cover letter without regenerating",
  );
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
  await page.screenshot({
    path: join(
      output,
      `cover-letter-workflow-${real ? "real" : "fixture"}-mobile.png`,
    ),
  });
  await page.reload();
  await page.locator(".cm-content").waitFor();
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
