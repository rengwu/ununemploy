import { fileURLToPath } from "node:url";
import { assertPrivateFile } from "./helpers/private-file.ts";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-test-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = fileURLToPath(
  new URL("./fixtures/profile.json", import.meta.url),
);
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const { app } = await import("../server/index.ts");
const { scan } = await import("../core/scan.ts");
const { readUrl, publicUrl, isPublicAddress, RequestLimitError } =
  await import("../core/http.ts");
const { normalizeAshby } = await import("../core/connectors.ts");
const { collectX, xScanBudget, reserveXPosts, xBudgetKey } =
  await import("../core/x.ts");
const { config } = await import("../core/config.ts");
const { validateGeneration } = await import("../core/ai/generate.ts");
const { fromProfile, renderCv } = await import("../core/cv/render.ts");
const { codexArgs, codexEnvironment } = await import("../core/ai/codex.ts");
for (const s of store.listSources()) store.saveSource({ ...s, enabled: false });
store.putSetting("app", {
  ...store.getSettings(),
  scheduleEnabled: false,
  aiEnabled: false,
});
const source = store.addSource({
  name: "Test company",
  type: "rss",
  identifier: "https://8.8.8.8/jobs.xml",
  enabled: true,
  requestLimit: 2,
});
const item = {
  sourceItemId: "1",
  title: "Senior Product Engineer",
  company: "Test company",
  location: "Remote",
  arrangement: "Remote",
  employmentType: "FullTime",
  salary: "",
  url: "https://example.com/jobs/1?utm_source=feed",
  description:
    "Build product interfaces and coding agent workflows with TypeScript, React and native desktop applications.",
  publishedAt: null,
  kind: "opening" as const,
};
const originalFetch = globalThis.fetch;
after(async () => {
  globalThis.fetch = originalFetch;
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("fresh startup does not create legacy CVs", () => {
  assert.deepEqual(store.listCvVersions(), []);
});

test("rescan deduplicates and preserves saved status, notes, and CV versions", () => {
  const first = store.ingestJob(source, item).job;
  first.notes = "Ask about relocation";
  store.writeJob(first);
  const queued = store.queueCoverLetter(first.id);
  assert.equal(queued.state, "queued");
  const repeated = store.queueCoverLetter(first.id);
  assert.equal(queued.id, repeated.id);
  const cv = store.saveCv({
    jobId: first.id,
    kind: "edited",
    document: {
      ...fromProfile(store.getProfile()),
      summary: "My manually edited summary.",
    },
    template: store.getTemplate(),
    profileRevision: 1,
    reviewNotes: [],
    evidence: null,
    parentId: null,
  });
  const second = store.ingestJob(source, {
    ...item,
    description: item.description + " Updated posting.",
  });
  assert.equal(second.added, 0);
  assert.equal(second.updated, 1);
  assert.equal(second.job.id, first.id);
  assert.equal(second.job.status, "saved");
  assert.equal(second.job.notes, "Ask about relocation");
  assert.equal(
    store.getCv(cv.id)?.document.summary,
    "My manually edited summary.",
  );
  const other = store.addSource({
    name: "Other feed",
    type: "rss",
    identifier: "https://8.8.4.4/feed",
    enabled: false,
    requestLimit: 1,
  });
  assert.equal(
    store.ingestJob(other, {
      ...item,
      sourceItemId: "alternate",
      url: "https://example.com/jobs/1",
    }).job.id,
    first.id,
  );
  const dismissed = store.getJob(first.id)!;
  dismissed.status = "dismissed";
  store.writeJob(dismissed);
  store.queueCoverLetter(first.id);
  assert.equal(store.getJob(first.id)?.status, "saved");
  assert.equal(store.listTasks().length, 1);
});

test("profile saves remain atomic without creating legacy CV versions", () => {
  const profile = store.getProfile();
  const legacy = store.listCvVersions();
  const input = {
    ...profile,
    basics: { ...profile.basics, headline: "Product engineer" },
  };
  const saved = store.saveProfile(input, profile.revision);
  assert.equal(saved.revision, profile.revision + 1);
  assert.deepEqual(store.listCvVersions(), legacy);
  assert.throws(() => store.saveProfile(profile, profile.revision), /changed/);
  assert.throws(
    () =>
      store.saveProfile(profile, saved.revision, {
        onCommit: () => {
          throw new Error("Audit write failed");
        },
      }),
    /Audit write failed/,
  );
  assert.deepEqual(store.getProfile(), saved);
  assert.deepEqual(store.listCvVersions(), legacy);
});

test("legacy CV writes are retired while saved resumes remain readable and downloadable", async () => {
  const previous = store.listCvVersions(store.listJobs()[0].id)[0];
  const profile = store.getProfile();
  const payload = {
    profile,
    document: previous.document,
    template: previous.template,
    expectedRevision: profile.revision,
  };
  const before = store.listCvVersions();
  for (const [method, url] of [
    ["PUT", "/api/master"],
    ["PUT", "/api/template"],
    ["POST", "/api/cv/preview"],
    ["POST", `/api/cv/${previous.id}/versions`],
  ] as const) {
    const response = await app.inject({ method, url, payload });
    assert.equal(response.statusCode, 404, url);
  }
  assert.deepEqual(store.getProfile(), profile);
  assert.deepEqual(store.listCvVersions(), before);
  assert.deepEqual(
    (await app.inject(`/api/cv/${previous.id}`)).json(),
    previous,
  );
  assert.deepEqual(
    (await app.inject(`/api/cv?jobId=${previous.jobId}`)).json(),
    [previous],
  );
  for (const format of ["html", "docx", "pdf"]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/cv/export",
      payload: {
        document: previous.document,
        template: previous.template,
        format,
      },
    });
    assert.equal(response.statusCode, 200, response.body.slice(0, 100));
    assert.ok(response.rawPayload.length > 100);
    if (format === "html")
      assert.match(response.body, /My manually edited summary/);
    if (format === "docx")
      assert.equal(response.rawPayload.subarray(0, 2).toString(), "PK");
    if (format === "pdf")
      assert.equal(response.rawPayload.subarray(0, 4).toString(), "%PDF");
  }
  assert.deepEqual(store.listCvVersions(), before);
});

