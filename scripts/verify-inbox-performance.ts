import assert from "node:assert/strict";
import { backup, DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

// An opt-in read-only source is copied before importing any application module.
// No worker, scans or inference run. Only aggregate timings leave the fixture.
const sourcePath = process.argv[2];
if (!sourcePath)
  throw new Error(
    "Usage: npx tsx scripts/verify-inbox-performance.ts /path/to/job-hunter.db",
  );
const directory = mkdtempSync(join(tmpdir(), "ununemploy-inbox-perf-"));
const source = new DatabaseSync(resolve(sourcePath), { readOnly: true });
try {
  await backup(source, join(directory, "job-hunter.db"));
} finally {
  source.close();
}
process.env.JH_DATA_DIR = directory;
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const { app } = await import("../server/index.ts");
const { jobsRevision } = await import("../core/job-query.ts");
const originalNow = Date.now;
let timestamp = Date.now();
Date.now = () => timestamp; // Control the minute boundary independently of benchmark speed.
const measurements: { scenario: string; ms: number }[] = [];
const request = async (
  scenario: string,
  url: string,
  headers?: Record<string, string>,
) => {
  const start = performance.now();
  const response = await app.inject({ url, headers });
  const ms = performance.now() - start;
  assert.ok(
    [200, 304].includes(response.statusCode),
    `${scenario}: HTTP ${response.statusCode}`,
  );
  measurements.push({ scenario, ms: Math.round(ms) });
  assert.ok(
    ms < 10000,
    `${scenario} exceeded the 10-second check budget (${Math.round(ms)} ms); UI deadline is 15 seconds`,
  );
  return response;
};
try {
  const total = Number(
    store.db.prepare("SELECT count(*) AS n FROM jobs").get()!.n,
  );
  assert.ok(
    total >= 30000,
    "Use an inventory of at least 30,000 jobs for this performance check",
  );
  const page = await request("cold jobs", "/api/jobs");
  assert.ok(page.json().items.length <= 75);
  const detailId = page.json().items[0]?.id;
  assert.ok(detailId, "Fixture must contain a visible job");
  await request("warm locations", "/api/job-locations");
  await request("warm details", `/api/jobs/${detailId}`);
  const unchanged = await request("conditional jobs", "/api/jobs", {
    "if-none-match": String(page.headers.etag),
  });
  assert.equal(unchanged.statusCode, 304);
  const bootstrap = await request("bootstrap", "/api/bootstrap");
  const originalChoices = store.db
    .prepare(
      `SELECT id, json_extract(document,'$.title') AS title,
    json_extract(document,'$.company') AS company FROM jobs
    WHERE json_extract(document,'$.savedAt') IS NOT NULL
      OR EXISTS (SELECT 1 FROM cover_letter_versions WHERE job_id=jobs.id)
    ORDER BY first_seen_at DESC,id`,
    )
    .all()
    .map((row) => ({ ...row }));
  assert.deepEqual(bootstrap.json().coverLetterJobs, originalChoices);

  // A second SQLite connection represents a worker change without launching a scheduler.
  const worker = new DatabaseSync(join(directory, "job-hunter.db"));
  try {
    const revision = jobsRevision();
    worker
      .prepare(
        "UPDATE jobs SET document=json_set(document,'$.notes',?) WHERE id=?",
      )
      .run("Isolated refresh check", detailId);
    assert.notEqual(jobsRevision(), revision);
    const refreshHeaders = { "x-jobs-revision": page.json().revision };
    const shared = await request(
      "same refresh during worker write",
      "/api/jobs",
      refreshHeaders,
    );
    assert.equal(shared.json().revision, page.json().revision);
    await request(
      "same refresh locations",
      "/api/job-locations",
      refreshHeaders,
    );
    await request(
      "same refresh details",
      `/api/jobs/${detailId}`,
      refreshHeaders,
    );
    const refreshed = await request(
      "after worker write",
      `/api/jobs/${detailId}`,
    );
    assert.equal(refreshed.json().notes, "Isolated refresh check");
    worker
      .prepare(
        "UPDATE source_items SET last_seen_at=last_seen_at WHERE rowid=(SELECT rowid FROM source_items LIMIT 1)",
      )
      .run();
    await request("after listing evidence write", "/api/job-locations");
  } finally {
    worker.close();
  }
  timestamp += 60000;
  await request("minute freshness expiry", "/api/jobs");
  await request("saved", "/api/jobs?view=saved");
  await request(
    "location filter",
    "/api/jobs?locations=%5B%22country%3AMY%22%5D",
  );
  const evidence = resolve(".local-data/verification/inbox-performance");
  mkdirSync(evidence, { recursive: true });
  const result = {
    jobs: total,
    requestBudgetMs: 10000,
    uiTimeoutMs: 15000,
    measurements,
    passed: true,
  };
  writeFileSync(
    join(evidence, "api-results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  Date.now = originalNow;
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
