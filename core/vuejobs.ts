import { randomUUID } from "node:crypto";
import type { Job, Task } from "./types.ts";
import { htmlText } from "./source-text.ts";
import { FetchError, readUrl } from "./http.ts";
import * as store from "./db/index.ts";

export function vueJobsPage(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "vuejobs.com" ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/jobs\/[a-z0-9-]+\/?$/.test(url.pathname)
    )
      return null;
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}
const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
export function parseVueJobsDescription(
  html: string,
  job: Pick<Job, "url" | "title" | "company">,
): string {
  const expected = vueJobsPage(job.url);
  const visible = normalized(htmlText(html));
  const entries: any[] = [];
  const visit = (value: any) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      entries.push(value);
      if (value["@graph"]) visit(value["@graph"]);
    }
  };
  for (const script of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
  )) {
    if (!/\btype\s*=\s*["']application\/ld\+json["']/i.test(script[1]))
      continue;
    try {
      visit(JSON.parse(script[2]));
    } catch {
      /* Ignore unrelated malformed structured data. */
    }
  }
  const posting = entries.find(
    (entry) =>
      [entry["@type"]].flat().includes("JobPosting") &&
      expected &&
      vueJobsPage(entry.url || entry["@id"] || "") === expected &&
      normalized(entry.title || "").toLowerCase() ===
        normalized(job.title).toLowerCase() &&
      normalized(entry.hiringOrganization?.name || "").toLowerCase() ===
        normalized(job.company).toLowerCase(),
  );
  const description =
    typeof posting?.description === "string"
      ? htmlText(posting.description)
      : "";
  // Only accept the matching posting's complete text when it is also rendered publicly.
  // Never use script-only data to work around a gated/hidden description.
  if (
    !description ||
    description.length < 300 ||
    description.length > 100000 ||
    posting.isAccessibleForFree === false ||
    /(?:\.\.\.|…|read more|continue reading)\s*$/i.test(description) ||
    !visible.includes(normalized(description))
  )
    throw new Error(
      "A complete public description was not available on this VueJobs page. Open the posting or add the description manually.",
    );
  return description;
}
function observation(jobId: string) {
  return store.jobObservations(jobId).find((o) => {
    const source = store.getSource(o.sourceId);
    return (
      source?.type === "rss" &&
      source.identifier === "https://app.vuejobs.com/feed/posts" &&
      vueJobsPage(o.item.url)
    );
  });
}
export function canLoadVueJobsDescription(job: Job): boolean {
  return (
    job.descriptionOverride === undefined &&
    store.needsJobDetails(job) &&
    !!observation(job.id)
  );
}
type Attempt = { retryAt: number; error: string };
export async function loadVueJobsDescription(
  jobId: string,
  read: typeof readUrl = readUrl,
): Promise<Job> {
  const job = store.getJob(jobId);
  if (!job) throw new Error("Job not found.");
  if (job.descriptionOverride !== undefined || !store.needsJobDetails(job))
    return job;
  const item = observation(jobId);
  if (!item)
    throw new Error(
      "Full-description retrieval is not supported for this source.",
    );
  const url = vueJobsPage(item.item.url)!;
  const owner = randomUUID();
  if (!store.lease("vuejobs-details", owner, 45000))
    throw new Error(
      "A VueJobs description is already loading. Try again shortly.",
    );
  const key = `vuejobs-detail:${store.hash(url)}`;
  try {
    const attempt = store.setting<Attempt | null>(key, null);
    if (attempt && attempt.retryAt > Date.now()) throw new Error(attempt.error);
    const hostRetry = store.setting<number>("vuejobsDetailRetryAt", 0);
    if (hostRetry > Date.now())
      throw new Error(
        "VueJobs asked us to wait before requesting another description. Try again later.",
      );
    const dayKey = `vuejobs-details:${store.now().slice(0, 10)}`;
    if (store.getCounter(dayKey) >= 6)
      throw new Error(
        "The six-per-day VueJobs description limit has been reached. Try tomorrow or add the description manually.",
      );
    // Reserve before the request, including failed requests. One GET, no redirect crawl.
    store.incrementCounter(dayKey);
    const retryAt = Date.now() + 6 * 3600000;
    store.putSetting(key, {
      retryAt,
      error:
        "This VueJobs description was requested recently. Try later or add it manually.",
    });
    try {
      const html = await read(url, { requests: 0, limit: 1 });
      const description = parseVueJobsDescription(html, { ...job, url });
      // Re-read after the network request so a concurrent manual edit always wins.
      const current = store.getJob(jobId)!;
      if (current.descriptionOverride !== undefined) return current;
      const source = store.getSource(item.sourceId)!;
      const refreshed = store.ingestJob(source, {
        ...item.item,
        description,
        descriptionQuality: "full",
        kind: "opening",
        descriptionSource: {
          name: "VueJobs job page",
          url,
          checkedAt: store.now(),
        },
      }).job;
      store.putSetting(key, {
        retryAt,
        error: "The full description is already stored.",
      });
      return refreshed;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to retrieve the VueJobs description.";
      const delay = error instanceof FetchError ? error.retryAfterMs : 0;
      if (
        error instanceof FetchError &&
        [403, 429, 503].includes(error.status || 0)
      )
        store.putSetting(
          "vuejobsDetailRetryAt",
          Date.now() + Math.max(delay, 3600000),
        );
      store.putSetting(key, {
        retryAt: Math.max(retryAt, Date.now() + delay),
        error: `${message} The excerpt is preserved; retry later or add the description manually.`,
      });
      throw new Error(message);
    }
  } finally {
    store.release("vuejobs-details", owner);
  }
}
export async function queueCoverLetterWithDetails(
  jobId: string,
  regenerate = false,
): Promise<Task> {
  let job = store.getJob(jobId);
  if (!job) throw new Error("Job not found.");
  // Preserve the save immediately, even if the network request fails or the process restarts.
  job = store.writeJob({
    ...job,
    status: regenerate && job.status === "applied" ? "applied" : "saved",
    savedAt: job.savedAt || store.now(),
  });
  let error: string | null = null;
  if (canLoadVueJobsDescription(job)) {
    try {
      await loadVueJobsDescription(jobId);
    } catch (e) {
      error = e instanceof Error ? e.message : "Description retrieval failed.";
    }
  }
  const task = store.queueCoverLetter(jobId, regenerate);
  if (task.state === "needs_details") {
    const current = store.getJob(jobId)!;
    if (!store.needsJobDetails(current)) {
      task.input.job = current;
      task.state = "queued";
      task.error = null;
    } else if (error) task.error = error;
    task.updatedAt = store.now();
    store.saveTask(task);
  }
  return task;
}