test("short descriptions wait for details and retry uses the updated job", async () => {
  const job = store.ingestJob(source, {
    ...item,
    sourceItemId: "short",
    url: "https://example.com/short",
    description: "Hiring",
  }).job;
  const task = store.queueCoverLetter(job.id);
  assert.equal(task.state, "needs_details");
  assert.equal(
    (await app.inject({ method: "POST", url: `/api/tasks/${task.id}/retry` }))
      .statusCode,
    400,
  );
  await app.inject({
    method: "PATCH",
    url: `/api/jobs/${job.id}`,
    payload: { description: item.description },
  });
  assert.equal(
    (await app.inject({ method: "POST", url: `/api/tasks/${task.id}/retry` }))
      .statusCode,
    200,
  );
  assert.equal(
    store.listTasks().find((t) => t.id === task.id)?.input.job.description,
    item.description,
  );
});

test("cover-letter validation rejects unsupported claims and resume-shaped output", () => {
  const profile = store.getProfile(),
    job = store.listJobs()[0];
  const paragraph = {
    text: profile.basics.summary,
    evidenceIds: ["profile-summary"],
  };
  const good = {
    paragraphs: [paragraph, paragraph, paragraph],
    reviewNotes: [],
  };
  const document = validateGeneration(good, profile, job).document;
  assert.equal(document.name, profile.basics.name);
  assert.equal(document.company, job.company);
  assert.equal(document.role, job.title);
  assert.equal(document.paragraphs.length, 3);
  assert.ok(!("experience" in document));
  assert.throws(
    () =>
      validateGeneration(
        {
          ...good,
          paragraphs: [
            { ...paragraph, text: "Managed 999 engineers" },
            paragraph,
            paragraph,
          ],
        },
        profile,
        job,
      ),
    /unsupported number/,
  );
  assert.throws(
    () =>
      validateGeneration(
        {
          ...good,
          paragraphs: [
            { ...paragraph, evidenceIds: ["missing"] },
            paragraph,
            paragraph,
          ],
        },
        profile,
        job,
      ),
    /missing career or job evidence/,
  );
  assert.throws(() =>
    validateGeneration(
      {
        summary: profile.basics.summary,
        experience: [],
        projects: [],
        skills: [],
      },
      profile,
      job,
    ),
  );
  assert.throws(() =>
    validateGeneration({ ...good, name: "Fabricated name" }, profile, job),
  );
  assert.throws(
    () =>
      validateGeneration(
        {
          paragraphs: Array(3).fill({ text: "Hiring", evidenceIds: ["job"] }),
          reviewNotes: [],
        },
        profile,
        job,
      ),
    /candidate evidence/,
  );
});

