import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingJob, Job } from "../core/types.ts";
import {
  duplicateReason,
  groupDuplicates,
  postingIdentity,
} from "../core/deduplication.ts";
import { listingQuality } from "../core/job-quality.ts";
const dir = mkdtempSync(join(tmpdir(), "jh-quality-"));
process.env.JH_DATA_DIR = dir;
const store = await import("../core/db/index.ts");
after(() => {
  store.db.close();
  rmSync(dir, { recursive: true, force: true });
});
const source = (type: "rss" | "ashby", name: string) =>
  store.addSource({
    type,
    name,
    identifier: `https://example.com/${name}`,
    enabled: false,
    requestLimit: 1,
  });
const body =
  "Build and own the product interface for complex developer workflows. Work with TypeScript and React to ship desktop experiences and reusable design systems. Collaborate with product designers and lead architecture reviews. Improve agent orchestration workflows and evaluate how customers use the editor. Maintain thoughtful testing practices and mentor other engineers across the team. You have experience delivering software from initial concept to production and improving its usability through customer feedback.";
const item = (patch: Partial<IncomingJob> = {}): IncomingJob => ({
  sourceItemId: "one",
  title: "Senior Frontend Engineer",
  company: "Acme",
  location: "Malaysia",
  locationScope: "hiring",
  arrangement: "Remote",
  employmentType: "Full-time",
  salary: "",
  url: "https://example.com/jobs/one",
  description: body,
  descriptionQuality: "full",
  publishedAt: new Date().toISOString(),
  kind: "opening",
  ...patch,
});

