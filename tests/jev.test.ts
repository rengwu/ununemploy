import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-jev-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = new URL("./fixtures/profile.json", import.meta.url).pathname;
process.env.JH_TEST_SERVER = "1";
process.env.JH_JEV_API_KEY = "";
const store = await import("../core/db/index.ts");
const service = await import("../core/jev/service.ts");
const assessment = await import("../core/jev/assessment.ts");
const { jevToken } = await import("../core/jev/auth.ts");
const { app } = await import("../server/index.ts");
const { queryJobs, jobQuerySchema, jobsRevision } =
  await import("../core/job-query.ts");
const { assessEligibility } = await import("../core/eligibility.ts");
const { mentionedLocations } = await import("../core/location-index.ts");
const profile = structuredClone(store.getProfile());
const source = store.addSource({
  name: "Jev fixture",
  type: "ashby",
  identifier: "jev-fixtures",
  enabled: false,
  requestLimit: 1,
});
const description =
  "Build customer-facing products using React and TypeScript. Work from our Berlin office three days per week and from home the other days. Visa sponsorship is available for this role. We welcome applicants willing to relocate to Germany. Collaborate on interface design and frontend architecture with other experienced engineers.";
function job(overrides = {}) {
  return store.ingestJob(source, {
    sourceItemId: "fixture",
    title: "Senior Frontend Engineer",
    company: "Fixture employer",
    location: "Germany",
    arrangement: "Remote",
    employmentType: "FullTime",
    salary: "",
    url: "https://example.com/jev-fixture",
    description,
    descriptionQuality: "full",
    publishedAt: store.now(),
    kind: "opening",
    ...overrides,
  }).job;
}
type Input = ReturnType<typeof assessment.buildJevRequest>;
function response(input: Input, choices: Record<string, string> = {}) {
  const pickEvidence = (needle: string) =>
    Object.entries(input.evidence).find(([, text]) =>
      text.includes(needle),
    )?.[0] || "unknown";
  const selected: Record<string, string> = {
    match: "strong",
    arrangement: "hybrid",
    sponsorship: "available",
    eligibility: "review",
    location_evidence: pickEvidence("Berlin office"),
    arrangement_evidence: pickEvidence("Berlin office"),
    sponsorship_evidence: pickEvidence("Visa sponsorship"),
    eligibility_evidence: "unknown",
    ...choices,
  };
  return {
    model: "jev-1.13.0",
    answers: Object.fromEntries(
      Object.entries(input.request.questions).map(([key, q]) => {
        const options = Object.keys(q.criteria);
        const choice =
          selected[key] || (key.startsWith("place_") ? "workplace" : "unknown");
        return [
          key,
          {
            type: "choice",
            choice,
            probabilities: Object.fromEntries(
              options.map((o) => [
                o,
                o === choice ? 0.99 : 0.01 / (options.length - 1),
              ]),
            ),
            confidence: 0.99,
          },
        ];
      }),
    ),
    usage: { input_tokens: 600, output_tokens: 150 },
  };
}
function mockFetch(choices: Record<string, string> = {}): typeof fetch {
  return async (url, init) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.deepEqual(init?.headers, {
      Authorization: "Bearer fixture-key",
      "Content-Type": "application/json",
    });
    const request = JSON.parse(init!.body as string);
    const evidence = Object.fromEntries(
      Object.entries(request.questions.location_evidence.criteria).filter(
        ([k]) => k !== "unknown",
      ),
    ) as Record<string, string>;
    return Response.json(response({ request, evidence, places: [] }, choices));
  };
}
beforeEach(() => {
  store.db.exec(
    "DELETE FROM jev_assessments; DELETE FROM source_items; DELETE FROM source_item_versions; DELETE FROM jobs; DELETE FROM counters; DELETE FROM leases;",
  );
  service.configureJev("");
  service.saveJevSettings({ enabled: true, dailyLimit: 100 });
});
after(async () => {
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("no key means no inference, no assessment UI data, and unchanged query results", async () => {
  const j = job();
  let calls = 0;
  await service.processJevJob(async () => {
    calls++;
    throw new Error("must not call");
  });
  assert.equal(calls, 0);
  assert.equal(service.enrichJobs([j])[0].jev, undefined);
  assert.equal(queryJobs(jobQuerySchema.parse({})).items[0].score, j.score);
});
test("API key is write-only, mode 0600, removable, masks environment fallback and invalidates lists", async () => {
  const rev = jobsRevision();
  process.env.JH_JEV_API_KEY = "environment-key";
  const saved = await app.inject({
    method: "POST",
    url: "/api/jev/key",
    payload: { token: "fixture-key" },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(jevToken(), "fixture-key");
  assert.equal(
    statSync(join(directory, "secrets/jev.json")).mode & 0o777,
    0o600,
  );
  assert.notEqual(jobsRevision(), rev);
  const boot = await app.inject({ method: "GET", url: "/api/bootstrap" });
  assert.equal(boot.json().jev.configured, true);
  assert.ok(!boot.body.includes("fixture-key"));
  await app.inject({ method: "DELETE", url: "/api/jev/key" });
  assert.equal(jevToken(), "");
  process.env.JH_JEV_API_KEY = "";
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/jev/key",
        payload: { token: "bad\nkey" },
      })
    ).statusCode,
    400,
  );
});
test("projection excludes contacts, notes, source files, URLs and generated documents", () => {
  const p = structuredClone(profile),
    j = job();
  p.basics.name = "PRIVATE_NAME";
  p.basics.email = "PRIVATE_EMAIL";
  p.basics.phone = "PRIVATE_PHONE";
  p.sources[0].localEvidenceFile = "PRIVATE_PATH";
  p.preferences.secret = "PRIVATE_PREFERENCE";
  j.notes = "PRIVATE_NOTES";
  const input = assessment.buildJevRequest(j, p),
    serialized = JSON.stringify(input.request);
  assert.ok(!serialized.includes("PRIVATE_"));
  assert.ok(!serialized.includes(j.url));
  assert.equal(input.request.state.candidate.citizenship, p.basics.citizenship);
  assert.equal(
    input.request.state.candidate.projects.length,
    p.projects.length,
  );
  assert.match(
    input.request.questions.match.instructions,
    /Project experience is not professional/,
  );
});
test("strict validation rejects missing answers, invented choices and invalid distributions", () => {
  const j = job(),
    input = assessment.buildJevRequest(j, profile),
    fp = assessment.jevFingerprint(j, profile);
  const valid = response(input);
  assert.equal(
    assessment.parseJevResponse(valid, input, fp).model,
    "jev-1.13.0",
  );
  const missing = structuredClone(valid);
  delete missing.answers.arrangement;
  assert.throws(() => assessment.parseJevResponse(missing, input, fp));
  const invented = structuredClone(valid);
  invented.answers.match.choice = "guaranteed";
  assert.throws(() => assessment.parseJevResponse(invented, input, fp));
  const broken = structuredClone(valid);
  broken.answers.match.probabilities.strong = 2;
  assert.throws(() => assessment.parseJevResponse(broken, input, fp));
  const low = structuredClone(valid);
  low.answers.arrangement.confidence = 0.2;
  const a = assessment.parseJevResponse(low, input, fp);
  assert.equal(
    assessment.applyJevAssessment(j, a, profile).arrangement,
    "Remote",
  );
});
test("assessment updates sorting and work/location filters while preserving source records and cache", async () => {
  const j = job();
  service.configureJev("fixture-key");
  await service.processJevJob(mockFetch());
  const enriched = service.enrichJobs([j])[0];
  assert.equal(enriched.jev?.state, "completed");
  assert.equal(enriched.arrangement, "hybrid");
  assert.match(enriched.location, /Berlin/);
  assert.equal(store.getJob(j.id)?.arrangement, "Remote");
  assert.equal(
    queryJobs(jobQuerySchema.parse({ arrangement: "remote" })).total,
    0,
  );
  assert.equal(
    queryJobs(
      jobQuerySchema.parse({
        arrangement: "hybrid",
        locations: '["country:DE"]',
      }),
    ).total,
    1,
  );
  let calls = 0;
  await service.processJevJob(async () => {
    calls++;
    throw new Error();
  });
  assert.equal(calls, 0);
  assert.equal(service.jevStatus().used, 1);
  assert.equal(service.jevStatus().inputTokens, 600);
  assert.equal(service.jevStatus().outputTokens, 150);
  const persisted = new DatabaseSync(join(directory, "job-hunter.db"), {
    readOnly: true,
  });
  assert.equal(
    persisted
      .prepare("SELECT state FROM jev_assessments WHERE job_id=?")
      .get(j.id)?.state,
    "completed",
  );
  assert.equal(
    persisted
      .prepare("SELECT value FROM counters WHERE key LIKE '%:requests'")
      .get()?.value,
    1,
  );
  persisted.close();
  service.configureJev("");
  assert.equal(
    queryJobs(jobQuerySchema.parse({ arrangement: "remote" })).total,
    1,
  );
});
test("pausing removes applied assessments without deleting cache; re-enabling reuses it", async () => {
  const j = job();
  service.configureJev("fixture-key");
  await service.processJevJob(mockFetch());
  service.saveJevSettings({ enabled: false, dailyLimit: 100 });
  assert.equal(service.enrichJobs([j])[0].arrangement, "Remote");
  await service.processJevJob(async () => {
    throw new Error("must not call");
  });
  service.saveJevSettings({ enabled: true, dailyLimit: 100 });
  assert.equal(service.enrichJobs([j])[0].arrangement, "hybrid");
});
test("posting and relevant candidate changes invalidate results but notes and contacts do not", async () => {
  const j = job();
  service.configureJev("fixture-key");
  await service.processJevJob(mockFetch());
  const changed = {
    ...j,
    description: j.description + " Office attendance is no longer required.",
  };
  store.writeJob(changed);
  assert.equal(service.enrichJobs([changed])[0].jev?.state, "pending");
  assert.equal(
    assessment.jevFingerprint(j, profile),
    assessment.jevFingerprint(
      { ...j, notes: "new note" },
      { ...profile, basics: { ...profile.basics, email: "new@example.com" } },
    ),
  );
  assert.notEqual(
    assessment.jevFingerprint(j, profile),
    assessment.jevFingerprint(j, {
      ...profile,
      basics: { ...profile.basics, citizenship: "German" },
    }),
  );
});
test("in-flight stale results cannot replace new content or survive key removal", async () => {
  const j = job();
  service.configureJev("fixture-key");
  await service.processJevJob(async (...args) => {
    store.writeJob({
      ...j,
      description: j.description + " Updated requirements.",
    });
    return mockFetch()(...args);
  });
  assert.equal(
    service.enrichJobs([store.getJob(j.id)!])[0].jev?.state,
    "pending",
  );
  await service.processJevJob(async (...args) => {
    service.configureJev("");
    return mockFetch()(...args);
  });
  assert.equal(
    store.db
      .prepare("SELECT document FROM jev_assessments WHERE job_id=?")
      .get(j.id)?.document,
    null,
  );
});
test("daily reservations persist on failures, Retry-After is respected, and provider bodies stay private", async () => {
  job();
  service.configureJev("fixture-key");
  service.saveJevSettings({ enabled: true, dailyLimit: 1 });
  await service.processJevJob(
    async () =>
      new Response("fixture-key PRIVATE_PROFILE", {
        status: 429,
        headers: { "retry-after": "7200" },
      }),
  );
  assert.equal(service.jevStatus().used, 1);
  assert.ok(Date.parse(service.jevStatus().retryAt!) > Date.now() + 7_000_000);
  assert.ok(!JSON.stringify(service.jevStatus()).includes("fixture-key"));
  let calls = 0;
  await service.processJevJob(async () => {
    calls++;
    throw new Error();
  });
  assert.equal(calls, 0);
  service.resumeJev();
  await service.processJevJob(async () => {
    calls++;
    throw new Error();
  });
  assert.equal(calls, 0);
});
test("authentication and malformed responses pause inference with an explicit retry", async () => {
  job();
  service.configureJev("fixture-key");
  await service.processJevJob(
    async () => new Response("PRIVATE", { status: 401 }),
  );
  assert.equal(service.jevStatus().state, "blocked");
  assert.match(service.jevStatus().message!, /API key/);
  service.resumeJev();
  await service.processJevJob(async () => Response.json({ answers: {} }));
  assert.equal(service.jevStatus().state, "blocked");
  assert.match(service.jevStatus().message!, /invalid assessment/);
  service.resumeJev();
  await service.processJevJob(mockFetch());
  assert.equal(service.jevStatus().state, "ready");
});
test("unknown authorization and no sponsorship do not become zero-chance exclusions", () => {
  const j = job({
    location: "United States",
    description:
      "Remote role in the United States. We do not provide visa sponsorship. Build frontend products with React and TypeScript.",
    descriptionQuality: "full",
  });
  const p = structuredClone(profile);
  p.preferences.existingWorkAuthorizationsOutsideMalaysia = null;
  p.basics.citizenship = "";
  assert.notEqual(
    assessEligibility({ ...j, description: "US citizens only." }, p)
      .eligibility,
    "incompatible",
  );
  const input = assessment.buildJevRequest(j, p),
    raw = response(input, {
      eligibility: "conflict",
      eligibility_evidence: Object.entries(input.evidence).find(([, text]) =>
        text.includes("sponsorship"),
      )![0],
    });
  const a = assessment.parseJevResponse(
    raw,
    input,
    assessment.jevFingerprint(j, p),
  );
  const enriched = assessment.applyJevAssessment(
    { ...j, ...assessEligibility(j, p) },
    a,
    p,
  );
  assert.equal(enriched.eligibility, "review");
});
test("known citizenship conflicts remain excluded and are available through the incompatible filter", async () => {
  const j = job({
    location: "United States",
    description:
      "US citizens only. Build web products using React and TypeScript, with responsibility for interface architecture and accessibility.",
  });
  assert.equal(j.eligibility, "incompatible");
  service.configureJev("fixture-key");
  await service.processJevJob(mockFetch({ eligibility: "possible" }));
  assert.equal(queryJobs(jobQuerySchema.parse({})).total, 0);
  assert.equal(
    queryJobs(jobQuerySchema.parse({ eligibility: "incompatible" })).total,
    1,
  );
  assert.equal(store.listTasks().length, 0);
});
test("Jev cannot inflate incomplete matches and quotes are exact source slices", () => {
  const j = job({ descriptionQuality: "excerpt" }),
    input = assessment.buildJevRequest(j, profile);
  const a = assessment.parseJevResponse(
    response(input),
    input,
    assessment.jevFingerprint(j, profile),
  );
  assert.equal(assessment.applyJevAssessment(j, a, profile).score, j.score);
  assert.ok(j.description.includes(a.arrangementEvidence!));
  assert.ok(
    mentionedLocations("Our Berlin office is in Germany.").includes("Berlin"),
  );
});
test("queue endpoint prioritizes requested jobs without making network requests or generating letters", async () => {
  const j = job();
  assert.equal(
    (await app.inject({ method: "POST", url: `/api/jobs/${j.id}/jev` }))
      .statusCode,
    400,
  );
  service.configureJev("fixture-key");
  const result = await app.inject({
    method: "POST",
    url: `/api/jobs/${j.id}/jev`,
  });
  assert.equal(result.statusCode, 202);
  assert.equal(result.json().state, "queued");
  assert.equal(service.jevStatus().used, 0);
  assert.equal(store.listTasks().length, 0);
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: "/api/jev/settings",
        payload: { enabled: true, dailyLimit: -1 },
      })
    ).statusCode,
    400,
  );
});