test("CV rendering removes scripts, forms and remote assets", () => {
  const rendered = renderCv(fromProfile(store.getProfile()), {
    html: '<h1>{{name}}</h1><script>alert(1)</script><form action="https://example.com/apply"><input></form><img src="https://example.com/a"><a href="javascript:alert(1)">X</a>',
    css: "body{background:url(https://example.com/track)}",
  });
  assert.ok(!rendered.includes("<script"));
  assert.ok(!rendered.includes("<form"));
  assert.ok(!rendered.includes("javascript:"));
  assert.match(rendered, /default-src 'none'/);
  assert.match(rendered, /form-action 'none'/);
});

test("no application or engagement endpoints exist; foreign browser writes are rejected", async () => {
  for (const url of [
    "/api/apply",
    "/api/submit",
    "/api/messages",
    "/api/email",
    "/api/x/post",
  ])
    assert.equal(
      (await app.inject({ method: "POST", url, payload: {} })).statusCode,
      404,
    );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/scan",
        headers: { origin: "https://unrelated.example" },
        payload: {},
      })
    ).statusCode,
    403,
  );
  const args = codexArgs("/tmp/isolated", "/tmp/schema", "/tmp/result");
  for (const feature of [
    "shell_tool",
    "apps",
    "plugins",
    "hooks",
    "browser_use",
    "computer_use",
    "multi_agent",
  ])
    assert.ok(args.includes(feature));
  assert.ok(args.includes("--ignore-user-config"));
  assert.ok(args.includes("gpt-5.6-sol"));
  assert.ok(args.includes('model_reasoning_effort="high"'));
  process.env.OPENAI_API_KEY = "test-excluded";
  assert.equal(codexEnvironment().OPENAI_API_KEY, undefined);
  delete process.env.OPENAI_API_KEY;
});

test("public fetch blocks private addresses and redirects, honors request budgets", async () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.4",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])
    assert.equal(isPublicAddress(address), false);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  for (const url of [
    "http://127.0.0.1/",
    "http://[::1]/",
    "file:///etc/passwd",
    "https://user:password@example.com/",
  ])
    await assert.rejects(publicUrl(url));
  await assert.rejects(
    readUrl("https://8.8.8.8/", { requests: 1, limit: 1 }),
    RequestLimitError,
  );
  globalThis.fetch = async (_url, options) => {
    assert.equal(options?.method, "GET");
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/private" },
    });
  };
  try {
    await assert.rejects(
      readUrl("https://8.8.8.8/", { requests: 0, limit: 2 }),
      /public addresses/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("manual scan respects Retry-After and the six-scan daily cap", async () => {
  globalThis.fetch = async () =>
    new Response("", { status: 429, headers: { "Retry-After": "86400" } });
  try {
    const before = store.listRuns().length;
    await scan(source.id, true);
    assert.equal(store.listRuns().length, before + 1);
    const backoff = store.getSource(source.id)!;
    assert.ok(Date.parse(backoff.retryAt!) > Date.now() + 86000000);
    backoff.lastRunAt = new Date(Date.now() - 120000).toISOString();
    store.saveSource(backoff);
    await scan(source.id, true);
    assert.equal(store.listRuns().length, before + 1);
    store.saveSource({ ...backoff, retryAt: null });
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: store.getSettings().timezone,
    }).format(new Date());
    store.incrementCounter(`scans:${source.id}:${day}`, 6);
    await scan(source.id, true);
    assert.equal(store.listRuns().length, before + 1);
    assert.equal(store.listJobs()[0].availability, "open");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Ashby excludes unlisted postings and keeps unknown compensation", () => {
  const jobs = normalizeAshby(
    {
      jobs: [
        {
          id: "a",
          title: "Product Engineer",
          jobUrl: "https://example.com/a",
          descriptionPlain: "Build",
          isListed: true,
        },
        {
          id: "b",
          title: "Private",
          jobUrl: "https://example.com/b",
          isListed: false,
        },
      ],
    },
    source,
  );
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].salary, "");
});

