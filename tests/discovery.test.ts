import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Source, IncomingJob } from "../core/types.ts";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-discovery-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = new URL("./fixtures/profile.json", import.meta.url).pathname;
const store = await import("../core/db/index.ts");
const {
  normalizeHimalayas,
  normalizeFourDayWeek,
  normalizeRemoteOk,
  normalizeRemotive,
  normalizeArbeitnow,
  normalizeJobicy,
  normalizeRss,
  collectDiscovery,
} = await import("../core/discovery.ts");
const { sourcePolicy, discoverySources } =
  await import("../core/source-catalog.ts");
const { RequestLimitError, readJson } = await import("../core/http.ts");
const { scan } = await import("../core/scan.ts");
const originalFetch = globalThis.fetch;
for (const s of store.listSources()) store.saveSource({ ...s, enabled: false });
after(() => {
  globalThis.fetch = originalFetch;
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});
const source = (type: Source["type"], identifier: string): Source => ({
  id: "fixture",
  name: "Fixture feed",
  type,
  identifier,
  enabled: true,
  requestLimit: 2,
  state: "idle",
  lastRunAt: null,
  nextRunAt: null,
  lastError: null,
  jobCount: 0,
  checkpoint: {},
});

test("public API normalization preserves actual employer, restrictions, source links, dates and salary units", () => {
  const h = normalizeHimalayas({
    jobs: [
      {
        guid: "https://himalayas.app/jobs/example",
        applicationLink: "https://himalayas.app/jobs/example",
        title: "Frontend engineer",
        companyName: "Example",
        pubDate: 1789498898,
        expiryDate: 1794682897000,
        locationRestrictions: ["Malaysia", "Singapore"],
        timezoneRestrictions: [8],
        salaryPeriod: "annual",
        minSalary: 50000,
        maxSalary: 70000,
        currency: "USD",
        description: "<p>Build interfaces</p>",
      },
    ],
  })[0];
  assert.equal(h.publishedAt, new Date(1789498898000).toISOString());
  assert.equal(h.expiresAt, new Date(1794682897000).toISOString());
  assert.equal(h.location, "Malaysia · Singapore");
  assert.equal(h.company, "Example");
  assert.equal(h.salary, "USD 50000–70000 / annual");
  assert.match(h.description, /UTC offsets.*8/);
  assert.equal(
    normalizeHimalayas({
      jobs: [{ guid: "https://himalayas.app/x", title: "Engineer" }],
    })[0].location,
    "Not specified",
  );
  const f = normalizeFourDayWeek({
    data: [
      {
        id: "4d",
        title: "Product Engineer",
        url: "https://4dayweek.io/job/example",
        company: { name: "Product Co" },
        locations: [{ city: "London", country: "UK" }],
        salary_min: 8000000,
        salary_max: 10000000,
        salary_currency: "GBP",
        salary_period: "year",
        schedule_type: "generous_pto",
        hours_per_week_max: 40,
      },
    ],
  })[0];
  assert.equal(f.salary, "GBP 80000–100000 / year");
  assert.match(f.description, /generous pto/);
  assert.ok(!f.description.includes("4 day"));
  const r = normalizeRemoteOk([
    { legal: "Terms" },
    {
      id: 1,
      position: "Engineer",
      company: "Remote Co",
      url: "https://remoteok.com/remote-jobs/1",
      salary_min: 100000,
    },
  ]);
  assert.equal(r.length, 1);
  assert.match(r[0].salary, /not fully specified/);
  assert.ok(!r[0].salary.includes("USD"));
  assert.equal(
    normalizeRemotive({
      jobs: [
        {
          id: 1,
          title: "Engineer",
          url: "https://remotive.com/jobs/1",
          salary: "",
          candidate_required_location: "Europe",
        },
      ],
    })[0].salary,
    "",
  );
  assert.equal(
    normalizeArbeitnow({
      data: [
        {
          slug: "a",
          title: "Engineer",
          url: "https://www.arbeitnow.com/jobs/a",
          remote: false,
        },
      ],
    })[0].arrangement,
    "Unspecified",
  );
  assert.equal(
    normalizeJobicy({
      jobs: [
        {
          id: 1,
          jobTitle: "Engineer",
          url: "https://jobicy.com/jobs/1",
          jobGeo: "APAC",
          jobType: ["Full-Time"],
          salaryMin: 10000,
          salaryMax: 15000,
          salaryCurrency: "MYR",
          salaryPeriod: "monthly",
        },
      ],
    })[0].salary,
    "MYR 10000–15000 / monthly",
  );
  assert.throws(
    () => normalizeJobicy({ error: "unavailable" }),
    /missing jobs array/,
  );
});