test("shorter feed excerpts cannot replace full descriptions; versions preserve both and manual edits win", () => {
  const s = source("rss", "description");
  const first = store.ingestJob(s, item()).job;
  first.notes = "Keep private notes";
  first.status = "saved";
  store.writeJob(first);
  const next = store.ingestJob(
    s,
    item({
      description: "Short summary...",
      descriptionQuality: "excerpt",
      kind: "lead",
    }),
  ).job;
  assert.equal(next.description, body);
  assert.equal(next.kind, "opening");
  assert.equal(next.status, "saved");
  assert.equal(next.notes, "Keep private notes");
  assert.equal(
    store.db
      .prepare(
        "SELECT COUNT(*) AS n FROM source_item_versions WHERE source_id=?",
      )
      .get(s.id)?.n,
    2,
  );
  assert.equal(
    store.ingestJob(
      s,
      item({ description: body.slice(0, 220), descriptionQuality: "full" }),
    ).job.description,
    body.slice(0, 220),
  );
  const manual = store.getJob(first.id)!;
  manual.description = manual.descriptionOverride =
    "My complete edited job description with React and TypeScript ".repeat(3);
  manual.descriptionQuality = "full";
  store.writeJob(manual);
  assert.equal(
    store.ingestJob(s, item()).job.description,
    manual.descriptionOverride,
  );
});
test("per-source content retains the employer description and feed copies cannot reopen employer-closed jobs", () => {
  const employer = source("ashby", "employer"),
    feed = source("rss", "feed");
  const job = store.ingestJob(
    employer,
    item({ sourceItemId: "official", url: "https://example.com/employer-job" }),
  ).job;
  store.ingestJob(
    feed,
    item({
      sourceItemId: "copy",
      url: job.url,
      description: "Feed excerpt",
      descriptionQuality: "excerpt",
      kind: "lead",
    }),
  );
  assert.equal(store.getJob(job.id)?.sourceType, "ashby");
  assert.equal(store.getJob(job.id)?.description, body);
  store.db
    .prepare("UPDATE source_items SET last_seen_at=? WHERE source_id=?")
    .run("2020-01-01", employer.id);
  store.closeMissingJobs(employer.id, "2021-01-01");
  assert.equal(store.getJob(job.id)?.availability, "closed");
  store.ingestJob(feed, item({ sourceItemId: "copy", url: job.url }));
  assert.equal(store.getJob(job.id)?.availability, "closed");
  store.ingestJob(employer, item({ sourceItemId: "official", url: job.url }));
  assert.equal(store.getJob(job.id)?.availability, "open");
});
test("expired and old feed records become closed or stale despite reappearing; age never deletes saved work", () => {
  const s = source("rss", "stale");
  const old = item({
    sourceItemId: "stale",
    url: "https://example.com/stale",
    publishedAt: "2020-01-01",
  });
  const j = store.ingestJob(s, old).job;
  j.status = "applied";
  j.notes = "history";
  store.writeJob(j);
  const repeated = store.ingestJob(s, old).job;
  assert.equal(repeated.freshness, "stale");
  assert.equal(repeated.availability, "unknown");
  assert.equal(repeated.status, "applied");
  assert.equal(
    store.ingestJob(s, { ...old, expiresAt: "2020-02-01" }).job.availability,
    "closed",
  );
  assert.equal(store.getJob(j.id)?.notes, "history");
  const official = source("ashby", "live-old");
  const active = store.ingestJob(official, {
    ...old,
    url: "https://example.com/old-official",
  }).job;
  assert.equal(active.availability, "open");
  const quality = listingQuality(
    active,
    store.jobObservations(active.id),
    Date.now() + 15 * 86400000,
  );
  assert.equal(quality.freshness, "stale");
  assert.equal(quality.availability, "unknown");
});
test("cache recovery never makes old data newly current and is repeatable", () => {
  const s = source("rss", "recovery");
  const partial = item({
    url: "https://example.com/recovery",
    description: "Snippet",
    descriptionQuality: "excerpt",
    kind: "lead",
    publishedAt: "2020-01-01",
  });
  const j = store.ingestJob(s, partial).job;
  const seen = j.lastSeenAt;
  assert.equal(
    store.recoverCachedDescription(
      s,
      item({
        ...partial,
        description: body,
        descriptionQuality: "full",
        kind: "opening",
      }),
      "2020-02-01",
    ),
    true,
  );
  const recovered = store.getJob(j.id)!;
  assert.equal(recovered.lastSeenAt, seen);
  assert.equal(recovered.description, body);
  assert.equal(recovered.freshness, "stale");
  assert.equal(
    store.recoverCachedDescription(
      s,
      item({
        ...partial,
        description: body,
        descriptionQuality: "full",
        kind: "opening",
      }),
      "2020-02-01",
    ),
    false,
  );
});
function candidate(id: string, patch: Partial<Job> = {}): Job {
  const base = item();
  return {
    ...base,
    id,
    sourceId: id,
    sourceName: id,
    sourceType: "rss",
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    contentHash: id,
    category: "strong",
    score: 80,
    reasons: [],
    gaps: [],
    eligibility: "unknown",
    eligibilityNotes: [],
    status: "new",
    notes: "",
    savedAt: null,
    availability: "open",
    ...patch,
  };
}
test("cross-board duplicates group reversibly; saved records, notes and source links remain intact", () => {
  const a = candidate("a"),
    b = candidate("b", {
      company: "Acme Inc.",
      title: "Senior Front-end Engineer",
      url: "https://board.example/b",
      description: body + " Apply on the employer website.",
      status: "saved",
      notes: "Keep",
      savedAt: new Date().toISOString(),
    });
  assert.ok(duplicateReason(a, b));
  const grouped = groupDuplicates([a, b]);
  assert.equal(grouped.find((j) => j.id === "a")?.duplicateOf, "b");
  assert.equal(grouped.find((j) => j.id === "b")?.notes, "Keep");
  assert.equal(grouped[0].relatedListings?.[0].id, "b");
  assert.equal(a.duplicateOf, undefined);
  const changed = groupDuplicates([
    a,
    { ...b, title: "Staff Frontend Engineer" },
  ]);
  assert.ok(changed.every((j) => !j.duplicateOf));
});
test("distinct levels, locations, requisitions, generic posts and reposts remain separate", () => {
  const a = candidate("a");
  for (const patch of [
    { title: "Staff Frontend Engineer" },
    { location: "Singapore" },
    { company: "Different" },
    { description: "Different duties ".repeat(50) },
    { publishedAt: "2020-01-01" },
    { sourceType: "hn" },
    { eligibility: "incompatible" as const },
  ])
    assert.equal(
      duplicateReason(a, candidate("b", patch)),
      null,
      JSON.stringify(patch),
    );
  assert.equal(
    duplicateReason(
      candidate("a", { sourceType: "ashby" }),
      candidate("b", { sourceType: "ashby" }),
    ),
    null,
  );
  assert.equal(
    duplicateReason(
      candidate("a", { location: "Remote" }),
      candidate("b", { location: "Remote" }),
    ),
    null,
  );
});
test("job-specific ATS identity crosses URL aliases but generic careers links never prove identity", () => {
  const a = candidate("a", {
    sourceType: "greenhouse",
    url: "https://boards.greenhouse.io/acme/jobs/123",
  });
  const b = candidate("b", {
    url: "https://board.example/job",
    applicationUrl: "https://job-boards.greenhouse.io/acme/jobs/123?gh_src=x",
    location: "Remote",
  });
  assert.equal(duplicateReason(a, b), "Same employer posting");
  assert.equal(postingIdentity("https://example.com/careers"), null);
  assert.equal(
    duplicateReason(a, {
      ...b,
      applicationUrl: "https://job-boards.greenhouse.io/acme/jobs/124",
    }),
    null,
  );
});
test("profile edits and description edits recompute matches without changing saved work", () => {
  const s = source("rss", "reassessment");
  const j = store.ingestJob(
    s,
    item({
      url: "https://example.com/reassessment",
      location: "United States",
      description:
        body +
        " Candidates must be authorized to work in the United States. No visa sponsorship is available.",
    }),
  ).job;
  j.status = "saved";
  j.notes = "Retain";
  store.writeJob(j);
  const p = store.getProfile();
  p.preferences.existingWorkAuthorizationsOutsideMalaysia = ["United States"];
  store.saveProfile(p, p.revision);
  const updated = store.getJob(j.id)!;
  assert.notEqual(updated.eligibility, "incompatible");
  assert.equal(updated.matchProfileRevision, 2);
  assert.equal(updated.notes, "Retain");
  assert.equal(updated.status, "saved");
});

