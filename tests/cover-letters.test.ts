import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { backup, DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(join(tmpdir(), "ununemploy-letters-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = new URL("./fixtures/profile.json", import.meta.url).pathname;
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const { app } = await import("../server/index.ts");
const { fromProfile, renderCv } = await import("../core/cv/render.ts");
const { validateGeneration, generationPrompt } =
  await import("../core/ai/generate.ts");
const source = store.listSources()[0];
const job = store.ingestJob(source, {
  sourceItemId: "cover-letter-test",
  title: "Product Engineer",
  company: "Example company",
  location: "Worldwide",
  arrangement: "Remote",
  employmentType: "FullTime",
  salary: "",
  url: "https://example.com/cover-letter-test",
  publishedAt: null,
  kind: "opening",
  descriptionQuality: "full",
  description:
    "Build developer tools and native and web experiences with TypeScript, React and AI agent harnesses. Work with engineers and designers on product quality.",
}).job;
const profile = store.getProfile();
const legacy = store.saveCv({
  jobId: job.id,
  kind: "edited",
  document: fromProfile(profile),
  template: store.getTemplate(),
  profileRevision: profile.revision,
  reviewNotes: [],
  evidence: null,
  parentId: null,
});
const originalLegacy = JSON.stringify(legacy);
const generated = validateGeneration(
  {
    paragraphs: [
      {
        text: "I am interested in your product engineering role.",
        evidenceIds: ["job"],
      },
      { text: profile.basics.summary, evidenceIds: ["profile-summary"] },
      {
        text: "I would welcome the opportunity to discuss the work.",
        evidenceIds: ["job"],
      },
    ],
    reviewNotes: [],
  },
  profile,
  job,
);
let taskId = "";
let letterId = "";

test("saving a job with an existing resume queues one distinct cover letter", async () => {
  const old = {
    id: "old-resume-task",
    jobId: job.id,
    kind: "cv",
    state: "complete",
    createdAt: store.now(),
    updatedAt: store.now(),
    error: null,
    attempts: 1,
    input: { job, profile, template: store.getTemplate() },
    resultId: legacy.id,
  };
  store.saveTask(old, `first-save:${job.id}`);
  for (let i = 0; i < 2; i++) {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/jobs/${job.id}`,
      payload: { status: "saved" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().coverLetterState, "queued");
  }
  const tasks = store.listTasks().filter((t) => t.kind === "cover_letter");
  assert.equal(tasks.length, 1);
  const task = tasks[0];
  taskId = task.id;
  assert.equal(
    (
      await app.inject({ method: "POST", url: `/api/jobs/${job.id}/generate` })
    ).json().id,
    task.id,
  );
  assert.match(task.input.template.html, /paragraphs/);
  assert.doesNotMatch(task.input.template.html, /#each experience/);
  assert.match(generationPrompt(task), /cover letter, not a CV or resume/);
  assert.equal(JSON.stringify(store.getCv(legacy.id)), originalLegacy);
  const boot = (await app.inject("/api/bootstrap")).json();
  assert.ok(boot.cvJobs.some((j: any) => j.id === job.id));
  assert.ok(boot.coverLetterJobs.some((j: any) => j.id === job.id));
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/tasks/old-resume-task/retry",
      })
    ).statusCode,
    400,
  );
});

test("cover-letter edits and restoration append versions without changing resumes or facts", async () => {
  const letter = store.saveCoverLetter({
    jobId: job.id,
    kind: "generated",
    document: generated.document,
    template: store.getCoverLetterTemplate(),
    profileRevision: profile.revision,
    reviewNotes: generated.warnings,
    evidence: generated.generation,
    parentId: null,
  });
  letterId = letter.id;
  store.saveTask({
    ...store.listTasks().find((t) => t.id === taskId)!,
    state: "complete",
    resultId: letter.id,
  });
  const detail = (await app.inject(`/api/jobs/${job.id}`)).json();
  assert.equal(detail.coverLetterId, letter.id);
  assert.equal(detail.cvId, legacy.id);
  const editedDocument = {
    ...letter.document,
    paragraphs: ["My revised cover letter."],
  };
  const edited = await app.inject({
    method: "POST",
    url: `/api/cover-letters/${letter.id}/versions`,
    payload: { document: editedDocument, template: letter.template },
  });
  assert.equal(edited.statusCode, 200);
  assert.equal(edited.json().version, 2);
  assert.deepEqual(store.getCoverLetter(letter.id)?.document, letter.document);
  const restored = await app.inject({
    method: "POST",
    url: `/api/cover-letters/${letter.id}/versions`,
    payload: { document: letter.document, template: letter.template },
  });
  assert.equal(restored.json().version, 3);
  assert.equal(restored.json().parentId, letter.id);
  assert.equal(
    store.listCoverLetterVersions(job.id)[1].document.paragraphs[0],
    "My revised cover letter.",
  );
  assert.deepEqual(
    (await app.inject(`/api/cover-letters/${letter.id}`)).json(),
    letter,
  );
  assert.equal(
    (await app.inject(`/api/cover-letters?jobId=${job.id}`)).json().length,
    3,
  );
  assert.equal((await app.inject("/api/cover-letters")).statusCode, 400);
  assert.equal(JSON.stringify(store.getCv(legacy.id)), originalLegacy);
  assert.deepEqual(store.getProfile(), profile);
});

test("saving after a completed manual generation does not queue another letter", async () => {
  const extra = store.ingestJob(source, {
    title: job.title,
    company: job.company,
    location: job.location,
    arrangement: job.arrangement,
    employmentType: job.employmentType,
    salary: job.salary,
    description: job.description,
    descriptionQuality: "full",
    publishedAt: null,
    kind: "opening",
    sourceItemId: "manual-generation",
    url: "https://example.com/manual-generation",
  }).job;
  const task = store.queueCoverLetter(extra.id, true);
  store.saveTask({ ...task, state: "complete" });
  const result = await app.inject({
    method: "PATCH",
    url: `/api/jobs/${extra.id}`,
    payload: { status: "saved" },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(store.listTasks().filter((t) => t.jobId === extra.id).length, 1);
});

test("letter preview/export validates document shape and retains isolated rendering", async () => {
  const letter = store.getCoverLetter(letterId)!;
  const invalid = await app.inject({
    method: "POST",
    url: "/api/cover-letters/preview",
    payload: { document: legacy.document, template: legacy.template },
  });
  assert.equal(invalid.statusCode, 400);
  const result = await app.inject({
    method: "POST",
    url: "/api/cover-letters/export",
    payload: {
      document: letter.document,
      template: letter.template,
      format: "html",
    },
  });
  assert.equal(result.statusCode, 200);
  assert.match(
    String(result.headers["content-disposition"]),
    /Cover-letter\.html/,
  );
  assert.match(result.body, /Dear hiring team/);
  assert.doesNotMatch(result.body, /<h2>Experience/);
  assert.doesNotMatch(result.body, /evidenceIds|profile-summary|reviewNotes/);
  const rendered = renderCv(letter.document, {
    html: '<script>alert(1)</script><form action="https://example.com/send"><input></form><p>{{paragraphs.[0]}}</p>',
    css: "",
  });
  assert.doesNotMatch(rendered, /<script|<form|<input/);
});

test("upgrade converts unfinished resume tasks and preserves completed resume history", async () => {
  const migrationDir = mkdtempSync(
    join(tmpdir(), "ununemploy-letter-upgrade-"),
  );
  try {
    const file = join(migrationDir, "job-hunter.db");
    await backup(store.db, file);
    const oldDb = new DatabaseSync(file);
    oldDb.exec(
      "DROP TABLE cover_letter_versions; DELETE FROM schema_migrations WHERE version=4; DELETE FROM tasks WHERE kind='cover_letter';",
    );
    const pending = {
      ...store.listTasks().find((t) => t.id === taskId)!,
      id: "pending-resume",
      kind: "cv",
      state: "running",
      resultId: null,
      input: { job, profile, template: store.getTemplate() },
    };
    oldDb
      .prepare("INSERT INTO tasks VALUES (?,?,?,?,?,?,?)")
      .run(
        pending.id,
        job.id,
        "cv",
        "running",
        JSON.stringify(pending),
        pending.createdAt,
        "legacy-retry",
      );
    oldDb.close();
    const code = `const s=await import(${JSON.stringify(resolve("core/db/index.ts"))}); const task=s.listTasks().find(t=>t.id==='pending-resume'); console.log(JSON.stringify({task,cv:s.getCv(${JSON.stringify(legacy.id)}),letters:s.listCoverLetterVersions(${JSON.stringify(job.id)}),repeated:s.queueCoverLetter(${JSON.stringify(job.id)}).id}));s.db.close();`;
    for (let i = 0; i < 2; i++) {
      const output = execFileSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", code],
        {
          encoding: "utf8",
          env: { ...process.env, JH_DATA_DIR: migrationDir },
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
      const result = JSON.parse(output);
      assert.equal(result.task.kind, "cover_letter");
      assert.equal(result.task.state, "paused");
      assert.match(result.task.input.template.html, /paragraphs/);
      assert.equal(result.repeated, pending.id);
      assert.equal(JSON.stringify(result.cv), originalLegacy);
      assert.deepEqual(result.letters, []);
    }
  } finally {
    rmSync(migrationDir, { recursive: true, force: true });
  }
});

after(async () => {
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});
