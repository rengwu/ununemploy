import { fileURLToPath } from "node:url";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-seen-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = fileURLToPath(
  new URL("./fixtures/profile.json", import.meta.url),
);
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const { app } = await import("../server/index.ts");
const { jobsRevision } = await import("../core/job-query.ts");
const source = store.addSource({
  name: "Seen fixture",
  type: "ashby",
  identifier: "seen-fixture",
  enabled: false,
  requestLimit: 1,
});
const incoming = {
  sourceItemId: "one",
  title: "Senior Frontend Engineer",
  company: "Seen company",
  url: "https://example.com/seen-one",
  location: "Malaysia",
  arrangement: "Remote",
  salary: "",
  employmentType: "FullTime",
  description:
    "Build React and TypeScript product experiences, design systems and developer tools in a small product engineering team.",
  publishedAt: store.now(),
  kind: "opening" as const,
};
const job = store.ingestJob(source, incoming).job;
const other = store.ingestJob(source, {
  ...incoming,
  sourceItemId: "two",
  url: "https://example.com/seen-two",
}).job;
after(async () => {
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("only the explicit seen mutation records an open; it is idempotent and preserves every other field", async () => {
  await app.inject({ method: "GET", url: `/api/jobs/${job.id}` });
  await app.inject({ method: "GET", url: "/api/jobs" });
  assert.equal(store.getJob(job.id)?.seenAt, undefined);
  const before = store.getJob(job.id)!;
  const revision = jobsRevision();
  const response = await app.inject({
    method: "POST",
    url: `/api/jobs/${job.id}/seen`,
    payload: {},
  });
  assert.equal(response.statusCode, 200);
  const timestamp = response.json().seenAt;
  assert.ok(Number.isFinite(Date.parse(timestamp)));
  const after = store.getJob(job.id)!;
  const { seenAt, ...rest } = after;
  assert.deepEqual(rest, before);
  assert.notEqual(jobsRevision(), revision);
  const updated = jobsRevision();
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/jobs/${job.id}/seen`,
        payload: {},
      })
    ).json().seenAt,
    timestamp,
  );
  assert.equal(jobsRevision(), updated);
  assert.equal(store.getJob(other.id)?.seenAt, undefined);
  assert.equal(store.listTasks().length, 0);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/jobs/missing/seen",
        payload: {},
      })
    ).statusCode,
    404,
  );
});

test("seen filtering is independent of saving and survives source refreshes and database reopening", async () => {
  const timestamp = store.getJob(job.id)!.seenAt;
  store.queueCoverLetter(job.id);
  store.ingestJob(source, {
    ...incoming,
    description: incoming.description + " Updated responsibilities.",
  });
  assert.equal(store.getJob(job.id)?.seenAt, timestamp);
  assert.equal(store.getJob(job.id)?.status, "saved");
  const fetchPage = async (query: string) =>
    (
      await app.inject({
        method: "GET",
        url: `/api/jobs?duplicates=all&${query}`,
      })
    ).json();
  assert.deepEqual(
    (await fetchPage("seen=seen")).items.map((j: { id: string }) => j.id),
    [job.id],
  );
  assert.deepEqual(
    (await fetchPage("seen=unseen")).items.map((j: { id: string }) => j.id),
    [other.id],
  );
  assert.equal((await fetchPage("view=saved&seen=seen")).total, 1);
  assert.equal((await fetchPage("view=saved&seen=unseen")).total, 0);
  assert.equal((await fetchPage("seen=seen")).items[0].seenAt, timestamp);
  const reopened = new DatabaseSync(join(directory, "job-hunter.db"), {
    readOnly: true,
  });
  assert.equal(
    (
      reopened
        .prepare(
          "SELECT json_extract(document,'$.seenAt') AS seenAt FROM jobs WHERE id=?",
        )
        .get(job.id) as { seenAt: string }
    ).seenAt,
    timestamp,
  );
  reopened.close();
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/jobs?seen=invalid" }))
      .statusCode,
    400,
  );
});