test("only one worker can assess at a time and interrupted requests resume", async () => {
  const j = job();
  service.configureJev("fixture-key");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const first = service.processJevJob(async (...args) => {
    calls++;
    await pending;
    return mockFetch()(...args);
  });
  await service.processJevJob(async (...args) => {
    calls++;
    return mockFetch()(...args);
  });
  assert.equal(calls, 1);
  release();
  await first;
  store.db
    .prepare(
      "UPDATE jev_assessments SET state='running', document=NULL, updated_at=? WHERE job_id=?",
    )
    .run(new Date(Date.now() - 100000).toISOString(), j.id);
  await service.processJevJob(mockFetch());
  assert.equal(service.enrichJobs([j])[0].jev?.state, "completed");
});
test("oversized input is not truncated or sent and can be retried after a description edit", async () => {
  const j = job({ description: "Explicit requirement. ".repeat(5000) });
  service.configureJev("fixture-key");
  let calls = 0;
  await service.processJevJob(async () => {
    calls++;
    throw new Error();
  });
  assert.equal(calls, 0);
  assert.equal(service.jevStatus().used, 0);
  assert.equal(service.enrichJobs([j])[0].jev?.state, "failed");
  const updated = store.writeJob({ ...j, description });
  await service.processJevJob(mockFetch());
  assert.equal(service.enrichJobs([updated])[0].jev?.state, "completed");
});

test("Jev respects role evidence caps even when the original score did not reach the cap", () => {
  const j = job({
    title: "Staff Frontend Engineer",
    description:
      "Build frontend products with React and TypeScript. Work remotely on platform architecture and interfaces for customers.",
  });
  assert.equal(j.matchScoreCap, 64);
  const input = assessment.buildJevRequest(j, profile);
  const a = assessment.parseJevResponse(
    response(input),
    input,
    assessment.jevFingerprint(j, profile),
  );
  const lower = {
    ...j,
    score: 50,
    matchBreakdown: [{ label: "Role", points: 50 }],
  };
  assert.equal(assessment.applyJevAssessment(lower, a, profile).score, 64);
});
