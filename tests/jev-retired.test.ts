import { fileURLToPath } from "node:url";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "ununemploy-jev-disabled-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = fileURLToPath(
  new URL("./fixtures/profile.json", import.meta.url),
);
process.env.JH_TEST_SERVER = "1";
process.env.JH_JEV_API_KEY = "environment-fixture-key";
const store = await import("../core/db/index.ts");
const { queryJobs, jobQuerySchema } = await import("../core/job-query.ts");
const { app } = await import("../server/index.ts");

after(async () => {
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("Jev is retired while credentials, settings, queued work, assessments and counters survive", async () => {
  mkdirSync(join(directory, "secrets"), { recursive: true });
  writeFileSync(
    join(directory, "secrets/jev.json"),
    JSON.stringify({ token: "retained-fixture-key" }),
    { mode: 0o600 },
  );
  store.putSetting("jevSettings", { enabled: true, dailyLimit: 200 });
  store.putSetting("jevRuntime", {
    state: "ready",
    message: null,
    retryAt: null,
    failures: 0,
  });
  const source = store.addSource({
    name: "Offline fixture",
    type: "ashby",
    identifier: "disabled-jev",
    enabled: false,
    requestLimit: 1,
  });
  const jobs = ["cached", "queued"].map(
    (id) =>
      store.ingestJob(source, {
        sourceItemId: id,
        title: "Frontend Engineer",
        company: "Example",
        location: "Germany",
        arrangement: "Remote",
        employmentType: "FullTime",
        salary: "",
        url: `https://example.com/disabled-jev/${id}`,
        description:
          "Build React and TypeScript applications. Work remotely from Germany. Collaborate on accessible interfaces and frontend architecture with the engineering team.",
        descriptionQuality: "full",
        publishedAt: store.now(),
        kind: "opening",
      }).job,
  );
  const choice = (value: string) => ({
    type: "choice",
    choice: value,
    confidence: 1,
    probabilities: { [value]: 1 },
  });
  const cached = {
    fingerprint: "retained-fingerprint",
    assessedAt: store.now(),
    model: "jev-1.13.0",
    match: choice("strong"),
    arrangement: choice("onsite"),
    sponsorship: choice("unknown"),
    eligibility: choice("unknown"),
    locationEvidence: "Germany",
    arrangementEvidence: "Germany",
    eligibilityEvidence: null,
    sponsorshipEvidence: null,
    locations: [{ name: "Berlin", kind: "workplace", confidence: 1 }],
    usage: { input_tokens: 600, output_tokens: 150 },
  };
  for (const [i, job] of jobs.entries())
    store.db
      .prepare("INSERT INTO jev_assessments VALUES (?,?,?,?,?,?,?)")
      .run(
        job.id,
        "retained-fingerprint",
        i === 0 ? "completed" : "queued",
        i === 0 ? JSON.stringify(cached) : null,
        null,
        store.now(),
        i,
      );
  store.incrementCounter(`jev:${store.now().slice(0, 10)}:requests`, 7);
  const snapshot = () => ({
    assessments: store.db
      .prepare("SELECT * FROM jev_assessments ORDER BY job_id")
      .all(),
    counters: store.db
      .prepare("SELECT * FROM counters WHERE key LIKE 'jev:%' ORDER BY key")
      .all(),
    settings: store.db
      .prepare("SELECT * FROM settings WHERE key LIKE 'jev%' ORDER BY key")
      .all(),
    key: readFileSync(join(directory, "secrets/jev.json"), "utf8"),
  });
  const before = snapshot();
  let requests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("No inference allowed");
  };
  try {
    const listed = queryJobs(jobQuerySchema.parse({})).items;
    assert.ok(
      listed.every(
        (job) => job.arrangement === "Remote" && !("matchSource" in job),
      ),
    );
    const detail = await app.inject({
      method: "GET",
      url: `/api/jobs/${jobs[0].id}`,
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().jev, undefined);
    assert.equal(detail.json().arrangement, "Remote");
    assert.equal(detail.json().location, "Germany");
    const boot = await app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal("jev" in boot.json(), false);
    for (const request of [
      {
        method: "POST" as const,
        url: "/api/jev/key",
        payload: { token: "replacement-fixture-key" },
      },
      { method: "DELETE" as const, url: "/api/jev/key" },
      {
        method: "PUT" as const,
        url: "/api/jev/settings",
        payload: { enabled: true, dailyLimit: 10000 },
      },
      { method: "POST" as const, url: "/api/jev/retry" },
      { method: "POST" as const, url: `/api/jobs/${jobs[1].id}/jev` },
    ]) {
      const result = await app.inject(request);
      assert.equal(result.statusCode, 404);
    }
    assert.deepEqual(
      snapshot(),
      before,
      "Disabled entry points preserve credentials, cache, queue, settings and counters",
    );
    assert.equal(store.listTasks().length, 0);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
