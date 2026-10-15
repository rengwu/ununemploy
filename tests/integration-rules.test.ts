import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { lead, parseBoardDetail } from "../core/boards/parsers.ts";
import { assessEligibility } from "../core/eligibility.ts";
import type { IncomingJob } from "../core/types.ts";

const dir = mkdtempSync(join(tmpdir(), "ununemploy-rules-"));
process.env.JH_DATA_DIR = dir;
process.env.JH_PROFILE_SEED = new URL(
  "./fixtures/profile.json",
  import.meta.url,
).pathname;
const store = await import("../core/db/index.ts");
const queue = await import("../core/boards/queue.ts");
const { collectPublicBoard, BoardPartialError } =
  await import("../core/boards/collector.ts");
const { FetchError } = await import("../core/http.ts");
after(() => {
  store.db.close();
  rmSync(dir, { recursive: true, force: true });
});
const source = store
  .listSources()
  .find((s) => s.type === "public_board" && s.identifier === "tryremote")!;
const prose =
  "Build accessible TypeScript applications with a small engineering team. ".repeat(
    6,
  );
const job = (id: string): IncomingJob => ({
  ...lead(
    "tryremote",
    `https://tryremote.com/remote-jobs/123-${id}-engineer`,
    "Engineer",
  ),
  company: "Example",
  salary: "100",
  description: prose,
  descriptionQuality: "full",
});
const page = (j: IncomingJob, patch = {}) =>
  `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", url: j.url, title: j.title, hiringOrganization: { name: j.company }, description: j.description, ...patch })}</script>`;
const checkpoint = (cp: Record<string, unknown>) => {
  source.checkpoint = cp;
  store.saveSource(source);
};
const clearQueue = () =>
  store.db.prepare("DELETE FROM board_queue WHERE source_id=?").run(source.id);

test("observation time and property order do not create content versions; legacy hashes retain history", () => {
  const j = job("hash");
  const first = store.ingestJob(source, {
    ...j,
    descriptionSource: {
      name: source.name,
      url: j.url,
      checkedAt: "2026-09-01T00:00:00Z",
    },
  });
  store.db
    .prepare(
      "UPDATE source_items SET content_hash='legacy',changed_at='2026-09-01T00:00:00Z',last_seen_at='2026-09-01T00:00:00Z' WHERE job_id=?",
    )
    .run(first.job.id);
  const repeat = store.ingestJob(source, {
    descriptionSource: {
      name: source.name,
      url: j.url,
      checkedAt: "2026-10-08T00:00:00Z",
    },
    ...j,
  });
  assert.equal(repeat.updated, 0);
  assert.equal(repeat.job.contentChangedAt, "2026-09-01T00:00:00Z");
  assert.ok(repeat.job.lastSeenAt > "2026-09-01T00:00:00Z");
  assert.equal(
    store.db
      .prepare(
        "SELECT count(*) AS n FROM source_item_versions WHERE source_id=? AND source_item_id=?",
      )
      .get(source.id, j.sourceItemId)!.n,
    1,
  );
  assert.equal(
    store.ingestJob(source, {
      ...j,
      description: prose + "New responsibilities.",
    }).updated,
    1,
  );
});

test("queue and ingestion preserve detail metadata until a successful full refresh", () => {
  const j = Object.freeze(job("precedence"));
  queue.enqueueBoardJob(source.id, j);
  const first = store.ingestJob(source, j).job;
  store.writeJob({
    ...first,
    status: "saved",
    notes: "Keep my note",
    descriptionOverride: "My edited description",
  });
  const card = Object.freeze({
    ...j,
    title: "Senior Engineer",
    salary: "200",
    description: "Short excerpt...",
    descriptionQuality: "excerpt" as const,
  });
  assert.equal(queue.enqueueBoardJob(source.id, card).title, "Engineer");
  assert.equal(store.ingestJob(source, card).job.title, "Engineer");
  const refreshed = store.ingestJob(source, {
    ...card,
    description: prose,
    descriptionQuality: "full",
  }).job;
  assert.equal(refreshed.title, "Senior Engineer");
  assert.equal(refreshed.salary, "200");
  assert.equal(refreshed.description, "My edited description");
  assert.equal(refreshed.status, "saved");
  assert.equal(refreshed.notes, "Keep my note");
});

