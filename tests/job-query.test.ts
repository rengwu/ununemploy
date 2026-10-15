import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-query-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = new URL(
  "./fixtures/profile.json",
  import.meta.url,
).pathname;
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const { app } = await import("../server/index.ts");
const { jobSnapshot, jobsRevision } = await import("../core/job-query.ts");
const { fromProfile } = await import("../core/cv/render.ts");
const { groupDuplicates } = await import("../core/deduplication.ts");
const source = store.addSource({
  name: "Query fixtures",
  type: "ashby",
  identifier: "query-fixtures",
  enabled: false,
  requestLimit: 1,
});
const description =
  "Build thoughtful native and web product experiences using React and TypeScript. Own the design system and work with a small engineering team. ";
const fixtures = Array.from(
  { length: 8 },
  (_, index) =>
    store.ingestJob(source, {
      sourceItemId: String(index),
      title: `Senior Frontend Engineer ${index}`,
      company: `Query company ${index}`,
      url: `https://example.com/query/${index}`,
      location: index % 2 ? "Singapore" : "Malaysia",
      arrangement: index % 2 ? "Onsite" : "Remote",
      salary: "",
      employmentType: "FullTime",
      description: description + (index === 3 ? "US citizens only." : ""),
      publishedAt: store.now(),
      kind: "opening",
    }).job,
);
const request = async (query: Record<string, string> = {}) =>
  app.inject({ method: "GET", url: `/api/jobs?${new URLSearchParams(query)}` });