test("RSS uses board-specific employer/location fields and keeps missing descriptions as leads", () => {
  const wwr = normalizeRss(
    "<rss><channel><item><title>Acme: Senior Frontend Engineer</title><region>Europe only</region><link>https://weworkremotely.com/jobs/1</link><description>&lt;p&gt;" +
      "Build web interfaces. ".repeat(20) +
      "&lt;/p&gt;</description></item></channel></rss>",
    source("rss", "https://weworkremotely.com/remote-jobs.rss"),
  )[0];
  assert.equal(wwr.company, "Acme");
  assert.equal(wwr.title, "Senior Frontend Engineer");
  assert.equal(wwr.location, "Europe only");
  assert.equal(wwr.kind, "opening");
  const lara = normalizeRss(
    "<rss><channel><item><title>Lead Developer</title><link>https://larajobs.com/job/1</link><job:company>Laravel Co</job:company><job:location>USA / Canada</job:location><job:job_type>FULL_TIME</job:job_type><description> </description><content:encoded> </content:encoded></item></channel></rss>",
    source("rss", "https://larajobs.com/feed"),
  )[0];
  assert.equal(lara.company, "Laravel Co");
  assert.equal(lara.location, "USA / Canada");
  assert.equal(lara.description, "");
  assert.equal(lara.kind, "lead");
  const go = normalizeRss(
    "<rss><channel><item><title>Agent Engineer @ ngrok</title><link>https://www.golangprojects.com/example.html</link><description>San Francisco, United States - Short excerpt...</description></item></channel></rss>",
    source("rss", "https://www.golangprojects.com/rss.xml"),
  )[0];
  assert.equal(go.company, "ngrok");
  assert.equal(go.title, "Agent Engineer");
  assert.equal(go.kind, "lead");
  const atom = normalizeRss(
    '<feed><entry><title>Engineer</title><link rel="alternate" href="https://example.com/job"/><content>Body</content></entry><entry><title>Invalid</title><link href="javascript:alert(1)"/></entry></feed>',
    source("rss", "https://example.com/feed"),
  );
  assert.equal(atom.length, 1);
  assert.equal(atom[0].company, "Not listed");
});

test("4 Day Week refreshes latest jobs while bounded older-page collection resumes", async () => {
  let checkpoint: Record<string, unknown> = { page: 7 };
  const pages: number[] = [];
  const reader: typeof readJson = async <T>(
    url: string,
    ctx: Parameters<typeof readJson>[1],
  ) => {
    ctx.requests++;
    pages.push(Number(new URL(url).searchParams.get("page")));
    return {
      data: [
        {
          id: pages.at(-1),
          title: "Engineer",
          url: `https://4dayweek.io/job/${pages.at(-1)}`,
        },
      ],
      has_more: true,
    } as T;
  };
  const s = source("fourdayweek", "engineering");
  await collectDiscovery(
    { ...s, checkpoint },
    { requests: 0, limit: 3 },
    () => {},
    (c) => (checkpoint = c),
    reader,
  );
  assert.deepEqual(pages, [1, 7, 8]);
  assert.equal(checkpoint.page, 9);
  pages.length = 0;
  await collectDiscovery(
    { ...s, checkpoint },
    { requests: 0, limit: 2 },
    () => {},
    (c) => (checkpoint = c),
    reader,
  );
  assert.deepEqual(pages, [1, 9]);
  assert.equal(checkpoint.page, 10);
});

test("Himalayas resumes interrupted query pagination without skipping a query", async () => {
  let checkpoint: Record<string, unknown> = {};
  const requested: string[] = [];
  const reader: typeof readJson = async <T>(
    raw: string,
    ctx: Parameters<typeof readJson>[1],
  ) => {
    if (ctx.requests >= ctx.limit) throw new RequestLimitError("Limit");
    ctx.requests++;
    const url = new URL(raw);
    requested.push(
      `${url.searchParams.get("q")}:${url.searchParams.get("page")}`,
    );
    return {
      jobs: Array.from({ length: 20 }, (_, i) => ({
        guid: `https://himalayas.app/jobs/${i}`,
        title: "Engineer",
      })),
    } as T;
  };
  const s = source("himalayas", "frontend|AI engineer");
  await assert.rejects(
    collectDiscovery(
      s,
      { requests: 0, limit: 1 },
      () => {},
      (c) => (checkpoint = c),
      reader,
    ),
    RequestLimitError,
  );
  assert.deepEqual(checkpoint, { queryIndex: 0, page: 2 });
  await collectDiscovery(
    { ...s, checkpoint },
    { requests: 0, limit: 3 },
    () => {},
    (c) => (checkpoint = c),
    reader,
  );
  assert.deepEqual(requested, [
    "frontend:1",
    "frontend:2",
    "AI engineer:1",
    "AI engineer:2",
  ]);
  assert.deepEqual(checkpoint, {});
});

