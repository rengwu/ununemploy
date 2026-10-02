import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "ununemploy-next-sources-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = new URL("./fixtures/profile.json", import.meta.url).pathname;
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const { app } = await import("../server/index.ts");
const { config } = await import("../core/config.ts");
config.web3Token = "";
const { setWeb3Token } = await import("../core/web3-auth.ts");
const { normalizeWeb3, collectWeb3 } = await import("../core/web3.ts");
const { normalizeRss } = await import("../core/discovery.ts");
const { readUrl, FetchError } = await import("../core/http.ts");
const { scan } = await import("../core/scan.ts");
const originalFetch = globalThis.fetch;
for (const source of store.listSources())
  store.saveSource({ ...source, enabled: false });
after(async () => {
  globalThis.fetch = originalFetch;
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});

const apiJob = {
  id: 81234,
  title: "Frontend engineer",
  company: "Example",
  location: "Remote, Europe",
  remote: true,
  salary: "EUR 70,000–90,000 per year",
  apply_url: "https://web3.career/example/81234?ref=api&source=web3&b=2&a=1",
  url: "https://web3.career/example/81234",
  description:
    "<p>Build React product interfaces and developer tooling.</p><p>Applicants must be based in Europe.</p>",
  postedAt: "2026-09-16T00:00:00Z",
};

test("Web3 parses documented mixed and direct arrays and preserves exact attribution links", () => {
  const [job] = normalizeWeb3(["API", "metadata", [apiJob]]);
  assert.equal(job.url, apiJob.apply_url);
  assert.equal(job.company, "Example");
  assert.equal(job.sourceItemId, "81234");
  assert.equal(job.publishedAt, "2026-09-16T00:00:00.000Z");
  assert.equal(job.salary, apiJob.salary);
  assert.match(job.description, /based in Europe/);
  assert.doesNotMatch(job.description, /<p>/);
  assert.deepEqual(normalizeWeb3([apiJob]), [job]);
  assert.deepEqual(normalizeWeb3(["API", "metadata", []]), []);
  assert.deepEqual(normalizeWeb3([]), []);
  assert.throws(
    () => normalizeWeb3({ error: "bad token" }),
    /missing jobs array/,
  );
  assert.throws(() => normalizeWeb3(["error"]), /missing jobs array/);
  assert.deepEqual(
    normalizeWeb3([{ ...apiJob, apply_url: "javascript:alert(1)" }]),
    [],
  );
  assert.deepEqual(normalizeWeb3([{ ...apiJob, apply_url: undefined }]), []);
  assert.equal(
    normalizeWeb3([{ ...apiJob, description: undefined }])[0].kind,
    "lead",
  );
});

test("Web3 without credentials and manual sources never make scan requests", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Unexpected network request");
  };
  const web3 = store.listSources().find((s) => s.type === "web3")!;
  store.saveSource({ ...web3, enabled: true });
  assert.equal((await scan(web3.id, true)).runs?.length, 0);
  assert.equal(store.getSource(web3.id)?.state, "needs_token");
  const manual = store.addSource({
    name: "Manual board fixture",
    type: "website",
    identifier: "https://example.com/jobs",
    enabled: false,
    requestLimit: 1,
  });
  store.saveSource({ ...manual, enabled: true });
  assert.equal(store.getSource(manual.id)?.enabled, false);
  assert.equal((await scan(manual.id, true)).runs?.length, 0);
  assert.equal(calls, 0);
  assert.equal(store.listRuns().length, 0);
});

test("Web3 token is persisted privately, omitted from bootstrap, and never used as a cache key", async () => {
  const secret = "fixture-secret-123456";
  const response = await app.inject({
    method: "POST",
    url: "/api/web3/token",
    payload: { token: secret },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { configured: true });
  assert.equal(
    statSync(join(directory, "secrets/web3.json")).mode & 0o777,
    0o600,
  );
  const boot = await app.inject({ method: "GET", url: "/api/bootstrap" });
  assert.equal(boot.json().web3.configured, true);
  assert.ok(!boot.body.includes(secret));
  assert.equal(
    store.listSources().find((s) => s.type === "web3")?.state,
    "idle",
  );
  let calls = 0;
  globalThis.fetch = async (raw, options) => {
    calls++;
    const url = new URL(String(raw));
    assert.equal(url.origin + url.pathname, "https://web3.career/api/v1");
    assert.equal(url.searchParams.get("token"), secret);
    assert.equal(url.searchParams.get("limit"), "100");
    assert.equal(url.searchParams.get("show_description"), "true");
    assert.equal(url.searchParams.has("remote"), false);
    assert.equal(options?.method, "GET");
    return new Response(JSON.stringify(["API", "metadata", [apiJob]]), {
      headers: { etag: "fixture" },
    });
  };
  const web3 = store.listSources().find((s) => s.type === "web3")!;
  const result = await scan(web3.id, true);
  assert.equal(calls, 1);
  assert.equal(result.runs?.[0].added, 1);
  assert.equal(store.listJobs()[0].url, apiJob.apply_url);
  assert.equal(
    store.getJob(store.listJobs()[0].id)?.sourceLinks?.[0].url,
    apiJob.apply_url,
  );
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM http_cache").get()!.n,
    0,
  );
  assert.ok(!JSON.stringify(store.listRuns()).includes(secret));
});

