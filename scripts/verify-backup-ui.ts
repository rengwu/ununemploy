import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const directory = mkdtempSync(join(tmpdir(), "ununemploy-backup-ui-"));
const output = resolve(".local-data/verification/backup");
mkdirSync(output, { recursive: true });
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = new URL(
  "../tests/fixtures/profile.json",
  import.meta.url,
).pathname;
process.env.JH_TEST_SERVER = "1";
process.env.JH_SCHEDULE_ENABLED = "false";
const store = await import("../core/db/index.ts");
const latex = await import("../core/latex/store.ts");
const { readBackup } = await import("../core/backup/archive.ts");
for (const s of store.listSources()) store.saveSource({ ...s, enabled: false });
const source = store.listSources()[0];
const job = store.ingestJob(source, {
  sourceItemId: "backup-ui",
  title: "Software Engineer",
  company: "Backup fixture",
  location: "Worldwide",
  arrangement: "Remote",
  employmentType: "FullTime",
  salary: "",
  url: "https://example.com/backup-ui",
  publishedAt: store.now(),
  kind: "opening",
  descriptionQuality: "full",
  description:
    "Build React and TypeScript developer tools. Collaborate on product design and implementation across the software lifecycle.",
}).job;
store.writeJob({
  ...job,
  status: "saved",
  savedAt: store.now(),
  notes: "Restored note",
});
const profile = store.getProfile();
const first = latex.latexVersion();
const tex =
  "\\documentclass{article}\n\\begin{document}Backup fixture CV\\end{document}";
latex.saveLatex(tex, first.version);
store.saveCoverLetter({
  jobId: job.id,
  kind: "edited",
  document: {
    name: "Test candidate",
    location: "Malaysia",
    contacts: [],
    company: "Backup fixture",
    role: "Software Engineer",
    salutation: "Dear team,",
    paragraphs: ["Saved letter content from the ZIP."],
    closing: "Regards,",
  },
  template: store.getCoverLetterTemplate(),
  profileRevision: profile.revision,
  reviewNotes: [],
  evidence: null,
  parentId: null,
});
const { app } = await import("../server/index.ts");
const origin = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const section = page.getByRole("region", { name: "Backup", exact: true });
const report: string[] = [];
try {
  await page.goto(`${origin}/#settings`);
  await section.waitFor();
  assert.equal(await section.getByRole("button").count(), 2);
  const chooser = page.waitForEvent("filechooser");
  await section
    .getByRole("button", { name: "Restore from Backup", exact: true })
    .click();
  const cancelledChooser = await chooser;
  assert.equal(cancelledChooser.isMultiple(), false);
  await cancelledChooser.setFiles([]);
  assert.equal(store.getProfile().basics.name, profile.basics.name);
  report.push("Exactly two backup buttons; cancelling the restore chooser changes no data");
  const download = page.waitForEvent("download");
  await section
    .getByRole("button", { name: "Export to Backup", exact: true })
    .click();
  const archive = join(directory, "backup.zip");
  const result = await download;
  assert.match(result.suggestedFilename(), /^ununemploy-.*\.zip$/);
  await result.saveAs(archive);
  const data = await readBackup(readFileSync(archive));
  assert.equal(data.source, tex);
  assert.equal(data.data.coverLetters.length, 1);
  report.push(
    "Settings exports a downloadable ZIP with current LaTeX, profile, saved job and letter",
  );

  await section.locator('input[type="file"]').setInputFiles({
    name: "broken.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("broken"),
  });
  await section
    .getByText("This is not a readable ZIP backup.", { exact: true })
    .waitFor();
  assert.equal(store.getProfile().basics.name, profile.basics.name);
  assert.equal(store.getJob(job.id)?.notes, "Restored note");
  report.push("Invalid ZIP shows an error and preserves current data");

  // Destination edits are setup only; the following restore uses the actual UI.
  const before = store.getProfile();
  store.saveProfile(
    { ...before, basics: { ...before.basics, name: "Destination edits" } },
    before.revision,
  );
  latex.saveLatex("Destination CV", latex.latexVersion().version);
  store.writeJob({ ...store.getJob(job.id)!, notes: "Destination note" });
  const settings = store.getSettings();
  const sources = store.listSources();
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/api/backups/import"),
  );
  const restoreChooser = page.waitForEvent("filechooser");
  await section.getByRole("button", { name: "Restore from Backup", exact: true }).click();
  await (await restoreChooser).setFiles(archive);
  assert.equal((await response).status(), 200);
  await page.getByText("Backup restored.", { exact: true }).waitFor();
  assert.equal(store.getProfile().basics.name, profile.basics.name);
  assert.equal(store.getJob(job.id)?.notes, "Restored note");
  assert.equal(latex.latexVersion().source, tex);
  assert.deepEqual(store.getSettings(), settings);
  assert.deepEqual(store.listSources(), sources);
  assert.equal(store.listTasks().length, 0);
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "settings-desktop.png") });
  report.push(
    "Import overwrites personal content, reloads the UI, preserves settings and does not generate drafts",
  );

  await page.goto(`${origin}/#saved?job=${job.id}&tab=cover-letter`);
  await page
    .frameLocator('iframe[title="Cover letter preview"]')
    .getByText("Saved letter content from the ZIP.", { exact: true })
    .waitFor();
  report.push(
    "Restored saved-job cover letter opens with its rendered preview",
  );
  await page.goto(`${origin}/#cv?view=html`);
  await page.locator(".latex-editor .cm-content").waitFor();
  assert.match(
    await page.locator(".cm-content").innerText(),
    /Backup fixture CV/,
  );
  assert.equal(
    await page.getByRole("tab", { name: "Data and HTML", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("tab", { name: "Data.json", exact: true }).count(),
    0,
  );
  await page.screenshot({ path: join(output, "latex-desktop.png") });
  report.push(
    "CV and old HTML CV links open the LaTeX editor without a Data and HTML tab",
  );

  await page.goto(`${origin}/#settings`);
  await section.waitFor();
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-mode", "dark"),
  );
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "settings-dark.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await section.scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.screenshot({ path: join(output, "settings-mobile.png") });
  report.push(
    "Backup controls fit desktop, dark mode and 390px mobile layouts",
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    join(output, "result.json"),
    JSON.stringify(
      { passed: true, checks: report, browserErrors: errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, checks: report }, null, 2));
} finally {
  await browser.close();
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
