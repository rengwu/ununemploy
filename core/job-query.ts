import { isTimezoneRange } from "./timezone-range.ts";
import { countryTimezoneOffsets, matchesTimezoneRange } from "./timezones.ts";
import { z } from "zod";
import * as store from "./db/index.ts";
import { matchesLocations } from "./locations.ts";
import { buildRegionLocationIndex } from "./location-index.ts";
import { visibleListings } from "./listing-visibility.ts";
import type { Job } from "./types.ts";
import type { JobPage, JobSummary } from "./api-types.ts";

export const jobQuerySchema = z
  .object({
    query: z.string().max(300).default(""),
    view: z.enum(["jobs", "saved"]).default("jobs"),
    category: z
      .enum(["all", "strong", "adjacent", "stretch", "other"])
      .default("all"),
    arrangement: z.enum(["all", "remote", "hybrid", "onsite"]).default("all"),
    review: z
      .enum(["all", "new", "saved", "applied", "dismissed"])
      .default("all"),
    seen: z.enum(["all", "seen", "unseen"]).default("all"),
    availability: z.enum(["current", "stale", "all"]).default("current"),
    eligibility: z
      .enum(["possible", "all", "review", "incompatible"])
      .default("possible"),
    duplicates: z.enum(["grouped", "all"]).default("grouped"),
    sort: z.enum(["match", "newest"]).default("match"),
    locations: z
      .string()
      .max(5000)
      .default("[]")
      .transform((value, ctx) => {
        try {
          return z.array(z.string().max(200)).max(50).parse(JSON.parse(value));
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid locations." });
          return z.NEVER;
        }
      }),
    timezoneOffset: z.coerce
      .number()
      .int()
      .min(-720)
      .max(720)
      .multipleOf(15)
      .default(0),
    timezone: z
      .string()
      .max(40)
      .default("null")
      .transform((value, ctx) => {
        try {
          const parsed: unknown = JSON.parse(value);
          if (parsed === null || isTimezoneRange(parsed)) return parsed;
        } catch {}
        ctx.addIssue({ code: "custom", message: "Invalid timezone range." });
        return z.NEVER;
      }),
    minScore: z.coerce.number().min(0).max(100).default(0),
    page: z.coerce.number().int().min(0).max(1000000).default(0),
    pageSize: z.coerce.number().int().min(1).max(100).default(75),
  })
  .strict();
export type JobQuery = z.infer<typeof jobQuerySchema>;

export function jobsRevision(at = Date.now()): string {
  const { version } = store.db
    .prepare("SELECT version FROM data_revisions WHERE name='jobs'")
    .get() as { version: number };
  // Freshness can change without a write; expire the snapshot once per minute.
  return `${version}:${Math.floor(at / 60000)}`;
}
function makeSnapshot(revision: string) {
  const jobs = store.listJobs();
  return {
    revision,
    jobs,
    byId: new Map(jobs.map((job) => [job.id, job])),
    search: new Map(
      jobs.map((job) => [
        job.id,
        `${job.company} ${job.title} ${job.location} ${job.description}`.toLowerCase(),
      ]),
    ),
    locations: buildRegionLocationIndex(jobs),
    timezoneOffsets: countryTimezoneOffsets(),
  };
}
let cached: ReturnType<typeof makeSnapshot> | undefined;
export function jobSnapshot(minimumRevision?: string) {
  const current = jobsRevision();
  // One UI refresh requests locations, results and details from the revision
  // announced by bootstrap. A scanner write between those requests must not
  // force three full rebuilds. The next bootstrap revision still refreshes data,
  // and the minute boundary always refreshes time-based listing quality.
  const requested =
    minimumRevision && /^\d{1,15}:\d{1,12}$/.test(minimumRevision)
      ? minimumRevision
      : current;
  const [version, minute] = requested.split(":").map(Number);
  const [cachedVersion, cachedMinute] = (cached?.revision || "-1:-1")
    .split(":")
    .map(Number);
  if (
    !cached ||
    cachedVersion < version ||
    cachedMinute < minute ||
    cachedMinute !== Number(current.split(":")[1])
  ) {
    // All joins and the revision come from the same SQLite snapshot while the worker scans.
    store.db.exec("BEGIN");
    try {
      cached = makeSnapshot(jobsRevision());
      store.db.exec("COMMIT");
    } catch (error) {
      store.db.exec("ROLLBACK");
      throw error;
    }
  }
  return cached;
}
export function summarizeJob(job: Job): JobSummary {
  const {
    id,
    title,
    company,
    location,
    arrangement,
    url,
    category,
    score,
    status,
    kind,
    firstSeenAt,
    seenAt,
    publishedAt,
    eligibility,
    freshness,
    cvId,
    cvState,
    coverLetterId,
    coverLetterState,
  } = job;
  return {
    id,
    title,
    company,
    location,
    arrangement,
    url,
    category,
    score,
    status,
    kind,
    firstSeenAt,
    seenAt,
    publishedAt,
    eligibility,
    freshness,
    cvId,
    cvState,
    coverLetterId,
    coverLetterState,
    listingCount: (job.relatedListings?.length || 0) + 1,
  };
}
export function queryJobs(
  query: JobQuery,
  terms: string[] = [],
  minimumRevision?: string,
): JobPage {
  const snapshot = jobSnapshot(minimumRevision),
    saved = query.view === "saved";
  const needle = query.query.toLowerCase();
  const filtered = visibleListings(
    snapshot.jobs
      .filter(
        (job) =>
          (saved
            ? ["saved", "applied"].includes(job.status)
            : query.review === "dismissed"
              ? job.status === "dismissed"
              : job.status !== "dismissed") &&
          (saved ||
            query.availability === "all" ||
            (query.availability === "stale"
              ? job.freshness === "stale"
              : job.availability !== "closed" && job.freshness !== "stale")) &&
          (saved ||
            query.eligibility === "all" ||
            (query.eligibility === "possible"
              ? job.eligibility !== "incompatible"
              : job.eligibility === query.eligibility)) &&
          (query.review === "all" || job.status === query.review) &&
          (query.seen === "all" ||
            (query.seen === "seen" ? !!job.seenAt : !job.seenAt)) &&
          (query.category === "all" || job.category === query.category) &&
          job.score >= query.minScore &&
          matchesLocations(
            snapshot.locations.byJob.get(job.id),
            query.locations,
          ) &&
          matchesTimezoneRange(
            snapshot.locations.byJob.get(job.id),
            query.timezone,
            snapshot.timezoneOffsets,
            query.timezoneOffset,
          ) &&
          (query.arrangement === "all" ||
            job.arrangement.toLowerCase().includes(query.arrangement)) &&
          snapshot.search.get(job.id)!.includes(needle) &&
          terms.every((term) =>
            snapshot.search.get(job.id)!.includes(term.toLowerCase()),
          ),
      )
      .sort(
        (a, b) =>
          (query.sort === "match" ? b.score - a.score : 0) ||
          b.firstSeenAt.localeCompare(a.firstSeenAt) ||
          a.id.localeCompare(b.id),
      ),
    saved || query.duplicates === "all",
  );
  const totalPages = Math.ceil(filtered.length / query.pageSize);
  const page = Math.min(query.page, Math.max(0, totalPages - 1));
  return {
    items: filtered
      .slice(page * query.pageSize, (page + 1) * query.pageSize)
      .map(summarizeJob),
    total: filtered.length,
    page,
    pageSize: query.pageSize,
    totalPages,
    revision: snapshot.revision,
  };
}
