import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicBoards, boardSourceDefaults } from "../core/boards/catalog.ts";
import {
  jobUrl,
  lead,
  itemId,
  parseBoardListing,
  parseBoardDetail,
} from "../core/boards/parsers.ts";
import type { IncomingJob } from "../core/types.ts";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-public-boards-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = fileURLToPath(
  new URL("./fixtures/profile.json", import.meta.url),
);
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const { collectPublicBoard } = await import("../core/boards/collector.ts");
const { addPublicBoards } = await import("../core/boards/install.ts");
const { enqueueBoardJob, dueBoardJobs, finishBoardJob } =
  await import("../core/boards/queue.ts");
const { scan } = await import("../core/scan.ts");
const { app } = await import("../server/index.ts");
const originalFetch = globalThis.fetch;
after(async () => {
  await app.close();
  globalThis.fetch = originalFetch;
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});
const source = (key: string) =>
  store
    .listSources()
    .find((s) => s.type === "public_board" && s.identifier === key)!;
const prose =
  "Build customer-facing software with TypeScript and React. Own accessible interfaces, collaborate with designers, review changes and ship reliable products. Applicants must already be authorized to work in the United States. Visa sponsorship is not available.";
const posting = (url: string, extra = {}) =>
  `<script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "JobPosting", url, title: "Product engineer", hiringOrganization: { name: "Example" }, description: `<p>${prose}</p>`, datePosted: "2026-09-01", jobLocation: { address: { addressLocality: "Austin", addressCountry: "US" } }, ...extra }] })}</script>`;
const nextData = (page: unknown) =>
  `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: page } })}</script>`;

test("only implemented boards are installed and offered", () => {
  assert.equal(Object.keys(publicBoards).length, 26);
  assert.equal(
    store.listSources().filter((s) => s.type === "public_board").length,
    26,
  );
  assert.deepEqual(addPublicBoards(), { added: [], upgraded: [] });
  assert.throws(
    () => store.addSource(boardSourceDefaults("hiredly")),
    /already configured/,
  );
  assert.throws(
    () =>
      store.addSource({
        ...boardSourceDefaults("hiredly"),
        identifier: "https://example.com",
      }),
    /supported/,
  );
  for (const key of ["adzuna", "jooble", "careerjet"]) {
    assert.equal(source(key), undefined);
    assert.throws(() => boardSourceDefaults(key), /supported/);
  }
});

test("retired source records and evidence survive while scans and setup exclude them", async () => {
  const existing = store.listSources();
  for (const s of existing) store.saveSource({ ...s, enabled: false });
  const retired = ["adzuna", "jooble", "careerjet"].map((identifier) => ({
    ...existing[0],
    id: randomUUID(),
    type: "public_board" as const,
    name: identifier,
    identifier,
    enabled: true,
    checkpoint: { retained: "old checkpoint" },
    state: "needs_setup" as const,
  }));
  // Simulate persisted rows from the previous release, including stale enabled flags.
  for (const s of retired)
    store.db
      .prepare("INSERT INTO sources VALUES (?,?,?,?)")
      .run(s.id, JSON.stringify(s), s.type, s.identifier);
  const job = store.ingestJob(retired[0], {
    sourceItemId: "preserved",
    title: "Product engineer",
    company: "Fixture",
    location: "Worldwide",
    arrangement: "Remote",
    employmentType: "FullTime",
    salary: "",
    url: "https://example.com/retained-job",
    description: prose,
    publishedAt: null,
    kind: "opening",
    descriptionQuality: "full",
  }).job;
  const beforeJob = store.getJob(job.id);
  const beforeEvidence = store.db
    .prepare("SELECT * FROM source_items WHERE job_id=?")
    .all(job.id);
  const beforeCounters = store.db.prepare("SELECT * FROM counters").all();
  const beforeRuns = store.listRuns();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Unexpected request");
  };
  try {
    assert.equal((await scan()).runs?.length, 0);
    for (const s of retired) {
      assert.equal((await scan(s.id, true)).runs?.length, 0);
      assert.deepEqual(store.getSource(s.id), s);
      await assert.rejects(
        collectPublicBoard(
          s,
          { requests: 0, limit: 1 },
          () => {},
          () => {},
        ),
        /supported/,
      );
      const response = await app.inject({
        method: "POST",
        url: "/api/sources",
        payload: {
          name: s.name,
          type: s.type,
          identifier: s.identifier,
          enabled: true,
          requestLimit: 1,
        },
      });
      assert.equal(response.statusCode, 400);
    }
    const boot = (await app.inject("/api/bootstrap")).json();
    assert.ok(
      boot.sources.every(
        (s: { id: string }) => !retired.some((r) => r.id === s.id),
      ),
    );
    assert.ok(
      boot.sources.some((s: { id: string }) => s.id === existing[0].id),
    );
    assert.equal((await app.inject(`/api/jobs/${job.id}`)).json().id, job.id);
    assert.deepEqual(store.getJob(job.id), beforeJob);
    assert.deepEqual(
      store.db.prepare("SELECT * FROM source_items WHERE job_id=?").all(job.id),
      beforeEvidence,
    );
    assert.deepEqual(
      store.db.prepare("SELECT * FROM counters").all(),
      beforeCounters,
    );
    assert.deepEqual(store.listRuns(), beforeRuns);
    assert.deepEqual(addPublicBoards(), { added: [], upgraded: [] });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const s of existing) store.saveSource(s);
  }
});