test("X pagination checkpoints and post reservations survive a partial scan", async () => {
  config.xToken = "test-only";
  store.putSetting("app", {
    ...store.getSettings(),
    xEnabled: true,
    xMonthlyPostLimit: 30,
  });
  let checkpoint: Record<string, unknown> = {};
  const jobs: unknown[] = [];
  const xSource = {
    ...source,
    type: "x" as const,
    identifier: "hiring engineer",
  };
  const planned = xScanBudget(
    30,
    store.getCounter(xBudgetKey()),
    store.getSettings().scanIntervalHours,
    1,
  );
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.x.com");
    assert.equal(options?.method, "GET");
    assert.equal(url.searchParams.get("max_results"), String(planned.posts));
    return Response.json({
      data: [
        {
          id: "90071992547409931",
          text: "Hiring product engineers",
          created_at: "2026-09-15T00:00:00Z",
        },
      ],
      meta: { next_token: "page-2" },
    });
  };
  try {
    await assert.rejects(
      collectX(
        xSource,
        { requests: 0, limit: 1 },
        (j) => jobs.push(j),
        (c) => {
          checkpoint = { ...c };
        },
      ),
      RequestLimitError,
    );
    assert.equal(checkpoint.nextToken, "page-2");
    assert.ok(checkpoint.windowEnd);
    assert.equal(jobs.length, 1);
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("next_token"), "page-2");
      assert.equal(url.searchParams.get("end_time"), checkpoint.windowEnd);
      return Response.json({ data: [], meta: { result_count: 0 } });
    };
    await collectX(
      { ...xSource, checkpoint },
      { requests: 0, limit: 1 },
      (j) => jobs.push(j),
      (c) => {
        checkpoint = { ...c };
      },
    );
    assert.ok(checkpoint.completedAt);
    assert.equal(checkpoint.nextToken, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    config.xToken = "";
  }
});

test("X pacing spreads a 1,000-post allowance across the month and handles rollover", () => {
  let date = new Date("2026-10-01T00:00:00Z");
  let used = 0;
  let requests = 0;
  while (date.getUTCMonth() === 9) {
    const budget = xScanBudget(1000, used, 4, 1, date);
    assert.ok(Date.parse(budget.resumeAt) > date.getTime());
    if (budget.posts) {
      assert.ok(budget.posts >= 10);
      used += budget.posts;
      requests++;
      assert.ok(used <= 1000);
    }
    if (date.getUTCDate() < 8) assert.ok(used < 250);
    date = new Date(budget.resumeAt);
  }
  assert.ok(used >= 990);
  assert.ok(requests >= 90);
  const twoSources = xScanBudget(
    1000,
    0,
    4,
    2,
    new Date("2026-10-01T00:00:00Z"),
  );
  const oneSource = xScanBudget(
    1000,
    0,
    4,
    1,
    new Date("2026-10-01T00:00:00Z"),
  );
  assert.ok(Date.parse(twoSources.resumeAt) > Date.parse(oneSource.resumeAt));
  const exhausted = xScanBudget(
    1000,
    995,
    4,
    1,
    new Date("2026-10-15T00:00:00Z"),
  );
  assert.equal(exhausted.posts, 0);
  assert.equal(exhausted.resumeAt, "2026-11-01T00:00:00.000Z");
  assert.equal(xBudgetKey(new Date(exhausted.resumeAt)), "x-posts:2026-11");
  assert.ok(
    xScanBudget(1000, 0, 4, 1, new Date(exhausted.resumeAt)).posts >= 10,
  );
});

