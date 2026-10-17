import { fileURLToPath } from "node:url";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";

const directory = mkdtempSync(join(tmpdir(), "ununemploy-backup-test-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = fileURLToPath(
  new URL("./fixtures/profile.json", import.meta.url),
);
process.env.JH_TEST_SERVER = "1";
process.env.JH_SCHEDULE_ENABLED = "false";
const store = await import("../core/db/index.ts");
const latex = await import("../core/latex/store.ts");
const { app } = await import("../server/index.ts");
let beganWrite: () => void;
let finishWrite: () => void;
app.post("/api/backup-test/pending", async () => {
  beganWrite();
  await new Promise<void>((resolve) => {
    finishWrite = resolve;
  });
  return { ok: true };
});
const { readBackup, exportBackup } = await import("../core/backup/archive.ts");
const { personalDataActivity } = await import("../core/backup/activity.ts");
const { incomingSchema } = await import("../core/backup/schema.ts");
const source = store.listSources()[0];
const job = store.ingestJob(source, {
  sourceItemId: "backup-job",
  title: "Software Engineer",
  company: "Example",
  location: "Worldwide",
  arrangement: "Remote",
  employmentType: "FullTime",
  salary: "",
  url: "https://example.com/backup",
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
  notes: "Private note · 保留",
  seenAt: store.now(),
  descriptionOverride:
    "Manually edited full job description with React and TypeScript requirements and product collaboration.",
});
const incoming = incomingSchema.parse(job);
const scanned = store.ingestJob(source, {
  ...incoming,
  sourceItemId: "scanned",
  url: "https://example.com/scanned",
  title: "Scanned role",
  removedAt: "2026-10-01T00:00:00.000Z",
}).job;
const applied = store.ingestJob(source, {
  ...incoming,
  sourceItemId: "applied",
  url: "https://example.com/applied",
  title: "Applied role",
}).job;
store.writeJob({ ...applied, status: "applied", savedAt: store.now() });
const profile = store.getProfile();
store.saveProfile(
  { ...profile, basics: { ...profile.basics, name: "Backup Example" } },
  profile.revision,
);
const savedProfile = store.getProfile();
const firstLatex = latex.latexVersion();
const sourceText =
  "\\documentclass{article}\n\\begin{document}Latest CV · 保留\\end{document}";
const latestLatex = latex.saveLatex(sourceText, firstLatex.version);
const pdf = Buffer.from("%PDF-1.4\nfixture current PDF\n%%EOF");
latex.saveLatexBuild(sourceText, pdf, []);
const letter = {
  jobId: job.id,
  kind: "edited",
  document: {
    name: "Backup Example",
    location: "Malaysia",
    contacts: [],
    company: "Example",
    role: "Software Engineer",
    salutation: "Dear team,",
    paragraphs: ["Original wording"],
    closing: "Regards,",
  },
  template: store.getCoverLetterTemplate(),
  profileRevision: savedProfile.revision,
  reviewNotes: ["User reviewed"],
  evidence: { facts: ["supported"] },
  parentId: null,
};
const oldLetter = store.saveCoverLetter(letter);
const latestLetter = store.saveCoverLetter({
  ...letter,
  document: {
    ...letter.document,
    paragraphs: ["Latest manual wording · 保留"],
  },
  parentId: oldLetter.id,
});
store.db
  .prepare("INSERT INTO profile_messages VALUES (?,?,?,?,?,?)")
  .run("chat", "user", "Conversation excluded", store.now(), null, "chat");
store.putSetting("backup-test-secret", "Not in the ZIP");
store.incrementCounter("backup-test-budget", 27);
let archive: Buffer;
const upload = (buffer: Buffer) =>
  app.inject({
    method: "POST",
    url: "/api/backups/import",
    headers: { "content-type": "application/zip" },
    payload: buffer,
  });
const counts = () =>
  Object.fromEntries(
    [
      "jobs",
      "profile_versions",
      "latex_versions",
      "cover_letter_versions",
      "profile_messages",
      "tasks",
    ].map((table) => [
      table,
      store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n,
    ]),
  );
async function changedZip(
  change: (zip: JSZip, data: any, manifest: any) => void,
  rehash = true,
) {
  const zip = await JSZip.loadAsync(archive);
  const data = JSON.parse(await zip.file("data.json")!.async("string"));
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  change(zip, data, manifest);
  const bytes = Buffer.from(JSON.stringify(data));
  zip.file("data.json", bytes);
  if (rehash)
    manifest.files["data.json"] = {
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  zip.file("manifest.json", JSON.stringify(manifest));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

test("export includes only current personal content and matching LaTeX PDF", async () => {
  const response = await app.inject("/api/backups/export");
  assert.equal(response.statusCode, 200, response.body.slice(0, 300));
  assert.match(response.headers["content-disposition"]!, /ununemploy-.*\.zip/);
  assert.match(response.headers["cache-control"]!, /no-store/);
  archive = response.rawPayload;
  const zip = await JSZip.loadAsync(archive, { checkCRC32: true });
  assert.deepEqual(Object.keys(zip.files).sort(), [
    "cv.pdf",
    "cv.tex",
    "data.json",
    "manifest.json",
  ]);
  const backup = await readBackup(archive);
  assert.deepEqual(backup.data.profile, savedProfile);
  assert.equal(backup.source, sourceText);
  assert.deepEqual(backup.pdf, pdf);
  assert.equal(backup.data.coverLetters.length, 1);
  assert.equal(
    backup.data.coverLetters[0].document.paragraphs[0],
    "Latest manual wording · 保留",
  );
  assert.equal(backup.data.coverLetters[0].parentId, null);
  assert.equal(backup.data.jobs.length, 3);
  assert.equal(
    backup.data.jobs.find((j) => j.id === scanned.id)?.status,
    "new",
  );
  assert.equal(
    backup.data.observations.find((o) => o.jobId === scanned.id)?.items[0].item
      .removedAt,
    "2026-10-01T00:00:00.000Z",
  );
  const text = await zip.file("data.json")!.async("string");
  for (const omitted of [
    "Not in the ZIP",
    "Conversation excluded",
    "Original wording",
    '"cvs"',
    '"settings"',
    '"checkpoint"',
  ])
    assert.ok(!text.includes(omitted), omitted);
});

test("malformed, incompatible, damaged and unsafe ZIPs never change current data", async () => {
  const before = counts();
  for (const bytes of [
    Buffer.from("not a zip"),
    archive.subarray(0, archive.length / 2),
    await changedZip((_zip, _data, manifest) => {
      manifest.version = 99;
    }),
    await changedZip((_zip, data) => {
      data.profile.basics.name = "Corrupted";
    }, false),
    await changedZip((zip) => {
      zip.file("../outside.txt", "unsafe");
    }),
    await changedZip((zip) => {
      zip.remove("cv.tex");
    }),
    await changedZip((_zip, data) => {
      data.jobs[0].url = "file:///private/secret";
    }),
    await changedZip((_zip, data) => {
      data.coverLetters[0].jobId = "missing-job";
    }),
    await changedZip((_zip, data) => {
      data.jobs.push(data.jobs[0]);
    }),
    await changedZip((_zip, _data, manifest) => {
      manifest.files["cv.tex"].bytes = 999999999;
    }),
    await changedZip((zip, _data, manifest) => {
      zip.file("cv.tex", "x".repeat(100000));
      manifest.files["cv.tex"].bytes = 1;
    }),
    await changedZip((zip) => {
      zip.file("cv.tex", "symlink", { unixPermissions: 0o120777 });
    }),
  ]) {
    const response = await upload(bytes);
    assert.equal(response.statusCode, 400, response.body);
    assert.deepEqual(counts(), before);
    assert.deepEqual(store.getProfile(), savedProfile);
    assert.equal(latex.latexVersion().source, sourceText);
  }
  const crossOrigin = await app.inject({
    method: "POST",
    url: "/api/backups/import",
    headers: {
      "content-type": "application/zip",
      origin: "https://unrelated.example",
    },
    payload: archive,
  });
  assert.equal(crossOrigin.statusCode, 403);
});

test("import refuses active scans, model jobs and asynchronous writes", async () => {
  const before = counts();
  for (const name of [
    "scan",
    "profile-chat",
    "codex-inference",
    "jev",
    "vuejobs-details",
  ]) {
    store.lease(name, "backup-test", 10000);
    const response = await upload(archive);
    assert.match(response.json().error, /still running/);
    store.release(name, "backup-test");
    assert.deepEqual(counts(), before);
  }
  const finish = personalDataActivity();
  try {
    assert.match((await upload(archive)).json().error, /still running/);
  } finally {
    finish();
  }
});

test("an in-flight API write blocks restore until its response completes", async () => {
  const entered = new Promise<void>((resolve) => {
    beganWrite = resolve;
  });
  const pending = app
    .inject({ method: "POST", url: "/api/backup-test/pending" })
    .then((response) => response);
  await entered;
  try {
    assert.match((await upload(archive)).json().error, /still running/);
  } finally {
    finishWrite();
    await pending;
  }
  assert.equal(
    store.db
      .prepare(
        "SELECT COUNT(*) AS n FROM leases WHERE name LIKE 'personal-data:%'",
      )
      .get()!.n,
    0,
  );
});

test("a mid-restore database failure rolls back every replaced record", async () => {
  const before = counts();
  store.db.exec(
    "CREATE TRIGGER reject_backup BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT, 'restore fixture failure'); END",
  );
  try {
    const response = await upload(archive);
    assert.equal(response.statusCode, 400);
    assert.match(response.json().error, /restore fixture failure/);
    assert.deepEqual(counts(), before);
    assert.equal(
      store.getCoverLetter(latestLetter.id)?.document.paragraphs[0],
      "Latest manual wording · 保留",
    );
  } finally {
    store.db.exec("DROP TRIGGER reject_backup");
  }
});

test("import overwrites atomically, retains destination configuration, and never queues generation", async () => {
  const originalJob = store.getJob(job.id)!;
  const settings = store.getSettings();
  const sources = store.listSources();
  const extra = store.ingestJob(source, {
    ...incoming,
    sourceItemId: "extra",
    url: "https://example.com/extra",
  }).job;
  const current = store.getProfile();
  store.saveProfile(
    { ...current, basics: { ...current.basics, name: "Destination content" } },
    current.revision,
  );
  const currentLatex = latex.saveLatex(
    "Destination source",
    latex.latexVersion().version,
  );
  store.queueCoverLetter(extra.id);
  const response = await upload(archive);
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { jobs: 3, savedJobs: 2, coverLetters: 1 });
  assert.deepEqual(counts(), {
    jobs: 3,
    profile_versions: 1,
    latex_versions: 1,
    cover_letter_versions: 1,
    profile_messages: 0,
    tasks: 0,
  });
  assert.equal(store.getJob(extra.id), null);
  assert.deepEqual(store.getProfile(), {
    ...savedProfile,
    revision: current.revision + 2,
  });
  const restoredJob = store.getJob(job.id)!;
  assert.equal(store.getJob(scanned.id)!.availability, "closed");
  for (const key of [
    "status",
    "savedAt",
    "seenAt",
    "notes",
    "description",
    "descriptionOverride",
    "availability",
    "sourceLinks",
  ] as const)
    assert.deepEqual(restoredJob[key], originalJob[key], key);
  assert.equal(latex.latexVersion().source, sourceText);
  assert.ok(latex.latexVersion().version > currentLatex.version);
  assert.equal(latex.latexVersion().restoredFrom, null);
  assert.deepEqual(latex.latexBuild(latex.latexVersion().hash)?.pdf, pdf);
  assert.deepEqual(store.getSettings(), settings);
  assert.deepEqual(store.listSources(), sources);
  assert.equal(store.setting("backup-test-secret", ""), "Not in the ZIP");
  assert.equal(store.getCounter("backup-test-budget"), 27);
  assert.ok(!readdirSync(directory).includes("backups"));
  assert.notEqual(store.listCoverLetterVersions(job.id)[0].id, latestLetter.id);
  assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);
  const oldSave = await app.inject({
    method: "PUT",
    url: "/api/latex",
    payload: { source: "stale", expectedVersion: currentLatex.version },
  });
  assert.equal(oldSave.statusCode, 409);
  const again = await readBackup((await exportBackup()).buffer);
  assert.equal(again.data.jobs.length, 3);
  assert.equal(
    again.data.observations.find((o) => o.jobId === job.id)?.items[0]
      .sourceName,
    source.name,
  );
});

test("restored content survives reopening and fresh observations replace imported evidence", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    const s = await import('./core/db/index.ts');
    const l = await import('./core/latex/store.ts');
    console.log(JSON.stringify({name:s.getProfile().basics.name,jobs:s.listJobs().length,latex:l.latexVersion().source,letters:s.listCoverLetterVersions(${JSON.stringify(job.id)}).length,tasks:s.listTasks().length}));
    s.db.close();
  `,
    ],
    { env: process.env, encoding: "utf8" },
  );
  const reopened = JSON.parse(output.trim());
  assert.deepEqual(reopened, {
    name: "Backup Example",
    jobs: 3,
    latex: sourceText,
    letters: 1,
    tasks: 0,
  });
  store.ingestJob(source, {
    ...incoming,
    description: "A newly scanned, updated description",
  });
  assert.equal(store.jobObservations(job.id).length, 1);
  assert.equal(
    store.jobObservations(job.id)[0].item.description,
    "A newly scanned, updated description",
  );
});

test("a source without a matching compiled PDF exports and imports without a stale preview", async () => {
  latex.saveLatex("Uncompiled current source", latex.latexVersion().version);
  const { buffer } = await exportBackup();
  assert.equal((await readBackup(buffer)).pdf, undefined);
  assert.equal((await upload(buffer)).statusCode, 200);
  assert.equal(latex.latexContext().previewHash, null);
});

test("the upload route accepts ZIP files above the regular API body limit", async () => {
  const large = await changedZip((_zip, data) => {
    data.jobs[0].notes = randomBytes(1310720).toString("base64");
    data.jobs[1].notes = randomBytes(1310720).toString("base64");
  });
  assert.ok(large.length > 2 * 1024 * 1024);
  const response = await upload(large);
  assert.equal(response.statusCode, 200, response.body);
});

after(async () => {
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});