test("legacy manual boards upgrade in place without changing other source preferences", () => {
  const old = source("wellfound");
  store.saveSource({
    ...old,
    type: "website",
    identifier: "https://wellfound.com/jobs",
    jobCount: 7,
    enabled: false,
  });
  const paused = source("hiredly");
  store.saveSource({ ...paused, enabled: false });
  assert.deepEqual(addPublicBoards().upgraded, ["Wellfound"]);
  assert.equal(source("wellfound").id, old.id);
  assert.equal(source("wellfound").jobCount, 7);
  assert.equal(source("hiredly").enabled, false);
});

test("discovery accepts only vacancy routes on the intended board and keeps stable LinkedIn IDs", () => {
  for (const u of [
    "https://wellfound.com.evil.test/jobs/123-test",
    "https://user@wellfound.com/jobs/123-test",
    "https://wellfound.com/login",
    "https://127.0.0.1/jobs/123-test",
  ])
    assert.equal(jobUrl("wellfound", u), null);
  const a = lead(
    "linkedin",
    jobUrl(
      "linkedin",
      "https://my.linkedin.com/jobs/view/engineer-123?tracking=secret",
    )!,
  );
  const b = lead(
    "linkedin",
    jobUrl(
      "linkedin",
      "https://sg.linkedin.com/jobs/view/renamed-engineer-123",
    )!,
  );
  assert.equal(a.sourceItemId, b.sourceItemId);
  assert.doesNotMatch(a.url, /tracking/);
  assert.equal(
    jobUrl(
      "relocate",
      "https://relocate.me/remote/remote/the-global-move/paid-option-10080",
    ),
    null,
  );
  assert.throws(
    () =>
      parseBoardListing(
        "wellfound",
        "<h1>Sign in</h1>",
        publicBoards.wellfound.seeds[0],
      ),
    /No readable/,
  );
});

test("matching structured details preserve restrictions and dates; wrong and paywalled records fail", () => {
  const url = "https://wellfound.com/jobs/123-engineer",
    candidate = lead("wellfound", url);
  const job = parseBoardDetail("wellfound", posting(url), candidate);
  assert.equal(job.company, "Example");
  assert.match(job.description, /sponsorship is not available/);
  assert.equal(job.location, "Austin, US");
  assert.equal(job.publishedAt, "2026-09-01T00:00:00.000Z");
  assert.throws(
    () =>
      parseBoardDetail(
        "wellfound",
        posting("https://wellfound.com/jobs/456-other"),
        candidate,
      ),
    /identifiable/,
  );
  assert.throws(
    () =>
      parseBoardDetail(
        "wellfound",
        posting(url, { isAccessibleForFree: false }),
        candidate,
      ),
    /identifiable/,
  );
});

test("Hiredly uses employer sections instead of truncated schema or AI summary", () => {
  const url =
    "https://my.hiredly.com/jobs/jobs-malaysia-example-product-engineer";
  const job = {
    slug: "jobs-malaysia-example-product-engineer",
    title: "Product engineer",
    company: { name: "Example" },
    location: "Kuala Lumpur",
    description: `<p>${prose}</p>`,
    requirements: "<p>Five years of experience.</p>",
    gptSummary: "Fabricated AI summary",
    salary: "12000 - 18000",
  };
  const parsed = parseBoardDetail(
    "hiredly",
    nextData({ job }) + posting(url, { description: "Short summary..." }),
    lead("hiredly", url),
  );
  assert.match(parsed.description, /Five years/);
  assert.doesNotMatch(parsed.description, /Fabricated|Short summary/);
  assert.equal(parsed.salary, "MYR 12000 - 18000");
  const listing = parseBoardListing(
    "hiredly",
    nextData({
      jobs: Array.from({ length: 30 }, (_, n) => ({
        ...job,
        slug: `jobs-${n}`,
        description: undefined,
        requirements: undefined,
      })),
    }),
    publicBoards.hiredly.seeds[0],
  );
  assert.match(listing.next!, /page=1/);
  assert.equal(listing.jobs[0].descriptionQuality, "excerpt");
  assert.deepEqual(
    parseBoardListing(
      "hiredly",
      nextData({ jobs: [] }),
      publicBoards.hiredly.seeds[0],
    ),
    { jobs: [], next: null },
  );
});