test("X reservations share the monthly cap and retain ambiguous consumption", () => {
  const original = store.getSettings();
  const key = "test:x-post-reservation-cap";
  store.putSetting("app", { ...original, xMonthlyPostLimit: 1000 });
  try {
    store.incrementCounter(key, 990);
    assert.equal(reserveXPosts(100, key), 10);
    assert.equal(store.getCounter(key), 1000);
    assert.throws(() => reserveXPosts(10, key), /monthly post limit reached/);
    assert.equal(store.getCounter(key), 1000);
  } finally {
    store.putSetting("app", original);
  }
});

test("X limits a multi-page scan to its paced allowance and persists the next scan time", async () => {
  const original = store.getSettings();
  const initialUsage = store.getCounter(xBudgetKey());
  config.xToken = "test-only";
  store.putSetting("app", {
    ...original,
    xEnabled: true,
    xMonthlyPostLimit: 1000,
  });
  const xSource = store.addSource({
    name: "Paced X test",
    type: "x",
    identifier: "hiring TypeScript",
    enabled: true,
    requestLimit: 20,
  });
  const planned = xScanBudget(
    1000,
    initialUsage,
    original.scanIntervalHours,
    1,
  );
  let fetched = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const count = Number(url.searchParams.get("max_results"));
    assert.ok(count >= 10 && count <= 100);
    const data = Array.from({ length: count }, (_, index) => ({
      id: String(100000 + fetched + index),
      text: "Hiring a TypeScript product engineer",
    }));
    fetched += count;
    return Response.json({ data, meta: { next_token: `page-${fetched}` } });
  };
  try {
    const result = await scan(xSource.id, true);
    assert.equal(result.runs?.[0].status, "partial");
    assert.match(result.runs?.[0].error || "", /X scan post limit reached/);
    assert.ok(fetched <= planned.posts);
    assert.ok(fetched >= planned.posts - 9);
    assert.equal(store.getCounter(xBudgetKey()) - initialUsage, fetched);
    const persisted = store.getSource(xSource.id)!;
    assert.ok(
      Date.parse(persisted.nextRunAt!) >= Date.parse(planned.resumeAt) - 1000,
    );
    assert.equal(persisted.checkpoint.nextToken, `page-${fetched}`);
    const again = await scan(xSource.id);
    assert.equal(again.runs?.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    config.xToken = "";
    store.saveSource({ ...store.getSource(xSource.id)!, enabled: false });
    store.putSetting("app", original);
    store.incrementCounter(
      xBudgetKey(),
      initialUsage - store.getCounter(xBudgetKey()),
    );
  }
});

