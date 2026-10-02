import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const dir = mkdtempSync(join(tmpdir(), "jh-upgrade-"));
try {
  const db = new DatabaseSync(join(dir, "job-hunter.db"));
  db.exec(
    readFileSync(
      new URL("../core/db/migrations/001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  db.exec(
    "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES(1,'2026-09-01')",
  );
  const p = JSON.parse(
    readFileSync(
      new URL("../tests/fixtures/profile.json", import.meta.url),
      "utf8",
    ),
  );
  db.prepare("INSERT INTO profile_versions VALUES(?,?,?)").run(
    1,
    JSON.stringify(p),
    "2026-09-01",
  );
  for (const key of ["sourcesSeeded", "xSourceSeeded"])
    db.prepare("INSERT INTO settings VALUES(?,?)").run(key, "true");
  const source = {
    id: "s",
    type: "rss",
    identifier: "manual",
    name: "Manual",
    enabled: false,
    requestLimit: 1,
    checkpoint: {},
    state: "idle",
    lastRunAt: null,
    nextRunAt: null,
    lastError: null,
    jobCount: 1,
  };
  db.prepare("INSERT INTO sources VALUES(?,?,?,?)").run(
    "s",
    JSON.stringify(source),
    "rss",
    "manual",
  );
  const j = {
    id: "j",
    sourceId: "s",
    sourceItemId: "one",
    sourceName: "Manual",
    sourceType: "rss",
    title: "Senior Frontend Engineer",
    company: "Example",
    location: "Malaysia",
    arrangement: "Remote",
    employmentType: "Full-time",
    salary: "",
    url: "https://example.com/j",
    description:
      "Manually edited complete description about product engineering with React and TypeScript. ".repeat(
        3,
      ),
    descriptionOverride:
      "Manually edited complete description about product engineering with React and TypeScript. ".repeat(
        3,
      ),
    publishedAt: "2026-09-01",
    firstSeenAt: "2026-09-01",
    lastSeenAt: "2026-09-01",
    contentHash: "legacy",
    kind: "opening",
    availability: "closed",
    category: "adjacent",
    score: 42,
    reasons: [],
    gaps: [],
    eligibility: "unknown",
    eligibilityNotes: [],
    status: "saved",
    notes: "Preserve my notes exactly.",
    savedAt: "2026-09-01",
  };
  db.prepare("INSERT INTO jobs VALUES(?,?,?,?,?,?)").run(
    "j",
    j.url,
    JSON.stringify(j),
    j.status,
    j.firstSeenAt,
    j.lastSeenAt,
  );
  db.prepare("INSERT INTO source_items VALUES(?,?,?,?,?)").run(
    "s",
    "one",
    "j",
    j.url,
    j.lastSeenAt,
  );
  const cv = {
    id: "cv",
    jobId: "j",
    version: 1,
    kind: "edited",
    document: { summary: "Manually edited CV" },
    template: { html: "original", css: "original" },
    profileRevision: 1,
    createdAt: "2026-09-01",
    reviewNotes: [],
    evidence: { private: true },
    parentId: null,
  };
  const task = {
    id: "task",
    jobId: "j",
    kind: "cv",
    state: "complete",
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
    error: null,
    attempts: 1,
    input: { job: j, profile: p, template: cv.template },
    resultId: "cv",
  };
  db.prepare("INSERT INTO cv_versions VALUES(?,?,?,?,?)").run(
    "cv",
    "j",
    1,
    JSON.stringify(cv),
    cv.createdAt,
  );
  db.prepare("INSERT INTO tasks VALUES(?,?,?,?,?,?,?)").run(
    "task",
    "j",
    "cv",
    "complete",
    JSON.stringify(task),
    task.createdAt,
    "first-save:j",
  );
  db.close();
  const script = `import assert from 'node:assert/strict';import {db,getJob,getCv,listTasks,refreshAllJobs} from './core/db/index.ts'; const job=getJob('j'); assert.equal(job.notes,'Preserve my notes exactly.');assert.equal(job.status,'saved');assert.equal(job.description,job.descriptionOverride);assert.equal(job.availability,'closed');assert.equal(job.cvId,'cv');assert.equal(job.matchVersion,4);assert.equal(getCv('cv').document.summary,'Manually edited CV');assert.equal(listTasks()[0].state,'complete');assert.equal(db.prepare('SELECT count(*) as n FROM source_item_versions').get().n,1);refreshAllJobs();assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();`;
  for (let i = 0; i < 2; i++)
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        cwd: process.cwd(),
        env: { ...process.env, JH_DATA_DIR: dir },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  const upgraded = new DatabaseSync(join(dir, "job-hunter.db"), {
    readOnly: true,
  });
  assert.equal(
    upgraded.prepare("SELECT document FROM cv_versions WHERE id='cv'").get()
      ?.document,
    JSON.stringify(cv),
  );
  assert.equal(
    upgraded.prepare("SELECT document FROM tasks WHERE id='task'").get()
      ?.document,
    JSON.stringify(task),
  );
  upgraded.close();
  console.log(
    JSON.stringify({
      passed: true,
      legacyMigration: true,
      restartIdempotency: true,
      preserved: [
        "saved status",
        "notes",
        "description override",
        "closed state",
        "CV document",
        "task document",
      ],
      integrity: "ok",
    }),
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