test("expired feed entries preserve saved jobs and CV history; disappearance from RSS is not closure", () => {
  const s = store.addSource({
    name: "Expiry test",
    type: "himalayas",
    identifier: "expiry",
    enabled: false,
    requestLimit: 1,
  });
  const item: IncomingJob = {
    sourceItemId: "expiry",
    title: "Product Engineer",
    company: "Example",
    location: "",
    arrangement: "Remote",
    employmentType: "Full-Time",
    salary: "",
    url: "https://himalayas.app/jobs/expiry",
    description: "Build interfaces",
    publishedAt: null,
    kind: "opening",
  };
  const job = store.ingestJob(s, item).job;
  job.status = "saved";
  job.notes = "Keep this";
  store.writeJob(job);
  const updated = store.ingestJob(s, {
    ...item,
    expiresAt: "2020-01-01T00:00:00Z",
  }).job;
  assert.equal(updated.id, job.id);
  assert.equal(updated.availability, "closed");
  assert.equal(updated.status, "saved");
  assert.equal(updated.notes, "Keep this");
});

test("scheduled and manual scans enforce provider cooldowns and persist source-specific intervals", async () => {
  const s = store.addSource({
    name: "Himalayas cooldown",
    type: "himalayas",
    identifier: "engineer",
    enabled: true,
    requestLimit: 1,
    intervalHours: 4,
  });
  globalThis.fetch = async () => Response.json({ jobs: [] });
  try {
    await scan(s.id, true);
    const finished = store.getSource(s.id)!;
    assert.ok(
      Date.parse(finished.nextRunAt!) >=
        Date.parse(finished.lastRunAt!) + 24 * 3600000,
    );
    store.saveSource({
      ...finished,
      lastRunAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      nextRunAt: null,
    });
    assert.equal((await scan(s.id, true)).runs?.length, 0);
    assert.equal(sourcePolicy(source("remotive", "remotive")).dailyCap, 4);
    assert.ok(discoverySources.length >= 14);
    assert.equal(
      new Set(discoverySources.map((s) => `${s.type}:${s.identifier}`)).size,
      discoverySources.length,
    );
  } finally {
    globalThis.fetch = originalFetch;
    store.saveSource({ ...store.getSource(s.id)!, enabled: false });
  }
});

test("HN YC job collection is bounded, skips deleted items, and preserves original HN attribution", async () => {
  const emitted: IncomingJob[] = [];
  let checkpoint: Record<string, unknown> = {};
  const reader: typeof readJson = async <T>(
    url: string,
    ctx: Parameters<typeof readJson>[1],
  ) => {
    ctx.requests++;
    return (
      url.endsWith("jobstories.json")
        ? [1, 2, 3]
        : url.endsWith("/1.json")
          ? {
              id: 1,
              type: "job",
              title: "Acme is hiring",
              url: "https://acme.example/jobs/1",
              time: 1789498898,
            }
          : { deleted: true }
    ) as T;
  };
  await collectDiscovery(
    source("hn_jobs", "jobstories"),
    { requests: 0, limit: 3 },
    (j) => emitted.push(j),
    (c) => (checkpoint = c),
    reader,
  );
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].url, "https://news.ycombinator.com/item?id=1");
  assert.equal(emitted[0].kind, "lead");
  assert.match(emitted[0].description, /Employer posting/);
  assert.deepEqual(checkpoint.seen, [1, 2]);
});

test("full RSS content is preserved ahead of summaries while API excerpts remain provisional", () => {
  const full = "Build React product interfaces. ".repeat(30);
  const rss = normalizeRss(
    `<rss><channel><item><title>Engineer</title><link>https://example.com/job/full</link><description>Summary...</description><content:encoded><![CDATA[<p>${full}</p>]]></content:encoded></item></channel></rss>`,
    source("rss", "https://example.com/feed"),
  )[0];
  assert.equal(rss.description, full.trim());
  assert.equal(rss.descriptionQuality, "full");
  assert.equal(rss.kind, "opening");
  const excerpt = normalizeJobicy({
    jobs: [
      {
        id: 1,
        jobTitle: "Engineer",
        url: "https://jobicy.com/job/1",
        jobExcerpt: full,
      },
    ],
  })[0];
  assert.equal(excerpt.descriptionQuality, "excerpt");
  assert.equal(excerpt.kind, "lead");
  assert.equal(
    normalizeHimalayas({
      jobs: [
        {
          guid: "https://himalayas.app/job/1",
          title: "Engineer",
          excerpt: full,
        },
      ],
    })[0].descriptionQuality,
    "excerpt",
  );
});