test("identical excerpts and distinct requisition numbers are not semantic duplicates", () => {
  const a = candidate("a", { descriptionQuality: "excerpt" }),
    b = candidate("b", { descriptionQuality: "excerpt" });
  assert.equal(duplicateReason(a, b), null);
  assert.equal(
    duplicateReason(
      {
        ...a,
        descriptionQuality: "full",
        description: body + " Requisition ID: R100",
      },
      {
        ...b,
        descriptionQuality: "full",
        description: body + " Requisition ID: R200",
      },
    ),
    null,
  );
});

test("an omitted feed expiry cannot reopen a known expired listing", () => {
  const s = source("rss", "expiry-omitted");
  const expired = item({
    sourceItemId: "expired-omitted",
    url: "https://example.com/expired-omitted",
    publishedAt: "2020-01-01",
    expiresAt: "2020-02-01",
  });
  const j = store.ingestJob(s, expired).job;
  assert.equal(j.availability, "closed");
  assert.equal(
    store.ingestJob(s, { ...expired, expiresAt: null }).job.availability,
    "closed",
  );
  assert.equal(
    store.ingestJob(s, {
      ...expired,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      publishedAt: new Date().toISOString(),
    }).job.availability,
    "open",
  );
});

test("grouping after filters retains a matching copy when the preferred listing is filtered out", async () => {
  const { visibleListings } = await import("../core/listing-visibility.ts");
  const a = candidate("a"),
    b = candidate("b", { duplicateOf: "a" }),
    c = candidate("c", { duplicateOf: "a" });
  assert.deepEqual(
    visibleListings([a, b, c], false).map((j) => j.id),
    ["a"],
  );
  assert.deepEqual(
    visibleListings([b, c], false).map((j) => j.id),
    ["b"],
  );
  assert.equal(visibleListings([a, b, c], true).length, 3);
});
