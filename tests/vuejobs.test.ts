import { fileURLToPath } from "node:url";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-vuejobs-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = fileURLToPath(
  new URL("./fixtures/profile.json", import.meta.url),
);
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const { app } = await import("../server/index.ts");
const { parseVueJobsDescription, vueJobsPage, loadVueJobsDescription } =
  await import("../core/vuejobs.ts");
const { FetchError } = await import("../core/http.ts");
const source = store.listSources().find((s) => s.name === "VueJobs")!;
const description =
  "Build Vue and Python applications for local businesses. Own product features, review code, and work with designers on accessible user interfaces. Maintain reliable web services, diagnose production problems and improve performance. Experience with TypeScript, component design and automated testing is useful. This role is based in Bangkok and collaborates with the local product team.";
const item = (id: string) => ({
  sourceItemId: id,
  title: "Senior Fullstack Engineer",
  company: "Example employer",
  location: "Bangkok, TH",
  arrangement: "Onsite",
  employmentType: "FullTime",
  salary: "",
  url: `https://vuejobs.com/jobs/${id}?utm_source=rssfeed`,
  description: "Build Vue applications...",
  descriptionQuality: "excerpt" as const,
  kind: "lead" as const,
  publishedAt: null,
});
const page = (id: string, visible = true, extra = {}) =>
  `<html><main>${visible ? `<p>${description}</p>` : "Unlock full description"}</main><script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "JobPosting", "@id": `https://vuejobs.com/jobs/${id}#job-posting`, title: item(id).title, hiringOrganization: { name: item(id).company }, description: `<p>${description}</p>`, ...extra }] })}</script></html>`;
const counter = () => `vuejobs-details:${store.now().slice(0, 10)}`;

test("VueJobs extracts only matching, complete, publicly rendered job descriptions", () => {
  assert.equal(
    parseVueJobsDescription(page("example"), item("example")),
    description,
  );
  assert.throws(
    () => parseVueJobsDescription(page("other"), item("example")),
    /complete public description/,
  );
  assert.throws(
    () => parseVueJobsDescription(page("example", false), item("example")),
    /complete public description/,
  );
  assert.throws(
    () =>
      parseVueJobsDescription(
        page("example", true, { isAccessibleForFree: false }),
        item("example"),
      ),
    /complete public description/,
  );
  assert.throws(
    () =>
      parseVueJobsDescription(
        page("example", true, { title: "Different vacancy" }),
        item("example"),
      ),
    /complete public description/,
  );
  assert.equal(
    vueJobsPage("https://vuejobs.com/jobs/example?tracking=1#details"),
    "https://vuejobs.com/jobs/example",
  );
  for (const url of [
    "https://vuejobs.com.evil.test/jobs/example",
    "https://user@vuejobs.com/jobs/example",
    "http://vuejobs.com/jobs/example",
    "https://vuejobs.com/login",
    "https://127.0.0.1/jobs/example",
  ])
    assert.equal(vueJobsPage(url), null);
});

test("loaded descriptions keep provenance through RSS refreshes and preserve manual edits", async () => {
  const job = store.ingestJob(source, item("preserved")).job;
  let reads = 0;
  const read = async (url: string, ctx: { limit: number }) => {
    reads++;
    assert.equal(ctx.limit, 1);
    assert.equal(url, "https://vuejobs.com/jobs/preserved");
    return page("preserved");
  };
  assert.equal(
    (await app.inject(`/api/jobs/${job.id}`)).json().canLoadDescription,
    true,
  );
  const loaded = await loadVueJobsDescription(job.id, read);
  assert.equal(loaded.description, description);
  assert.equal(loaded.descriptionQuality, "full");
  assert.equal(loaded.descriptionSource?.name, "VueJobs job page");
  assert.equal(loaded.status, "new");
  assert.equal(store.listTasks().length, 0);
  store.ingestJob(source, item("preserved"));
  assert.equal(store.getJob(job.id)?.description, description);
  assert.equal(
    store.getJob(job.id)?.descriptionSource?.name,
    "VueJobs job page",
  );
  await loadVueJobsDescription(job.id, read);
  assert.equal(reads, 1);
  await app.inject({
    method: "PATCH",
    url: `/api/jobs/${job.id}`,
    payload: { description: "My manually supplied description." },
  });
  const edited = await loadVueJobsDescription(job.id, read);
  assert.equal(edited.description, "My manually supplied description.");
  assert.equal(reads, 1);
});

test("an in-flight retrieval cannot overwrite a concurrent manual edit", async () => {
  const job = store.ingestJob(source, item("concurrent-edit")).job;
  const result = await loadVueJobsDescription(job.id, async () => {
    await app.inject({
      method: "PATCH",
      url: `/api/jobs/${job.id}`,
      payload: { description: "" },
    });
    return page("concurrent-edit");
  });
  assert.equal(result.description, "");
  assert.equal(result.descriptionOverride, "");
  assert.equal(
    (await app.inject(`/api/jobs/${job.id}`)).json().canLoadDescription,
    false,
  );
});

test("Save retrieves one page and queues the complete description; repeats do not refetch", async () => {
  const job = store.ingestJob(source, item("saved")).job;
  const originalFetch = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async (url) => {
    reads++;
    assert.equal(String(url), "https://vuejobs.com/jobs/saved");
    return new Response(page("saved"), { status: 200 });
  };
  try {
    for (let i = 0; i < 2; i++) {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/jobs/${job.id}`,
        payload: { status: "saved" },
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().descriptionQuality, "full");
      assert.equal(response.json().coverLetterState, "queued");
    }
    assert.equal(reads, 1);
    const tasks = store.listTasks().filter((t) => t.jobId === job.id);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].input.job.description, description);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed requests preserve excerpts, honor provider cooldown, and limit retries", async () => {
  const job = store.ingestJob(source, item("rate-limited")).job;
  let reads = 0;
  const read = async () => {
    reads++;
    throw new FetchError("Source returned HTTP 429.", 7200000, 429);
  };
  await assert.rejects(loadVueJobsDescription(job.id, read), /429/);
  await assert.rejects(loadVueJobsDescription(job.id, read), /429/);
  const other = store.ingestJob(source, item("cooldown")).job;
  await assert.rejects(
    loadVueJobsDescription(other.id, read),
    /asked us to wait/,
  );
  assert.equal(reads, 1);
  assert.equal(store.getJob(job.id)?.descriptionQuality, "excerpt");
  assert.ok(
    store.setting<number>("vuejobsDetailRetryAt", 0) > Date.now() + 7100000,
  );
  store.putSetting("vuejobsDetailRetryAt", 0);
});

test("daily cap preserves saves and leaves a retryable task without more network calls", async () => {
  store.incrementCounter(counter(), 6 - store.getCounter(counter()));
  const job = store.ingestJob(source, item("daily-limit")).job;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Must not request past the cap");
  };
  try {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/jobs/${job.id}`,
      payload: { status: "saved", notes: "Keep these notes" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "saved");
    assert.equal(response.json().notes, "Keep these notes");
    const task = store.listTasks().find((t) => t.jobId === job.id)!;
    assert.equal(task.state, "needs_details");
    assert.match(task.error!, /six-per-day/);
    assert.equal(store.getCounter(counter()), 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

after(async () => {
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});