after(async () => {
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("saving profile facts refreshes matching without changing legacy CV versions", () => {
  const profile = store.getProfile();
  const before = jobsRevision();
  const legacy = store.listCvVersions();
  const saved = store.saveProfile(profile, profile.revision);
  assert.notEqual(jobsRevision(), before);
  assert.equal(
    store.getJob(fixtures[0].id)?.matchProfileRevision,
    saved.revision,
  );
  assert.deepEqual(store.listCvVersions(), legacy);
  assert.throws(() => store.saveProfile(profile, profile.revision), /changed/);
});

test("paged summaries retain server search/filter semantics without descriptions or private notes", async () => {
  const response = await request({
    query: "thoughtful native",
    arrangement: "remote",
    locations: '["malaysia"]',
    pageSize: "3",
  });
  assert.equal(response.statusCode, 200);
  const page = response.json();
  assert.equal(page.total, 4);
  assert.equal(page.items.length, 3);
  assert.equal(page.totalPages, 2);
  for (const job of page.items) {
    assert.equal(job.location, "Malaysia");
    for (const field of [
      "description",
      "descriptionOverride",
      "notes",
      "eligibilityEvidence",
      "sourceLinks",
    ])
      assert.ok(!(field in job));
  }
  const next = (
    await request({
      query: "thoughtful native",
      arrangement: "remote",
      locations: '["malaysia"]',
      pageSize: "3",
      page: "1",
    })
  ).json();
  assert.equal(next.items.length, 1);
  assert.equal(
    new Set([...page.items, ...next.items].map((job: { id: string }) => job.id))
      .size,
    4,
  );
  assert.deepEqual(
    (
      await request({
        query: "thoughtful native",
        arrangement: "remote",
        locations: '["malaysia"]',
        pageSize: "3",
      })
    ).json().items,
    page.items,
  );
});
test("default eligibility hides clear conflicts; saved view preserves them", async () => {
  const blocked = fixtures[3];
  assert.equal(
    (await request({ eligibility: "incompatible" })).json().items[0].id,
    blocked.id,
  );
  assert.ok(
    !(await request())
      .json()
      .items.some((job: { id: string }) => job.id === blocked.id),
  );
  store.queueCoverLetter(blocked.id);
  const saved = (await request({ view: "saved" })).json();
  assert.equal(saved.total, 1);
  assert.equal(saved.items[0].id, blocked.id);
});
test("groups only after filtering and preserves original details and saved copies", async () => {
  const feed = store.addSource({
    name: "Mirror",
    type: "rss",
    identifier: "https://example.com/mirror",
    enabled: false,
    requestLimit: 1,
  });
  const url =
    "https://jobs.ashbyhq.com/query-fixtures/12345678-1234-1234-1234-123456789abc";
  const base = {
    description,
    location: "Malaysia",
    arrangement: "Remote",
    salary: "",
    employmentType: "FullTime",
    publishedAt: store.now(),
    kind: "opening" as const,
  };
  const a = store.ingestJob(source, {
    ...base,
    sourceItemId: "duplicate-a",
    title: "Duplicate fixture",
    company: "Same company",
    url,
    description,
  }).job;
  const b = store.ingestJob(feed, {
    ...base,
    sourceItemId: "duplicate-b",
    title: "Duplicate fixture",
    company: "Same company",
    url: "https://example.com/mirror/1",
    applicationUrl: url,
    description: `${description} Mirror-only keyword.`,
  }).job;
  assert.equal((await request({ query: "Duplicate fixture" })).json().total, 1);
  assert.equal(
    (await request({ query: "Duplicate fixture", duplicates: "all" })).json()
      .total,
    2,
  );
  assert.equal(
    (await request({ query: "Mirror-only keyword" })).json().items[0].id,
    b.id,
  );
  const detail = (await app.inject(`/api/jobs/${b.id}`)).json();
  assert.match(detail.description, /Mirror-only/);
  assert.ok(
    detail.relatedListings.some((job: { id: string }) => job.id === a.id),
  );
  store.queueCoverLetter(a.id);
  store.queueCoverLetter(b.id);
  assert.equal(
    (await request({ query: "Duplicate fixture", view: "saved" })).json().total,
    2,
  );
});
test("bounded input validation and page clamping", async () => {
  for (const query of [
    { pageSize: "101" },
    { page: "-1" },
    { sort: "DROP TABLE jobs" },
    { locations: "[null]" },
    { locations: "bad" },
    { query: "x".repeat(301) },
  ] as Record<string, string>[])
    assert.equal((await request(query)).statusCode, 400);
  const end = (await request({ page: "99999", pageSize: "3" })).json();
  assert.equal(end.page, end.totalPages - 1);
  const empty = (
    await request({ query: "impossible search xyz", page: "9" })
  ).json();
  assert.equal(empty.page, 0);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.items, []);
});
test("cache is reused across heartbeats and invalidated by worker writes, notes, tasks and CVs", async () => {
  const cached = jobSnapshot(),
    revision = jobsRevision();
  store.putSetting("workerHeartbeat", store.now());
  assert.equal(jobSnapshot(), cached);
  assert.equal(jobsRevision(), revision);
  const worker = new DatabaseSync(join(directory, "job-hunter.db"));
  worker
    .prepare(
      "UPDATE jobs SET document=json_set(document,'$.notes',?) WHERE id=?",
    )
    .run("Worker note", fixtures[0].id);
  worker.close();
  assert.notEqual(jobSnapshot(), cached);
  assert.equal(
    (await app.inject(`/api/jobs/${fixtures[0].id}`)).json().notes,
    "Worker note",
  );
  const task = store.queueCoverLetter(fixtures[0].id);
  const first = jobsRevision();
  store.saveTask({ ...task, state: "failed", error: "Fixture failure" });
  assert.notEqual(jobsRevision(), first);
  assert.equal(
    (await app.inject(`/api/jobs/${fixtures[0].id}`)).json().coverLetterState,
    "failed",
  );
  const cv = store.saveCv({
    jobId: fixtures[0].id,
    kind: "edited",
    document: fromProfile(store.getProfile()),
    template: store.getTemplate(),
    profileRevision: 1,
    reviewNotes: [],
    evidence: null,
    parentId: null,
  });
  assert.equal(
    (await app.inject(`/api/jobs/${fixtures[0].id}`)).json().cvId,
    cv.id,
  );
});
test("bootstrap is a small status document; conditional requests invalidate after state changes", async () => {
  const response = await app.inject("/api/bootstrap"),
    body = response.json();
  for (const field of ["jobs", "template", "profileVersions"])
    assert.ok(!(field in body));
  assert.deepEqual(Object.keys(body.profile).sort(), [
    "missing",
    "ready",
    "revision",
  ]);
  assert.ok(body.tasks.every((task: object) => !("input" in task)));
  assert.ok(Buffer.byteLength(response.body) < 80000);
  const unchanged = await app.inject({
    url: "/api/bootstrap",
    headers: { "if-none-match": response.headers.etag },
  });
  assert.equal(unchanged.statusCode, 304);
  assert.equal(unchanged.body, "");
  store.writeJob({ ...store.getJob(fixtures[1].id)!, status: "dismissed" });
  const changed = await app.inject({
    url: "/api/bootstrap",
    headers: { "if-none-match": response.headers.etag },
  });
  assert.equal(changed.statusCode, 200);
  assert.notEqual(changed.headers.etag, response.headers.etag);
  const page = await request();
  assert.equal(
    (
      await app.inject({
        url: "/api/jobs",
        headers: { "if-none-match": page.headers.etag },
      })
    ).statusCode,
    304,
  );
});
test("UTF-8 descriptions round-trip only through details, including after a large edit", async () => {
  const text = 'React 日本語 🚀 "quoted" \\ newline\n'.repeat(2000);
  const id = fixtures[6].id;
  await app.inject({
    method: "PATCH",
    url: `/api/jobs/${id}`,
    payload: { description: text },
  });
  const detail = await app.inject(`/api/jobs/${id}`);
  assert.equal(detail.json().description, text);
  assert.equal(
    (
      await app.inject({
        url: `/api/jobs/${id}`,
        headers: { "if-none-match": detail.headers.etag },
      })
    ).statusCode,
    304,
  );
  assert.ok(
    (await request({ query: "日本語" }))
      .json()
      .items.some((job: { id: string }) => job.id === id),
  );
  assert.ok(!(await request()).body.includes("quoted"));
  assert.equal((await app.inject("/api/jobs/unknown-job")).statusCode, 404);
});
test("source observations invalidate locations/freshness without mutating original records", async () => {
  const before = jobsRevision();
  store.ingestJob(source, {
    sourceItemId: "7",
    title: fixtures[7].title,
    company: fixtures[7].company,
    url: fixtures[7].url,
    description,
    location: "Taiwan",
    arrangement: "Onsite",
    salary: "",
    employmentType: "FullTime",
    publishedAt: store.now(),
    kind: "opening",
  });
  assert.notEqual(jobsRevision(), before);
  assert.ok(
    (await app.inject("/api/job-locations"))
      .json()
      .options.some((option: { label: string }) => option.label === "Taiwan"),
  );
  assert.notEqual(jobsRevision(Date.now() + 60000), jobsRevision());
});

test("batched job reads preserve detail, legacy observation, document and latest task semantics", () => {
  // Legacy installations may still have observations without a source payload.
  store.db
    .prepare("UPDATE source_items SET document=NULL WHERE job_id=?")
    .run(fixtures[2].id);
  const task = store.listTasks().find((t) => t.jobId === fixtures[0].id)!;
  store.saveTask({ ...task, id: "newer-query-task", state: "paused" });
  const original = store.saveCoverLetter({
    jobId: fixtures[0].id,
    kind: "edited",
    document: {
      name: "Fixture",
      location: "Malaysia",
      contacts: [],
      company: "Example",
      role: "Engineer",
      salutation: "Dear team,",
      paragraphs: ["Fixture letter."],
      closing: "Regards,",
    },
    template: store.getCoverLetterTemplate(),
    profileRevision: store.getProfile().revision,
    reviewNotes: [],
    evidence: null,
    parentId: null,
  });
  const latest = store.saveCoverLetter({ ...original, parentId: original.id });
  const ids = store.db
    .prepare("SELECT id FROM jobs ORDER BY first_seen_at DESC")
    .all();
  const expected = groupDuplicates(
    ids.map((row) => store.getJob(String(row.id))!),
  );
  const actual = store.listJobs();
  assert.deepEqual(actual, expected);
  assert.equal(
    actual.find((job) => job.id === fixtures[0].id)!.coverLetterState,
    "paused",
  );
  assert.equal(
    actual.find((job) => job.id === fixtures[0].id)!.coverLetterId,
    latest.id,
  );
});