test("visible TryRemote and No Fluff sections retain requirements missing from JSON-LD", () => {
  for (const [key, url, section] of [
    [
      "tryremote",
      "https://tryremote.com/remote-jobs/123-engineer",
      `<div class="job-description">${prose}</div>`,
    ],
    [
      "nofluff",
      "https://nofluffjobs.com/job/example-engineer",
      `<div id="posting-requirements">English and Polish required.</div><section id="posting-description">${prose}</section><div id="posting-tasks">Own the frontend.</div>`,
    ],
  ]) {
    const parsed = parseBoardDetail(
      key,
      posting(url, { description: "An excerpt..." }) + section,
      lead(key, url),
    );
    assert.equal(parsed.descriptionQuality, "full");
    assert.match(parsed.description, /authorized to work/);
    if (key === "nofluff")
      assert.match(parsed.description, /English and Polish/);
  }
});

test("search cards preserve location and company; pagination keeps search filters", () => {
  const html =
    '<div><a href="https://my.linkedin.com/jobs/view/engineer-123">Product engineer</a><h3 class="base-search-card__title">Product engineer</h3><h4 class="base-search-card__subtitle">Example</h4><span class="job-search-card__location">Singapore</span><time datetime="2026-09-01"></time></div>';
  const job = parseBoardListing(
    "linkedin",
    html,
    publicBoards.linkedin.seeds[0],
  ).jobs[0];
  assert.equal(job.location, "Singapore");
  assert.equal(job.company, "Example");
  const result = parseBoardListing(
    "cake",
    '<a href="/companies/example/jobs/engineer">Engineer</a><a href="/jobs?page=2">2</a>',
    "https://www.cake.me/jobs?q=frontend&locale=en",
  );
  assert.equal(new URL(result.next!).searchParams.get("q"), "frontend");
});

test("persistent queue resumes detail work without refetching complete pages", async () => {
  const s = source("builtin");
  const calls: string[] = [];
  const jobs: IncomingJob[] = [];
  const a = "https://builtin.com/job/engineer/123",
    b = "https://builtin.com/job/developer/456";
  const reader = async (url: string, ctx: { requests: number }) => {
    ctx.requests++;
    calls.push(url);
    return url.includes("/job/")
      ? posting(url)
      : `<a href="${a}">Engineer</a><a href="${b}">Developer</a>`;
  };
  const collect = () =>
    collectPublicBoard(
      s,
      { requests: 0, limit: 2 },
      (j) => jobs.push(j),
      (cp) => {
        s.checkpoint = cp;
        store.saveSource(s);
      },
      reader,
    );
  await collect();
  assert.equal(dueBoardJobs(s.id).length, 1);
  await collect();
  assert.equal(dueBoardJobs(s.id).length, 0);
  assert.equal(calls.filter((u) => u === a).length, 1);
  assert.equal(calls.filter((u) => u === b).length, 1);
  const complete = jobs.find(
    (j) => j.url === a && j.descriptionQuality === "full",
  )!;
  enqueueBoardJob(s.id, {
    ...lead("builtin", a, "Engineer"),
    description: "Excerpt...",
  });
  assert.equal(dueBoardJobs(s.id).length, 0);
  enqueueBoardJob(s.id, {
    ...complete,
    description: prose + " Updated responsibilities.",
  });
  const row = store.db
    .prepare("SELECT document FROM board_queue WHERE source_id=? AND url=?")
    .get(s.id, a)!;
  assert.match(
    JSON.parse(row.document as string).description,
    /Updated responsibilities/,
  );
});

test("scan blocks and manual scans honor cooldown", async () => {
  const s = source("jungle");
  store.saveSource({ ...s, requestLimit: 50, intervalHours: 4 });
  assert.equal(source("jungle").requestLimit, 12);
  assert.equal(source("jungle").intervalHours, 12);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("blocked", { status: 403 });
  };
  await scan(s.id, true);
  assert.equal(store.getSource(s.id)?.state, "blocked");
  await scan(s.id, true);
  assert.equal(calls, 1);
  assert.ok(
    Date.parse(store.getSource(s.id)!.retryAt!) > Date.now() + 23 * 3600000,
  );
});

test("publisher JSON-LD with raw line breaks is recovered without executing scripts", () => {
  const url = "https://relocate.me/japan/tokyo/example/engineer-123";
  const html = posting(url).replace(
    "Build customer-facing",
    "Build\ncustomer-facing",
  );
  const job = parseBoardDetail("relocate", html, lead("relocate", url));
  assert.match(job.description, /customer-facing/);
});

test("Wantedly uses the visible project sections when its structured description is cut short", () => {
  const url = "https://www.wantedly.com/projects/123";
  const html =
    posting(url, { description: "A short intro..." }) +
    `<section class="ProjectDescription__Section-sc-example">${prose}</section>`;
  assert.equal(
    parseBoardDetail("wantedly", html, lead("wantedly", url))
      .descriptionQuality,
    "full",
  );
});

test("Get on Board detail identity remains compatible with its API IDs during revalidation", () => {
  const url = "https://www.getonbrd.com/jobs/product-engineer-example";
  assert.equal(itemId("getonboard", url), "product-engineer-example");
  assert.equal(
    parseBoardDetail("getonboard", posting(url), lead("getonboard", url))
      .company,
    "Example",
  );
});