test("all visible-section parsers preserve structured hiring restrictions", () => {
  for (const [key, url, section] of [
    [
      "tryremote",
      "https://tryremote.com/remote-jobs/1-engineer",
      `<section class="job-description">${prose}</section>`,
    ],
    [
      "nofluff",
      "https://nofluffjobs.com/job/engineer",
      `<section id="posting-description">${prose}</section>`,
    ],
    [
      "wantedly",
      "https://www.wantedly.com/projects/123",
      `<section class="ProjectDescription__Section-sc-test">${prose}</section>`,
    ],
    [
      "relocate",
      "https://relocate.me/japan/tokyo/example/engineer-123",
      `<section class="job-info__description">${prose}</section>`,
    ],
    [
      "cake",
      "https://www.cake.me/companies/example/jobs/engineer",
      `<section class="JobDescriptionBlock-test__content">${prose}</section>`,
    ],
  ]) {
    const j = { ...job(key), url };
    const html =
      page(j, {
        description: "An excerpt...",
        jobLocation: { address: { addressCountry: "Malaysia" } },
        applicantLocationRequirements: { name: "United States" },
      }) + section;
    const parsed = parseBoardDetail(key, html, lead(key, url));
    assert.match(parsed.description, /Applicant locations: United States/);
    assert.equal(parsed.location, "Malaysia");
    assert.equal(parsed.descriptionQuality, "full");
  }
});

test("obvious worldwide/country conflicts remain reviewable without hiding independent authorization requirements", () => {
  const j = {
    ...job("conflict"),
    arrangement: "Remote",
    location: "United States",
    locationScope: "hiring" as const,
    description:
      prose +
      "\nApplicants worldwide are eligible.\nApplicant locations: United States",
  };
  const result = assessEligibility(j, store.getProfile());
  assert.equal(result.remoteEligibility, "unknown");
  assert.equal(result.eligibility, "review");
  assert.match(result.eligibilityNotes.join(" "), /conflicting hiring/i);
  const restricted = assessEligibility(
    {
      ...j,
      description: j.description + "\nUS citizenship is required.",
    },
    store.getProfile(),
  );
  assert.equal(restricted.remoteEligibility, "unknown");
  assert.equal(restricted.eligibility, "incompatible");
});