test("saving a job flows through the Codex process boundary to a persistent draft", async () => {
  const { writeFileSync, chmodSync } = await import("node:fs");
  const { processCoverLetterTask } = await import("../core/ai/generate.ts");
  for (const task of store.listTasks()) {
    task.state = "paused";
    store.saveTask(task);
  }
  const profile = store.getProfile();
  const generation = {
    paragraphs: Array(3).fill({
      text: profile.basics.summary,
      evidenceIds: ["profile-summary"],
    }),
    reviewNotes: [],
  };
  let runtime = join(directory, "fixture-codex.mjs");
  writeFileSync(
    runtime,
    `#!/usr/bin/env node\nimport {writeFileSync} from 'node:fs';\nif(process.argv.includes('status')){console.log('Logged in using ChatGPT');process.exit(0);}\nprocess.stdin.resume();process.stdin.on('end',()=>{writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify(generation))});console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}));});\n`,
  );
  chmodSync(runtime, 0o700);
  if (process.platform === "win32") {
    const { execFileSync } = await import("node:child_process");
    const source = join(directory, "fixture-codex.go");
    writeFileSync(
      source,
      `package main\nimport("os";"fmt";"io")\nfunc main(){for _,a:=range os.Args{if a=="status"{fmt.Println("Logged in using ChatGPT");return}};io.ReadAll(os.Stdin);for i,a:=range os.Args{if a=="--output-last-message"{if err:=os.WriteFile(os.Args[i+1],[]byte(${JSON.stringify(JSON.stringify(generation))}),0600);err!=nil{panic(err)}}};fmt.Println("{}")}`,
    );
    runtime = join(directory, "fixture-codex.exe");
    execFileSync("go", ["build", "-o", runtime, source], { windowsHide: true });
  }
  const previous = config.codexCommand;
  config.codexCommand = runtime;
  store.putSetting("app", { ...store.getSettings(), aiEnabled: true });
  try {
    const job = store.ingestJob(source, {
      ...item,
      sourceItemId: "pipeline",
      url: "https://example.com/pipeline",
    }).job;
    const queued = store.queueCoverLetter(job.id);
    await processCoverLetterTask();
    const completed = store.listTasks().find((t) => t.id === queued.id)!;
    assert.equal(completed.state, "complete", completed.error || "");
    assert.ok(completed.resultId);
    assert.equal(
      store.getCoverLetter(completed.resultId!)?.document.paragraphs[0],
      generation.paragraphs[0].text,
    );
    const original = store.getCoverLetter(completed.resultId!)!;
    const edited = store.saveCoverLetter({
      ...original,
      kind: "edited",
      parentId: original.id,
      document: { ...original.document, paragraphs: ["Keep my manual edit."] },
    });
    store.queueCoverLetter(job.id, true);
    await processCoverLetterTask();
    assert.equal(store.listCoverLetterVersions(job.id).length, 3);
    assert.equal(
      store.getCoverLetter(edited.id)?.document.paragraphs[0],
      "Keep my manual edit.",
    );
  } finally {
    config.codexCommand = previous;
    store.putSetting("app", { ...store.getSettings(), aiEnabled: false });
  }
});

test("X credentials persist locally and never appear in API responses", async () => {
  const token = "test-secret-bearer-token";
  const response = await app.inject({
    method: "POST",
    url: "/api/x/token",
    payload: { token },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { configured: true });
  const { xToken } = await import("../core/x-auth.ts");
  assert.equal(xToken(), token);
  const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
  assert.equal(bootstrap.json().x.configured, true);
  assert.ok(!bootstrap.body.includes(token));
  assertPrivateFile(join(directory, "secrets/x.json"));
});

test("complete board snapshots close missing jobs without losing saved work", () => {
  const job = store.ingestJob(source, {
    ...item,
    sourceItemId: "closed",
    url: "https://example.com/closed",
  }).job;
  job.status = "applied";
  job.notes = "Keep this history";
  store.writeJob(job);
  store.db
    .prepare("UPDATE source_items SET last_seen_at=? WHERE job_id=?")
    .run("2020-01-01T00:00:00.000Z", job.id);
  store.closeMissingJobs(source.id, "2021-01-01T00:00:00.000Z");
  assert.equal(store.getJob(job.id)?.availability, "closed");
  assert.equal(store.getJob(job.id)?.status, "applied");
  assert.equal(store.getJob(job.id)?.notes, "Keep this history");
  store.ingestJob(source, item);
  assert.throws(
    () => store.ingestJob(source, { ...item, url: "javascript:alert(1)" }),
    /HTTP or HTTPS/,
  );
  store.ingestJob(source, {
    ...item,
    sourceItemId: "closed",
    url: "https://example.com/closed",
  });
  assert.equal(store.getJob(job.id)?.availability, "open");
  store.queueCoverLetter(job.id, true);
  assert.equal(store.getJob(job.id)?.status, "applied");
});

test("dashboard POST actions work without a JSON body", async () => {
  const { api: client } = await import("../src/api.ts");
  const job = store.listJobs()[0];
  globalThis.fetch = async (input, options) => {
    const response = await app.inject({
      method: (options?.method || "GET") as any,
      url: String(input),
      headers: options?.headers as Record<string, string>,
      ...(options?.body ? { payload: options.body as string } : {}),
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const task = await client<{ jobId: string }>(`/jobs/${job.id}/generate`, {
      method: "POST",
    });
    assert.equal(task.jobId, job.id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
