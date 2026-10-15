import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseBoardListing,
  parseBoardDetail,
  jobUrl,
} from "../core/boards/parsers.ts";
import { publicBoards } from "../core/boards/catalog.ts";
import { discoverySources } from "../core/source-catalog.ts";
const dir = mkdtempSync(join(tmpdir(), "ununemploy-additions-"));
process.env.JH_DATA_DIR = dir;
process.env.JH_PROFILE_SEED = new URL(
  "./fixtures/profile.json",
  import.meta.url,
).pathname;
const store = await import("../core/db/index.ts");
const { normalizeRss, normalizeWorkingNomads } =
  await import("../core/discovery.ts");
const { scan } = await import("../core/scan.ts");
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  store.db.close();
  rmSync(dir, { recursive: true, force: true });
});
const prose =
  "Build accessible applications, maintain integrations, review changes and work with designers on reusable interfaces. ".repeat(
    4,
  );
const rss = (host: string, item: string) =>
  `<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item><link>https://${host}/jobs/example</link><guid>example</guid>${item}</item></channel></rss>`;
const source = (name: string) =>
  store.listSources().find((s) => s.name === name)!;

test("four additions are seeded once and respect current scope", () => {
  for (const name of [
    "Working Nomads",
    "WordPress Jobs",
    "RemoteJobs.com",
    "Dynamite Jobs",
  ]) {
    assert.equal(discoverySources.filter((s) => s.name === name).length, 1);
    assert.equal(store.listSources().filter((s) => s.name === name).length, 1);
  }
  assert.equal(store.listSources().length, 58);
});

test("Working Nomads retains explicit employer/hiring geography and incomplete bodies remain leads", () => {
  const [j] = normalizeWorkingNomads([
    {
      url: "https://www.workingnomads.com/job/go/123/",
      title: "Developer",
      company_name: "Example",
      location: "Europe, APAC",
      description: `<p>${prose}</p>`,
      pub_date: "2026-10-07T08:31:06-04:00",
    },
  ]);
  assert.equal(j.company, "Example");
  assert.equal(j.arrangement, "Remote");
  assert.equal(j.locationScope, "hiring");
  assert.equal(j.location, "Europe, APAC");
  assert.equal(j.salary, "");
  assert.equal(j.publishedAt, "2026-10-07T12:31:06.000Z");
  assert.equal(j.descriptionQuality, "full");
  assert.equal(
    normalizeWorkingNomads([
      { url: j.url, title: j.title, description: "Read more..." },
    ])[0].kind,
    "lead",
  );
  assert.equal(
    normalizeWorkingNomads([{ url: "javascript:alert(1)", title: "Invalid" }])
      .length,
    0,
  );
  assert.throws(() => normalizeWorkingNomads({ jobs: [] }), /expected array/);
});

test("WordPress feed account is not the employer; only explicit attribution and geography are used", () => {
  const s = source("WordPress Jobs");
  const first = normalizeRss(
    rss(
      "jobs.wordpress.net",
      `<title>Designer (Full-time, Remote) — Example Studio</title><dc:creator>jobposter</dc:creator><content:encoded><![CDATA[<p>${prose}</p>]]></content:encoded>`,
    ),
    s,
  )[0];
  assert.equal(first.company, "Example Studio");
  assert.equal(first.title, "Designer (Full-time, Remote)");
  assert.equal(first.descriptionQuality, "full");
  assert.equal(first.arrangement, "Remote");
  assert.equal(first.location, "");
  const attributed = normalizeRss(
    rss(
      "jobs.wordpress.net",
      `<title>Developer (US Remote)</title><dc:creator>jobposter</dc:creator><content:encoded><![CDATA[Example Studio is seeking a developer. ${prose}]]></content:encoded>`,
    ),
    s,
  )[0];
  assert.equal(attributed.company, "Example Studio");
  assert.equal(attributed.location, "US");
  const unknown = normalizeRss(
    rss(
      "jobs.wordpress.net",
      `<title>Developer</title><dc:creator>jobposter</dc:creator><description>Short summary...</description>`,
    ),
    s,
  )[0];
  assert.equal(unknown.company, "Not listed");
  assert.equal(unknown.descriptionQuality, "excerpt");
});