test("legacy HTTP closures recover employer expiry on rediscovery and persist across restart", async () => {
  clearQueue();
  for (const expiresAt of [null, "2000-01-01T00:00:00Z"]) {
    const original = {
      ...job(expiresAt ? "legacy-expired" : "legacy-open"),
      expiresAt,
    };
    queue.enqueueBoardJob(source.id, original);
    const saved = store.ingestJob(source, original).job;
    // Old releases wrote HTTP removal time into the observation expiry, while
    // retaining the publisher's original expiry in the closed queue document.
    store.ingestJob(source, { ...original, expiresAt: "2020-01-01T00:00:00Z" });
    store.db
      .prepare(
        "UPDATE board_queue SET state='closed',checked_at='2020-01-01',retry_at='2020-01-02' WHERE source_id=? AND url=?",
      )
      .run(source.id, original.url);
    const rediscovered = queue.enqueueBoardJob(
      source.id,
      lead("tryremote", original.url, "Engineer"),
    );
    store.ingestJob(source, rediscovered);
    assert.equal(
      store.jobObservations(saved.id)[0].item.expiresAt ?? null,
      expiresAt,
    );
    assert.equal(store.getJob(saved.id)!.availability, "closed");
    const fromRestart = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
      const { db, getJob } = await import('./core/db/index.ts');
      const { dueBoardJobs } = await import('./core/boards/queue.ts');
      console.log(JSON.stringify({ availability: getJob(${JSON.stringify(saved.id)}).availability, queued: dueBoardJobs(${JSON.stringify(source.id)}).some(r => r.url === ${JSON.stringify(original.url)}) }));
      db.close();
    `,
        ],
        { encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } },
      ),
    );
    assert.deepEqual(fromRestart, { availability: "closed", queued: true });
    const refreshed = store.ingestJob(source, {
      ...original,
      expiresAt: undefined,
    }).job;
    assert.equal(refreshed.availability, expiresAt ? "closed" : "open");
    queue.finishBoardJob(source.id, { ...original, expiresAt: undefined });
    assert.equal(
      queue.dueBoardJobs(source.id).some((r) => r.url === original.url),
      false,
    );
  }
});

test("rediscovered HTTP removals revalidate after cooldown, reopen on success, and preserve explicit expiry", async () => {
  clearQueue();
  const j = job("reopen");
  queue.enqueueBoardJob(source.id, j);
  store.ingestJob(source, j);
  store.db
    .prepare("UPDATE board_queue SET checked_at='2000-01-01' WHERE source_id=?")
    .run(source.id);
  const emit = (j: IncomingJob) => {
    store.ingestJob(source, j);
  };
  await collectPublicBoard(
    source,
    { requests: 0, limit: 2 },
    emit,
    checkpoint,
    async (url, ctx) => {
      ctx.requests++;
      if (url === j.url) throw new FetchError("HTTP 404", 0, 404);
      return `<a href="${j.url}">Engineer</a>`;
    },
  );
  assert.equal(
    store.jobObservations(
      store.ingestJob(source, { ...lead("tryremote", j.url, "Engineer") }).job
        .id,
    )[0].item.expiresAt ?? null,
    null,
  );
  const before = store
    .listJobs()
    .find((x) => x.sourceItemId === j.sourceItemId)!;
  assert.equal(before.availability, "closed");
  queue.enqueueBoardJob(source.id, lead("tryremote", j.url, "Engineer"));
  assert.equal(queue.dueBoardJobs(source.id).length, 0);
  store.db
    .prepare(
      "UPDATE board_queue SET retry_at='2000-01-01',checked_at='2000-01-01' WHERE source_id=?",
    )
    .run(source.id);
  assert.equal(queue.dueBoardJobs(source.id).length, 1);
  await collectPublicBoard(
    source,
    { requests: 0, limit: 2 },
    emit,
    checkpoint,
    async (url, ctx) => {
      ctx.requests++;
      return url === j.url ? page(j) : `<a href="${j.url}">Engineer</a>`;
    },
  );
  assert.equal(store.getJob(before.id)!.availability, "open");
  const expired = { ...job("expiry"), expiresAt: "2000-01-01T00:00:00Z" };
  const saved = store.ingestJob(source, expired).job;
  assert.equal(
    store.ingestJob(source, { ...expired, expiresAt: undefined }).job
      .availability,
    "closed",
  );
  assert.equal(
    store.ingestJob(source, { ...expired, expiresAt: "2099-01-01T00:00:00Z" })
      .job.availability,
    "open",
  );
  assert.equal(store.getJob(saved.id)!.id, saved.id);
});

test("an overdue full detail gets a request even with more than 100 pending rows", async () => {
  clearQueue();
  const old = job("overdue");
  queue.enqueueBoardJob(source.id, old);
  store.db
    .prepare("UPDATE board_queue SET checked_at='2000-01-01' WHERE source_id=?")
    .run(source.id);
  for (let i = 0; i < 105; i++)
    queue.enqueueBoardJob(
      source.id,
      lead("tryremote", job(`pending${i}`).url, "Engineer"),
    );
  const calls: string[] = [];
  await collectPublicBoard(
    source,
    { requests: 0, limit: 2 },
    () => {},
    checkpoint,
    async (url, ctx) => {
      ctx.requests++;
      calls.push(url);
      return url === old.url ? page(old) : `<a href="${old.url}">Engineer</a>`;
    },
  );
  assert.equal(calls[1], old.url);
  assert.equal(calls.length, 2);
});

test("discovery parse failures preserve partial outcome while known details run; host blocks halt requests", async () => {
  clearQueue();
  const j = job("known");
  queue.enqueueBoardJob(source.id, lead("tryremote", j.url, "Engineer"));
  let details = 0;
  await assert.rejects(
    collectPublicBoard(
      source,
      { requests: 0, limit: 2 },
      () => {},
      checkpoint,
      async (url, ctx) => {
        ctx.requests++;
        if (url === j.url) {
          details++;
          return page(j);
        }
        return "<html>Unreadable layout</html>";
      },
    ),
    BoardPartialError,
  );
  assert.equal(details, 1);
  let blocked = 0;
  await assert.rejects(
    collectPublicBoard(
      source,
      { requests: 0, limit: 2 },
      () => {},
      checkpoint,
      async (_url, ctx) => {
        ctx.requests++;
        blocked++;
        throw new FetchError("HTTP 429", 86400000, 429);
      },
    ),
    FetchError,
  );
  assert.equal(blocked, 1);
});