test("credentialed redirects are not followed; network and malformed response errors never echo tokens", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: "https://example.com/?token=fixture" },
    });
  };
  await assert.rejects(
    readUrl(
      "https://8.8.8.8/api?token=fixture",
      { requests: 0, limit: 3 },
      { sensitive: true },
    ),
    /redirects are not followed/,
  );
  assert.equal(calls, 1);
  const secret = "fixture-private-token";
  setWeb3Token(secret);
  globalThis.fetch = async (url) => {
    throw new Error(`Failure at ${url}`);
  };
  await assert.rejects(
    collectWeb3({ requests: 0, limit: 1 }, () => {}),
    (e: Error) => !e.message.includes(secret),
  );
  globalThis.fetch = async () => new Response(`invalid JSON ${secret}`);
  await assert.rejects(
    collectWeb3({ requests: 0, limit: 1 }, () => {}),
    (e: Error) => !e.message.includes(secret),
  );
  globalThis.fetch = async () =>
    new Response(secret, { status: 429, headers: { "Retry-After": "7200" } });
  await assert.rejects(
    collectWeb3({ requests: 0, limit: 1 }, () => {}),
    (e: Error) =>
      e instanceof FetchError &&
      e.retryAfterMs === 7200000 &&
      !e.message.includes(secret),
  );
});

test("rejected Web3 credentials pause requests until replaced in Settings", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("invalid token", { status: 401 });
  };
  const web3 = store.listSources().find((s) => s.type === "web3")!;
  store.saveSource({
    ...web3,
    state: "idle",
    lastRunAt: null,
    nextRunAt: null,
  });
  await scan(web3.id, true);
  assert.equal(store.getSource(web3.id)?.state, "needs_token");
  await scan(web3.id, true);
  assert.equal(calls, 1);
  await app.inject({
    method: "POST",
    url: "/api/web3/token",
    payload: { token: "replacement-fixture" },
  });
  assert.equal(store.getSource(web3.id)?.state, "idle");
  assert.equal(store.getSource(web3.id)?.lastError, null);
});

test("manual board entry retains attribution, deduplicates and never fetches or queues a CV until saved", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Unexpected request");
  };
  const source = store.listSources().find((s) => s.name === "Wellfound")!;
  const payload = {
    sourceId: source.id,
    title: "Product engineer",
    company: "Manual company",
    url: "https://wellfound.com/jobs/fixture",
    description:
      "Build native and web product experiences using TypeScript and React, and develop AI agent workflows with a small team.",
  };
  const added = await app.inject({ method: "POST", url: "/api/jobs", payload });
  assert.equal(added.statusCode, 200);
  assert.equal(added.json().sourceName, "Wellfound");
  assert.equal(added.json().status, "new");
  assert.equal(store.listTasks().length, 0);
  const repeated = await app.inject({
    method: "POST",
    url: "/api/jobs",
    payload,
  });
  assert.equal(repeated.json().id, added.json().id);
  assert.equal(store.getSource(source.id)?.jobCount, 1);
  assert.equal(
    store.getJob(added.json().id)?.sourceLinks?.[0].name,
    "Wellfound",
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { ...payload, sourceId: "missing" },
      })
    ).statusCode,
    400,
  );
  const saved = await app.inject({
    method: "PATCH",
    url: `/api/jobs/${added.json().id}`,
    payload: { status: "saved" },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(store.listTasks()[0].state, "queued");
  assert.equal(calls, 0);
  assert.throws(
    () =>
      store.addSource({
        name: "Invalid",
        type: "website",
        identifier: "javascript:alert(1)",
        enabled: false,
        requestLimit: 1,
      }),
    /HTTP/,
  );
});

test("VueJobs extracts employer and location from its RSS excerpt and waits for the full description", async () => {
  const source = store.listSources().find((s) => s.name === "VueJobs")!;
  const [item] = normalizeRss(
    `<rss><channel><item><title>Vue engineer</title><link>https://vuejobs.com/jobs/fixture?utm_source=rssfeed</link><guid>https://vuejobs.com/jobs/fixture</guid><pubDate>Wed, 16 Sep 2026 00:00:00 +0000</pubDate><description><![CDATA[<p><strong>Employer:</strong> Creative Force</p><p><strong>Location:</strong> Remote AMERS / EU</p><p>Build software with Vue.js for a distributed team. This is a truncated introduction with over eighty characters...</p>]]></description></item></channel></rss>`,
    source,
  );
  assert.equal(item.company, "Creative Force");
  assert.equal(item.location, "Remote AMERS / EU");
  assert.equal(item.arrangement, "Remote");
  assert.equal(item.kind, "lead");
  assert.equal(item.publishedAt, "2026-09-16T00:00:00.000Z");
  const job = store.ingestJob(source, item).job;
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
    payload: {
      description:
        "Complete description: build Vue and TypeScript applications. Work remotely in Europe with three hours of daily overlap. Own feature delivery and code review.",
    },
  });
  assert.equal(
    (await app.inject({ method: "POST", url: `/api/tasks/${task.id}/retry` }))
      .statusCode,
    200,
  );
  assert.equal(
    store.listTasks().find((t) => t.id === task.id)?.state,
    "queued",
  );
});