test("RemoteJobs feed parses employer suffix without asserting that every role is remote or inventing pay", () => {
  const s = source("RemoteJobs.com");
  const [j] = normalizeRss(
    rss(
      "www.remotejobs.com",
      `<title>Field Service - Engineer - Example-Co - Remote</title><category>Marketing</category><description><![CDATA[<p>${prose} Travel to client sites.</p>]]></description>`,
    ),
    s,
  );
  assert.equal(j.title, "Field Service - Engineer");
  assert.equal(j.company, "Example-Co");
  assert.equal(j.arrangement, "Unspecified");
  assert.equal(j.salary, "");
  assert.equal(j.descriptionQuality, "full");
  assert.equal(j.location, "");
  const remote = normalizeRss(
    rss(
      "www.remotejobs.com",
      `<title>Developer - Example - Remote</title><description><![CDATA[Location: United States\nThis role is fully remote. ${prose}]]></description>`,
    ),
    s,
  )[0];
  assert.equal(remote.arrangement, "Remote");
  assert.equal(remote.location, "United States");
  const short = normalizeRss(
    rss(
      "www.remotejobs.com",
      `<title>Developer - Example - Remote</title><description>Read more...</description>`,
    ),
    s,
  )[0];
  assert.equal(short.descriptionQuality, "excerpt");
  const onsite = normalizeRss(
    rss(
      "www.remotejobs.com",
      `<title>Engineer - Example - Remote</title><description><![CDATA[${prose} This is not a remote role.]]></description>`,
    ),
    s,
  )[0];
  assert.equal(onsite.arrangement, "Unspecified");
});

test("Dynamite Jobs uses category vacancies and matching full descriptions, excluding its blog", () => {
  const url = "https://dynamitejobs.com/company/example/remote-job/engineer";
  const result = parseBoardListing(
    "dynamite",
    `<a href="${url}">Engineer</a><a href="/blog/article">Article</a>`,
    publicBoards.dynamite.seeds[0],
  );
  assert.equal(result.jobs.length, 1);
  assert.equal(
    jobUrl("dynamite", "https://dynamitejobs.com/blog/article"),
    null,
  );
  const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", url, title: "Engineer", hiringOrganization: { name: "Example" }, description: prose, jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { name: "United States" } })}</script>`;
  const detail = parseBoardDetail("dynamite", html, result.jobs[0]);
  assert.equal(detail.descriptionQuality, "full");
  assert.match(detail.description, /Applicant locations: United States/);
  assert.throws(() =>
    parseBoardDetail(
      "dynamite",
      html.replace(url, url + "-other"),
      result.jobs[0],
    ),
  );
});

test("new feeds use the real scanner, persist jobs and honor one daily scan; absence does not close saved records", async () => {
  for (const name of ["Working Nomads", "WordPress Jobs", "RemoteJobs.com"]) {
    const s = source(name);
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(
        s.type === "workingnomads"
          ? JSON.stringify([
              {
                url: "https://www.workingnomads.com/job/go/456/",
                title: "Developer",
                description: prose,
                company_name: "Example",
              },
            ])
          : rss(
              new URL(s.identifier).hostname,
              `<title>Developer - Example - Remote</title><content:encoded><![CDATA[${prose}]]></content:encoded>`,
            ),
      );
    };
    const first = await scan(s.id, true);
    assert.equal(first.runs?.[0].added, 1);
    assert.equal(first.runs?.[0].requests, 1);
    await scan(s.id, true);
    assert.equal(calls, 1);
    const j = store.listJobs().find((j) => j.sourceId === s.id)!;
    store.writeJob({ ...j, status: "saved", notes: "Keep this" });
    // Advance only this synthetic source's persisted scheduling state.
    store.saveSource({
      ...store.getSource(s.id)!,
      lastRunAt: "2000-01-01T00:00:00Z",
      nextRunAt: null,
    });
    store.db
      .prepare("DELETE FROM counters WHERE key LIKE ?")
      .run(`scans:${s.id}:%`);
    globalThis.fetch = async () =>
      new Response(
        s.type === "workingnomads" ? "[]" : "<rss><channel></channel></rss>",
      );
    assert.equal((await scan(s.id, true)).runs?.[0].status, "complete");
    assert.equal(store.getJob(j.id)!.status, "saved");
    assert.equal(store.getJob(j.id)!.notes, "Keep this");
    assert.notEqual(store.getJob(j.id)!.availability, "closed");
  }
});
