import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { emptyProfile } from "../profile/facts.ts";
import { config } from "../config.ts";
import { defaultCoverLetterTemplate } from "../cover-letter/template.ts";
import { defaultTemplate } from "../cv/template.ts";
import {
  profileSchema,
  type Profile,
  type Job,
  type Source,
  type IncomingJob,
  type ScanRun,
  type Template,
  type Task,
  type CvVersion,
  type CoverLetterVersion,
  type AppSettings,
} from "../types.ts";
import { assessJob, MATCH_VERSION } from "../matching.ts";
import {
  descriptionQuality,
  preserveDescription,
  sourceContent,
  selectContent,
  listingQuality,
  type Observation,
} from "../job-quality.ts";
import { groupDuplicates } from "../deduplication.ts";
import { boardFor } from "../boards/catalog.ts";
import { discoverySources } from "../source-catalog.ts";

mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(resolve(config.dataDir, "job-hunter.db"));
db.exec(
  "PRAGMA busy_timeout=60000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;",
);
db.exec(
  "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
);
{
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      !db.prepare("SELECT version FROM schema_migrations WHERE version=1").get()
    ) {
      db.exec(
        readFileSync(
          new URL("./migrations/001_initial.sql", import.meta.url),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO schema_migrations VALUES (1, ?)").run(
        new Date().toISOString(),
      );
    }
    if (
      !db.prepare("SELECT version FROM schema_migrations WHERE version=2").get()
    ) {
      db.exec(
        readFileSync(
          new URL("./migrations/002_listing_evidence.sql", import.meta.url),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO schema_migrations VALUES (2, ?)").run(
        new Date().toISOString(),
      );
    }
    if (
      !db.prepare("SELECT version FROM schema_migrations WHERE version=3").get()
    ) {
      db.exec(
        readFileSync(
          new URL("./migrations/003_data_revisions.sql", import.meta.url),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO schema_migrations VALUES (3, ?)").run(
        new Date().toISOString(),
      );
    }
    if (
      !db.prepare("SELECT version FROM schema_migrations WHERE version=4").get()
    ) {
      db.exec(
        readFileSync(
          new URL("./migrations/004_cover_letters.sql", import.meta.url),
          "utf8",
        ),
      );
      // Keep completed resumes immutable. Unfinished work now produces letters.
      for (const row of db
        .prepare(
          "SELECT id,document,idempotency_key FROM tasks WHERE kind='cv' AND state IN ('queued','running','paused','failed','needs_details')",
        )
        .all()) {
        const task = JSON.parse(row.document as string) as Task;
        task.kind = "cover_letter";
        if (task.state === "running") task.state = "paused";
        task.error =
          task.state === "needs_details"
            ? "Add the complete job description before generating a cover letter."
            : task.state === "paused" || task.state === "failed"
              ? "Resume generation was replaced by cover letters. Retry to continue."
              : null;
        task.input.template = defaultCoverLetterTemplate;
        task.resultId = null;
        task.updatedAt = new Date().toISOString();
        db.prepare(
          "UPDATE tasks SET kind=?,state=?,document=?,idempotency_key=? WHERE id=?",
        ).run(
          task.kind,
          task.state,
          JSON.stringify(task),
          row.idempotency_key ? `first-cover-letter:${task.jobId}` : null,
          task.id,
        );
      }
      db.prepare("INSERT INTO schema_migrations VALUES (4, ?)").run(
        new Date().toISOString(),
      );
    }
    if (
      !db.prepare("SELECT version FROM schema_migrations WHERE version=5").get()
    ) {
      db.exec(
        readFileSync(
          new URL("./migrations/005_board_queue.sql", import.meta.url),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO schema_migrations VALUES (5, ?)").run(
        new Date().toISOString(),
      );
    }
    if (
      !db.prepare("SELECT version FROM schema_migrations WHERE version=6").get()
    ) {
      db.exec(
        readFileSync(
          new URL("./migrations/006_latex.sql", import.meta.url),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO schema_migrations VALUES (6, ?)").run(
        new Date().toISOString(),
      );
    }
    if (
      !db.prepare("SELECT version FROM schema_migrations WHERE version=7").get()
    ) {
      db.exec(
        readFileSync(
          new URL("./migrations/007_jev.sql", import.meta.url),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO schema_migrations VALUES (7, ?)").run(
        new Date().toISOString(),
      );
    }
    if (
      !db.prepare("SELECT version FROM schema_migrations WHERE version=8").get()
    ) {
      db.exec(
        readFileSync(
          new URL("./migrations/008_profile_chat.sql", import.meta.url),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO schema_migrations VALUES (8, ?)").run(
        new Date().toISOString(),
      );
    }
    if (
      !db.prepare("SELECT version FROM schema_migrations WHERE version=9").get()
    ) {
      db.exec(
        readFileSync(
          new URL("./migrations/009_assistant.sql", import.meta.url),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO schema_migrations VALUES (9, ?)").run(
        new Date().toISOString(),
      );
    }
    if (
      !db
        .prepare("SELECT version FROM schema_migrations WHERE version=10")
        .get()
    ) {
      db.exec(
        readFileSync(
          new URL(
            "./migrations/010_imported_observations.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO schema_migrations VALUES (10, ?)").run(
        new Date().toISOString(),
      );
    }
    if (
      !db
        .prepare("SELECT version FROM schema_migrations WHERE version=11")
        .get()
    ) {
      db.exec(
        readFileSync(
          new URL("./migrations/011_assistant_only.sql", import.meta.url),
          "utf8",
        ),
      );
      db.prepare("INSERT INTO schema_migrations VALUES (11, ?)").run(
        new Date().toISOString(),
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
let transactionDepth = 0;
export function transaction<T>(fn: () => T): T {
  const depth = transactionDepth++;
  const savepoint = `app_transaction_${depth}`;
  try {
    db.exec(depth ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
  } catch (error) {
    transactionDepth--;
    throw error;
  }
  try {
    const result = fn();
    db.exec(depth ? `RELEASE ${savepoint}` : "COMMIT");
    return result;
  } catch (error) {
    if (depth) {
      db.exec(`ROLLBACK TO ${savepoint}`);
      db.exec(`RELEASE ${savepoint}`);
    } else db.exec("ROLLBACK");
    throw error;
  } finally {
    transactionDepth--;
  }
}
const parse = <T>(row: unknown): T | null =>
  row ? (JSON.parse((row as { document: string }).document) as T) : null;
export const now = () => new Date().toISOString();
export const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export function setting<T>(key: string, fallback: T): T {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key) as
    { value: string } | undefined;
  return row ? JSON.parse(row.value) : fallback;
}
export function putSetting(key: string, value: unknown) {
  db.prepare(
    "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(key, JSON.stringify(value));
}
export function getSettings(): AppSettings {
  return setting("app", {
    scanIntervalHours: Number(process.env.JH_SCAN_INTERVAL_HOURS || 4),
    scheduleEnabled: process.env.JH_SCHEDULE_ENABLED !== "false",
    timezone: process.env.JH_TIMEZONE || "Asia/Kuala_Lumpur",
    xMonthlyPostLimit: 0,
    xEnabled: false,
    aiEnabled: true,
  });
}
export function getProfile(): Profile {
  return parse<Profile>(
    db
      .prepare(
        "SELECT document FROM profile_versions ORDER BY revision DESC LIMIT 1",
      )
      .get(),
  )!;
}
export function saveProfile(
  input: unknown,
  expectedRevision: number,
  options: { onCommit?: (profile: Profile) => void } = {},
) {
  const document = profileSchema.parse(input);
  return transaction(() => {
    const previous = getProfile();
    if (previous.revision !== expectedRevision)
      throw new Error(
        "The profile changed in another window. Reload before saving.",
      );
    document.revision = previous.revision + 1;
    db.prepare("INSERT INTO profile_versions VALUES (?,?,?)").run(
      document.revision,
      JSON.stringify(document),
      now(),
    );
    for (const row of db.prepare("SELECT document FROM jobs").all()) {
      const job = parse<Job>(row)!;
      writeJob({ ...job, ...assessJob(job, document) });
    }
    options.onCommit?.(document);
    return document;
  });
}
transaction(() => {
  if (!db.prepare("SELECT revision FROM profile_versions LIMIT 1").get()) {
    const profile = process.env.JH_PROFILE_SEED
      ? profileSchema.parse(
          JSON.parse(
            readFileSync(resolve(process.env.JH_PROFILE_SEED), "utf8"),
          ),
        )
      : emptyProfile();
    db.prepare("INSERT INTO profile_versions VALUES (?,?,?)").run(
      profile.revision,
      JSON.stringify(profile),
      now(),
    );
  }
});
export function getTemplate(): Template {
  return setting("template", defaultTemplate);
}
export function listSources(): Source[] {
  return db
    .prepare("SELECT document FROM sources ORDER BY rowid")
    .all()
    .map((r) => parse<Source>(r)!);
}
export function getSource(id: string) {
  return parse<Source>(
    db.prepare("SELECT document FROM sources WHERE id=?").get(id),
  );
}
export function saveSource(source: Source) {
  if (source.type === "public_board") {
    boardFor(source.identifier);
    const duplicate = db
      .prepare(
        "SELECT id FROM sources WHERE type='public_board' AND identifier=? AND id!=?",
      )
      .get(source.identifier, source.id);
    if (duplicate)
      throw new Error(
        "This job board is already configured. Edit its existing source.",
      );
    source = {
      ...source,
      requestLimit: Math.min(12, source.requestLimit),
      intervalHours: Math.max(12, source.intervalHours || 12),
    };
  }
  if (source.type === "website") {
    const url = new URL(source.identifier);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Use an HTTP or HTTPS website URL without credentials.");
    source = { ...source, enabled: false, nextRunAt: null };
  }
  db.prepare(
    "INSERT INTO sources VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document,type=excluded.type,identifier=excluded.identifier",
  ).run(source.id, JSON.stringify(source), source.type, source.identifier);
  return source;
}
export function addSource(
  input: Pick<
    Source,
    | "name"
    | "type"
    | "identifier"
    | "enabled"
    | "requestLimit"
    | "intervalHours"
  >,
): Source {
  return saveSource({
    ...input,
    id: randomUUID(),
    state: "idle",
    lastRunAt: null,
    nextRunAt: null,
    lastError: null,
    jobCount: 0,
    checkpoint: {},
  });
}
transaction(() => {
  if (!setting("sourcesSeeded", false)) {
    for (const source of [
      { name: "Hacker News", type: "hn", identifier: "whoishiring" },
      { name: "Anthropic", type: "greenhouse", identifier: "anthropic" },
      { name: "Linear", type: "ashby", identifier: "linear" },
      { name: "Vercel", type: "greenhouse", identifier: "vercel" },
      { name: "Cursor", type: "ashby", identifier: "cursor" },
    ] as const)
      addSource({ ...source, enabled: true, requestLimit: 30 });
    for (const source of discoverySources) addSource(source);
    putSetting("sourcesSeeded", true);
  }
});
transaction(() => {
  if (!setting("xSourceSeeded", false)) {
    if (!listSources().some((s) => s.type === "x"))
      addSource({
        name: "X · Engineering",
        type: "x",
        identifier: `(hiring OR "join our team" OR "we are looking for" OR "we're looking for") (frontend OR "front-end" OR "front end" OR fullstack OR "full-stack" OR "software engineer" OR "product engineer" OR "design engineer" OR "AI engineer" OR "founding engineer" OR "mobile engineer" OR "developer tools" OR "coding agent" OR harness OR TypeScript OR React OR Flutter OR Swift) -is:retweet`,
        enabled: true,
        requestLimit: 1,
      });
    putSetting("xSourceSeeded", true);
  }
});
export function canonicalUrl(raw: string): string {
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Job links must use HTTP or HTTPS without embedded credentials.",
    );
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|ref$|source$|gh_src$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString().replace(/\/$/, "");
}
export function getJob(id: string): Job | null {
  const job = parse<Job>(
    db.prepare("SELECT document FROM jobs WHERE id=?").get(id),
  );
  if (!job) return null;
  const task = parse<Task>(
    db
      .prepare(
        "SELECT document FROM tasks WHERE job_id=? AND kind='cover_letter' ORDER BY created_at DESC,rowid DESC LIMIT 1",
      )
      .get(id),
  );
  const cv = parse<CvVersion>(
    db
      .prepare(
        "SELECT document FROM cv_versions WHERE job_id=? ORDER BY version DESC LIMIT 1",
      )
      .get(id),
  );
  const letter = listCoverLetterVersions(id)[0];
  job.coverLetterState = task?.state || null;
  job.coverLetterId = letter?.id || null;
  job.cvState = null;
  job.cvId = cv?.id || null;
  const observations = jobObservations(id);
  job.sourceLinks = observations.map((o) => ({
    name: o.sourceName,
    url: o.item.url,
  }));
  return { ...job, ...listingQuality(job, observations) };
}
export function listJobs(): Job[] {
  // Load each relation once. Calling getJob for every listing performs seven
  // queries per job and repeatedly parses entire CVs and source settings.
  const jobs = db
    .prepare("SELECT document FROM jobs ORDER BY first_seen_at DESC")
    .all()
    .map((row) => parse<Job>(row)!);
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const latest = (rows: { job_id: string; value: string }[]) => {
    const values = new Map<string, string>();
    for (const row of rows)
      if (!values.has(row.job_id)) values.set(row.job_id, row.value);
    return values;
  };
  const tasks = latest(
    db
      .prepare(
        "SELECT job_id, json_extract(document,'$.state') AS value FROM tasks WHERE kind='cover_letter' ORDER BY created_at DESC,rowid DESC",
      )
      .all() as { job_id: string; value: string }[],
  );
  const cvs = latest(
    db
      .prepare(
        "SELECT job_id,id AS value FROM cv_versions WHERE job_id IS NOT NULL ORDER BY version DESC",
      )
      .all() as { job_id: string; value: string }[],
  );
  const letters = latest(
    db
      .prepare(
        "SELECT job_id,id AS value FROM cover_letter_versions ORDER BY version DESC",
      )
      .all() as { job_id: string; value: string }[],
  );
  const sources = new Map(listSources().map((source) => [source.id, source]));
  const observations = new Map<string, Observation[]>();
  for (const row of db
    .prepare("SELECT job_id, document FROM imported_observations")
    .all())
    observations.set(String(row.job_id), JSON.parse(String(row.document)));
  for (const job of jobs) {
    job.coverLetterState = (tasks.get(job.id) as Task["state"]) || null;
    job.coverLetterId = letters.get(job.id) || null;
    job.cvState = null;
    job.cvId = cvs.get(job.id) || null;
    job.sourceLinks = [];
  }
  for (const row of db
    .prepare("SELECT * FROM source_items ORDER BY rowid")
    .all() as unknown as ObservationRow[]) {
    const job = byId.get(row.job_id),
      source = sources.get(row.source_id);
    if (!job || !source) continue;
    const entries = observations.get(job.id) || [];
    observations.set(
      job.id,
      mergeObservations(entries, [parseObservation(row, source, job)]),
    );
  }
  const timestamp = Date.now();
  return groupDuplicates(
    jobs.map((job) => ({
      ...job,
      sourceLinks: (observations.get(job.id) || []).map((o) => ({
        name: o.sourceName,
        url: o.item.url,
      })),
      ...listingQuality(job, observations.get(job.id) || [], timestamp),
    })),
  );
}
export function markJobSeen(id: string) {
  const timestamp = now();
  db.prepare(
    "UPDATE jobs SET document=json_set(document,'$.seenAt',?),updated_at=? WHERE id=? AND json_extract(document,'$.seenAt') IS NULL",
  ).run(timestamp, timestamp, id);
  const row = db
    .prepare(
      "SELECT json_extract(document,'$.seenAt') AS seenAt FROM jobs WHERE id=?",
    )
    .get(id) as { seenAt: string } | undefined;
  if (!row) throw new Error("Job not found.");
  return { id, seenAt: row.seenAt };
}
export function writeJob(job: Job) {
  job = { ...job, ...assessJob(job, getProfile()) };
  delete job.duplicateOf;
  delete job.duplicateReason;
  delete job.relatedListings;
  db.prepare("UPDATE jobs SET document=?,status=?,updated_at=? WHERE id=?").run(
    JSON.stringify(job),
    job.status,
    now(),
    job.id,
  );
  return job;
}
type ObservationRow = {
  job_id: string;
  url: string;
  source_id: string;
  source_item_id: string;
  document: string | null;
  last_seen_at: string;
  first_seen_at: string | null;
  changed_at: string | null;
  missing_at: string | null;
};
function parseObservation(
  row: ObservationRow,
  source: Source,
  legacy?: Job,
): Observation {
  const item = row.document
    ? (JSON.parse(row.document) as IncomingJob)
    : legacy!;
  return {
    sourceId: row.source_id,
    sourceType: source.type,
    sourceName: source.name,
    item,
    firstSeenAt:
      row.first_seen_at || (item as Job).firstSeenAt || row.last_seen_at,
    checkedAt: row.last_seen_at,
    changedAt: row.changed_at || row.last_seen_at,
    missingAt: row.missing_at,
  };
}
export function jobObservations(jobId: string): Observation[] {
  const rows = db
    .prepare(
      `SELECT i.*, s.document AS source_document FROM source_items i JOIN sources s ON s.id=i.source_id WHERE i.job_id=?`,
    )
    .all(jobId) as unknown as (ObservationRow & { source_document: string })[];
  const legacy = () =>
    parse<Job>(db.prepare("SELECT document FROM jobs WHERE id=?").get(jobId))!;
  const imported = db
    .prepare("SELECT document FROM imported_observations WHERE job_id=?")
    .get(jobId);
  return mergeObservations(
    imported ? JSON.parse(String(imported.document)) : [],
    rows.map((r) =>
      parseObservation(
        r,
        JSON.parse(r.source_document) as Source,
        r.document ? undefined : legacy(),
      ),
    ),
  );
}
function mergeObservations(
  imported: Observation[],
  live: Observation[],
): Observation[] {
  const key = (o: Observation) =>
    JSON.stringify([
      o.sourceType,
      o.item.sourceItemId,
      canonicalUrl(o.item.url),
    ]);
  const records = new Map(imported.map((o) => [key(o), o]));
  for (const o of live) records.set(key(o), o);
  return [...records.values()];
}
function refreshJobContent(job: Job): Job {
  const observations = jobObservations(job.id);
  const selected = selectContent(observations);
  if (selected) {
    const item = selected.item;
    const previousOverride = job.descriptionOverride;
    job = {
      ...job,
      ...item,
      sourceId: selected.sourceId,
      sourceName: selected.sourceName,
      sourceType: selected.sourceType,
      descriptionQuality: descriptionQuality(item),
      descriptionSource: item.descriptionSource || {
        name: selected.sourceName,
        url: item.url,
        checkedAt: selected.checkedAt,
      },
      contentChangedAt: selected.changedAt,
      lastSeenAt:
        observations
          .map((o) => o.checkedAt)
          .sort()
          .at(-1) || job.lastSeenAt,
    };
    if (previousOverride !== undefined)
      job = {
        ...job,
        description: previousOverride,
        descriptionOverride: previousOverride,
        descriptionQuality: previousOverride.trim() ? "full" : "unknown",
        descriptionSource: {
          name: "Manual edit",
          url: job.url,
          checkedAt: job.contentChangedAt || now(),
        },
      };
  }
  return writeJob({ ...job, ...listingQuality(job, observations) });
}
export function ingestJob(
  source: Source,
  item: IncomingJob,
): { added: number; updated: number; job: Job } {
  return transaction(() => {
    const url = canonicalUrl(item.url),
      timestamp = now();
    const link = db
      .prepare(
        "SELECT job_id,document,content_hash,changed_at FROM source_items WHERE source_id=? AND source_item_id=?",
      )
      .get(source.id, item.sourceItemId) as
      | {
          job_id: string;
          document: string | null;
          content_hash: string | null;
          changed_at: string | null;
        }
      | undefined;
    const byUrl = db
      .prepare("SELECT job_id FROM source_items WHERE url=? LIMIT 1")
      .get(item.url) as { job_id: string } | undefined;
    const storedJob = (id: string) =>
      parse<Job>(db.prepare("SELECT document FROM jobs WHERE id=?").get(id));
    const previous = link
      ? storedJob(link.job_id)
      : byUrl
        ? storedJob(byUrl.job_id)
        : parse<Job>(
            db
              .prepare("SELECT document FROM jobs WHERE canonical_url=?")
              .get(url),
          );
    const contentHash = hash(sourceContent(item));
    let previousItem = link?.document
      ? (JSON.parse(link.document) as IncomingJob)
      : undefined;
    // Older HTTP removals were stored as expiry dates. The closed queue retains
    // the publisher's original expiry, so recover it when that URL is observed again.
    if (
      previousItem?.expiresAt &&
      !previousItem.removedAt &&
      item.removedAt &&
      source.type === "public_board"
    ) {
      const queued = db
        .prepare(
          "SELECT document FROM board_queue WHERE source_id=? AND url=? AND state='closed'",
        )
        .get(source.id, item.url);
      if (queued)
        previousItem = {
          ...previousItem,
          expiresAt: JSON.parse(String(queued.document)).expiresAt ?? null,
          removedAt: item.removedAt,
        };
    }
    const unchanged =
      link?.content_hash === contentHash ||
      (!!previousItem && sourceContent(previousItem) === sourceContent(item));
    const storedItem = previousItem
      ? preserveDescription(previousItem, item)
      : { ...item, descriptionQuality: descriptionQuality(item) };
    const base = {
      ...item,
      id: previous?.id || randomUUID(),
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      firstSeenAt: previous?.firstSeenAt || timestamp,
      lastSeenAt: timestamp,
      contentHash,
      status: previous?.status || "new",
      notes: previous?.notes || "",
      savedAt: previous?.savedAt || null,
      availability: "unknown" as const,
    };
    const job: Job = previous || { ...base, ...assessJob(base, getProfile()) };
    if (!previous)
      db.prepare("INSERT INTO jobs VALUES (?,?,?,?,?,?)").run(
        job.id,
        url,
        JSON.stringify(job),
        job.status,
        timestamp,
        timestamp,
      );
    if (!unchanged)
      db.prepare(
        `INSERT INTO source_item_versions VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING`,
      ).run(
        source.id,
        item.sourceItemId,
        contentHash,
        JSON.stringify(item),
        timestamp,
      );
    db.prepare(
      `INSERT INTO source_items (source_id,source_item_id,job_id,url,last_seen_at,document,content_hash,first_seen_at,changed_at,missing_at)
      VALUES (?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(source_id,source_item_id) DO UPDATE SET job_id=excluded.job_id,url=excluded.url,last_seen_at=excluded.last_seen_at,document=excluded.document,content_hash=excluded.content_hash,changed_at=excluded.changed_at,missing_at=NULL`,
    ).run(
      source.id,
      item.sourceItemId,
      job.id,
      item.url,
      timestamp,
      JSON.stringify(storedItem),
      contentHash,
      timestamp,
      unchanged ? link?.changed_at || timestamp : timestamp,
    );
    job.contentHash = contentHash;
    return {
      added: previous ? 0 : 1,
      updated: previous && !unchanged ? 1 : 0,
      job: refreshJobContent(job),
    };
  });
}
// Existing collections are upgraded locally; no provider requests or saved-task mutations.
export function refreshAllJobs() {
  return transaction(() => {
    const jobs = db
      .prepare("SELECT document FROM jobs")
      .all()
      .map((r) => parse<Job>(r)!);
    for (const job of jobs) refreshJobContent(job);
    putSetting("matchingVersion", {
      version: MATCH_VERSION,
      profileRevision: getProfile().revision,
    });
    return jobs.length;
  });
}
export function recoverCachedDescription(
  source: Source,
  item: IncomingJob,
  checkedAt: string,
): boolean {
  return transaction(() => {
    const row = db
      .prepare(
        "SELECT job_id,document FROM source_items WHERE source_id=? AND source_item_id=?",
      )
      .get(source.id, item.sourceItemId) as
      { job_id: string; document: string } | undefined;
    if (!row) return false;
    const previous = JSON.parse(row.document) as IncomingJob;
    const same = previous.description === item.description;
    const selected = selectContent([
      {
        sourceId: source.id,
        sourceType: source.type,
        sourceName: source.name,
        item: previous,
        firstSeenAt: checkedAt,
        checkedAt,
        changedAt: checkedAt,
        missingAt: null,
      },
      {
        sourceId: source.id,
        sourceType: source.type,
        sourceName: source.name,
        item,
        firstSeenAt: checkedAt,
        checkedAt,
        changedAt: checkedAt,
        missingAt: null,
      },
    ]);
    if (!same && selected?.item !== item) return false;
    const recovered = {
      ...previous,
      description: item.description,
      descriptionQuality: descriptionQuality(item),
      kind: item.kind,
      locationScope: item.locationScope || previous.locationScope,
      applicationUrl: item.applicationUrl || previous.applicationUrl,
    };
    if (JSON.stringify(recovered) === JSON.stringify(previous)) return false;
    db.prepare(
      "UPDATE source_items SET document=? WHERE source_id=? AND source_item_id=?",
    ).run(JSON.stringify(recovered), source.id, item.sourceItemId);
    db.prepare(
      "INSERT OR IGNORE INTO source_item_versions VALUES (?,?,?,?,?)",
    ).run(
      source.id,
      item.sourceItemId,
      hash(sourceContent(item)),
      JSON.stringify(item),
      checkedAt,
    );
    refreshJobContent(getJob(row.job_id)!);
    return true;
  });
}
export function putRun(run: ScanRun) {
  db.prepare(
    "INSERT INTO scan_runs VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document",
  ).run(run.id, run.sourceId, JSON.stringify(run), run.startedAt);
}
export function closeMissingJobs(sourceId: string, snapshotStartedAt: string) {
  transaction(() => {
    const rows = db
      .prepare(
        "SELECT job_id FROM source_items WHERE source_id=? AND last_seen_at<?",
      )
      .all(sourceId, snapshotStartedAt) as { job_id: string }[];
    db.prepare(
      "UPDATE source_items SET missing_at=? WHERE source_id=? AND last_seen_at<?",
    ).run(now(), sourceId, snapshotStartedAt);
    for (const row of rows) {
      const job = getJob(row.job_id);
      if (job) refreshJobContent(job);
    }
  });
}
export function listRuns(): ScanRun[] {
  return db
    .prepare("SELECT document FROM scan_runs ORDER BY started_at DESC LIMIT 60")
    .all()
    .map((r) => parse<ScanRun>(r)!);
}
export function lease(name: string, owner: string, ttlMs: number): boolean {
  const timestamp = Date.now();
  const result = db
    .prepare(
      "INSERT INTO leases VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE leases.expires_at < ? OR leases.owner=?",
    )
    .run(name, owner, timestamp + ttlMs, timestamp, owner);
  return Number(result.changes) === 1;
}
export function release(name: string, owner: string) {
  db.prepare("DELETE FROM leases WHERE name=? AND owner=?").run(name, owner);
}
export function incrementCounter(key: string, amount = 1) {
  db.prepare(
    "INSERT INTO counters VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=value+excluded.value",
  ).run(key, amount);
}
export function getCounter(key: string) {
  return Number(
    (
      db.prepare("SELECT value FROM counters WHERE key=?").get(key) as
        { value: number } | undefined
    )?.value || 0,
  );
}
export function saveTask(task: Task, idempotencyKey?: string) {
  db.prepare(
    "INSERT INTO tasks VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,state=excluded.state,document=excluded.document",
  ).run(
    task.id,
    task.jobId,
    task.kind,
    task.state,
    JSON.stringify(task),
    task.createdAt,
    idempotencyKey || null,
  );
}
export function listTasks(): Task[] {
  return db
    .prepare("SELECT document FROM tasks ORDER BY created_at")
    .all()
    .map((r) => parse<Task>(r)!);
}
export function needsJobDetails(job: Job): boolean {
  return (
    job.description.trim().length < 80 ||
    (descriptionQuality(job) !== "full" && !job.descriptionOverride?.trim())
  );
}
export function queueCoverLetter(jobId: string, regenerate = false): Task {
  return transaction(() => {
    const job = getJob(jobId);
    if (!job) throw new Error("Job not found.");
    if (!regenerate || job.status !== "applied") job.status = "saved";
    job.savedAt ||= now();
    writeJob(job);
    if (!regenerate) {
      const existing = parse<Task>(
        db
          .prepare(
            "SELECT document FROM tasks WHERE job_id=? AND kind='cover_letter' ORDER BY created_at DESC,rowid DESC LIMIT 1",
          )
          .get(jobId),
      );
      if (existing) return existing;
    }
    {
      const active = listTasks().find(
        (t) =>
          t.kind === "cover_letter" &&
          t.jobId === jobId &&
          ["queued", "running"].includes(t.state),
      );
      if (active) return active;
    }
    const task: Task = {
      id: randomUUID(),
      jobId,
      kind: "cover_letter",
      state: needsJobDetails(job) ? "needs_details" : "queued",
      createdAt: now(),
      updatedAt: now(),
      attempts: 0,
      error: needsJobDetails(job)
        ? "Add the complete job description before generating a cover letter."
        : null,
      resultId: null,
      input: { job, profile: getProfile(), template: getCoverLetterTemplate() },
    };
    saveTask(task, regenerate ? undefined : `first-cover-letter:${jobId}`);
    return task;
  });
}
export function getCoverLetterTemplate(): Template {
  return defaultCoverLetterTemplate;
}
export function listCoverLetterVersions(jobId: string): CoverLetterVersion[] {
  return db
    .prepare(
      "SELECT document FROM cover_letter_versions WHERE job_id=? ORDER BY version DESC",
    )
    .all(jobId)
    .map((row) => parse<CoverLetterVersion>(row)!);
}
export function getCoverLetter(id: string) {
  return parse<CoverLetterVersion>(
    db.prepare("SELECT document FROM cover_letter_versions WHERE id=?").get(id),
  );
}
export function saveCoverLetter(
  input: Omit<CoverLetterVersion, "id" | "version" | "createdAt">,
) {
  const letter: CoverLetterVersion = {
    ...input,
    id: randomUUID(),
    version: (listCoverLetterVersions(input.jobId)[0]?.version || 0) + 1,
    createdAt: now(),
  };
  db.prepare("INSERT INTO cover_letter_versions VALUES (?,?,?,?,?)").run(
    letter.id,
    letter.jobId,
    letter.version,
    JSON.stringify(letter),
    letter.createdAt,
  );
  return letter;
}
export function listCvVersions(jobId?: string | null): CvVersion[] {
  const rows = jobId
    ? db
        .prepare(
          "SELECT document FROM cv_versions WHERE job_id=? ORDER BY version DESC",
        )
        .all(jobId)
    : db
        .prepare(
          "SELECT document FROM cv_versions WHERE job_id IS NULL ORDER BY version DESC",
        )
        .all();
  return rows.map((r) => parse<CvVersion>(r)!);
}
export function getCv(id: string) {
  return parse<CvVersion>(
    db.prepare("SELECT document FROM cv_versions WHERE id=?").get(id),
  );
}
export function saveCv(input: Omit<CvVersion, "id" | "version" | "createdAt">) {
  const versions = listCvVersions(input.jobId);
  const cv: CvVersion = {
    ...input,
    id: randomUUID(),
    version: (versions[0]?.version || 0) + 1,
    createdAt: now(),
  };
  db.prepare("INSERT INTO cv_versions VALUES (?,?,?,?,?)").run(
    cv.id,
    cv.jobId,
    cv.version,
    JSON.stringify(cv),
    cv.createdAt,
  );
  return cv;
}

// Backfill only what is recoverable from the old schema; history starts at this migration.
transaction(() => {
  const rows = db
    .prepare(
      "SELECT source_id,source_item_id,job_id,last_seen_at FROM source_items WHERE document IS NULL",
    )
    .all() as {
    source_id: string;
    source_item_id: string;
    job_id: string;
    last_seen_at: string;
  }[];
  for (const row of rows) {
    const job = parse<Job>(
      db.prepare("SELECT document FROM jobs WHERE id=?").get(row.job_id),
    )!;
    const item: IncomingJob = {
      sourceItemId: row.source_item_id,
      title: job.title,
      company: job.company,
      location: job.location,
      locationScope: job.locationScope,
      arrangement: job.arrangement,
      employmentType: job.employmentType,
      salary: job.salary,
      url: job.url,
      description: job.descriptionOverride === undefined ? job.description : "",
      descriptionQuality:
        job.descriptionOverride === undefined
          ? descriptionQuality(job)
          : "unknown",
      publishedAt: job.publishedAt,
      expiresAt: job.expiresAt,
      kind: job.kind,
      applicationUrl: job.applicationUrl,
    };
    const contentHash = hash(sourceContent(item));
    db.prepare(
      "UPDATE source_items SET document=?,content_hash=?,first_seen_at=?,changed_at=?,missing_at=? WHERE source_id=? AND source_item_id=?",
    ).run(
      JSON.stringify(item),
      contentHash,
      job.firstSeenAt,
      row.last_seen_at,
      job.availability === "closed" ? row.last_seen_at : null,
      row.source_id,
      row.source_item_id,
    );
    db.prepare(
      "INSERT OR IGNORE INTO source_item_versions VALUES (?,?,?,?,?)",
    ).run(
      row.source_id,
      row.source_item_id,
      contentHash,
      JSON.stringify(item),
      row.last_seen_at,
    );
  }
});
const assessment = setting<{ version: number; profileRevision: number } | null>(
  "matchingVersion",
  null,
);
if (
  assessment?.version !== MATCH_VERSION ||
  assessment?.profileRevision !== getProfile().revision
)
  refreshAllJobs();

// Longer waits are only for simultaneous API/worker startup migrations.
db.exec("PRAGMA busy_timeout=5000");
