import { profileReadiness } from "./profile/facts.ts";
import { BoardUnavailableError } from "./boards/parsers.ts";
import { BoardPartialError } from "./boards/collector.ts";
import { randomUUID } from "node:crypto";
import { collect } from "./connectors.ts";
import { FetchError, RequestLimitError, type FetchContext } from "./http.ts";
import {
  getCounter,
  getProfile,
  db,
  getSettings,
  incrementCounter,
  ingestJob,
  lease,
  listSources,
  now,
  putRun,
  release,
  saveSource,
  closeMissingJobs,
} from "./db/index.ts";
import { sourcePolicy, isRetiredSource } from "./source-catalog.ts";
import { web3Token } from "./web3-auth.ts";
import type { ScanRun } from "./types.ts";

export async function scan(sourceId?: string, force = false) {
  const owner = randomUUID();
  if (!lease("scan", owner, 180000)) return { busy: true };
  const heartbeat = setInterval(() => lease("scan", owner, 180000), 30000);
  const results: ScanRun[] = [];
  try {
    if (!profileReadiness(getProfile()).ready) return { profileRequired: true };
    for (const source of listSources().filter(
      (s) =>
        s.enabled &&
        s.type !== "website" &&
        !isRetiredSource(s) &&
        (!sourceId || s.id === sourceId),
    )) {
      if (!profileReadiness(getProfile()).ready) break;
      if (
        !force &&
        db
          .prepare("SELECT id FROM profile_turns WHERE state='queued' LIMIT 1")
          .get()
      )
        break;
      if (source.type === "x" && !getSettings().xEnabled) continue;
      if (source.type === "web3") {
        if (!web3Token()) {
          if (source.state !== "needs_token")
            saveSource({
              ...source,
              state: "needs_token",
              nextRunAt: null,
              lastError: null,
            });
          continue;
        }
        // An authentication rejection waits for a replacement token, not repeated requests.
        if (source.state === "needs_token" && source.lastError) continue;
      }
      const timestamp = Date.now();
      const policy = sourcePolicy(source);
      if (source.retryAt && Date.parse(source.retryAt) > timestamp) continue;
      if (
        !force &&
        source.nextRunAt &&
        Date.parse(source.nextRunAt) > timestamp
      )
        continue;
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: getSettings().timezone,
      }).format(new Date());
      if (
        getCounter(`scans:${source.id}:${day}`) >= Math.min(6, policy.dailyCap)
      )
        continue;
      // Manual scans also honor provider cooldowns; force never overrides source limits.
      if (
        source.lastRunAt &&
        timestamp - Date.parse(source.lastRunAt) <
          (source.type === "himalayas" ||
          source.type === "workingnomads" ||
          (source.type === "rss" && policy.minimumHours === 24) ||
          source.type === "remotive" ||
          source.type === "jobicy" ||
          source.type === "web3" ||
          source.type === "public_board"
            ? policy.minimumHours * 3600000
            : 60000)
      )
        continue;
      incrementCounter(`scans:${source.id}:${day}`);
      const run: ScanRun = {
        id: randomUUID(),
        sourceId: source.id,
        sourceName: source.name,
        startedAt: now(),
        finishedAt: null,
        status: "running",
        requests: 0,
        added: 0,
        updated: 0,
        error: null,
      };
      const ctx: FetchContext = {
        requests: 0,
        limit: source.requestLimit,
        onRequest: () => {
          run.requests = ctx.requests;
          putRun(run);
        },
      };
      source.state = "running";
      source.lastRunAt = run.startedAt;
      source.lastError = null;
      saveSource(source);
      putRun(run);
      let retryMs = 0;
      source.retryAt = null;
      try {
        await collect(
          source,
          ctx,
          (item) => {
            const result = ingestJob(source, item);
            run.added += result.added;
            run.updated += result.updated;
          },
          (value) => {
            source.checkpoint = value;
            saveSource(source);
          },
        );
        run.status = "complete";
        if (["ashby", "greenhouse", "lever"].includes(source.type))
          closeMissingJobs(source.id, ctx.snapshotStartedAt || run.startedAt);
        source.state = "idle";
      } catch (error) {
        run.error =
          error instanceof Error ? error.message : "Collection failed.";
        run.status =
          error instanceof RequestLimitError ||
          error instanceof BoardPartialError
            ? "partial"
            : "failed";
        source.state = run.status;
        if (
          source.type === "web3" &&
          error instanceof FetchError &&
          [401, 403].includes(error.status || 0)
        )
          source.state = "needs_token";
        source.lastError = run.error;
        retryMs =
          error instanceof FetchError
            ? Math.max(error.retryAfterMs, 3600000)
            : error instanceof RequestLimitError
              ? 0
              : 3600000;
        if (source.type === "public_board") {
          if (
            error instanceof FetchError &&
            [401, 403, 429].includes(error.status || 0)
          ) {
            source.state = "blocked";
            retryMs = Math.max(retryMs, 86400000);
          } else if (error instanceof BoardUnavailableError) {
            source.state = "unavailable";
            retryMs = 86400000;
          } else if (
            error instanceof BoardPartialError &&
            error.discoveryUnavailable
          ) {
            retryMs = 86400000;
          }
        }
      }
      run.requests = ctx.requests;
      run.finishedAt = now();
      putRun(run);
      source.retryAt = retryMs
        ? new Date(Date.now() + retryMs).toISOString()
        : null;
      source.jobCount += run.added;
      source.nextRunAt = new Date(
        Math.max(
          Date.now() +
            Math.max(
              retryMs,
              Math.max(getSettings().scanIntervalHours, policy.intervalHours) *
                3600000,
            ),
          ctx.resumeAt ? Date.parse(ctx.resumeAt) : 0,
        ),
      ).toISOString();
      saveSource(source);
      results.push(run);
    }
  } finally {
    clearInterval(heartbeat);
    release("scan", owner);
  }
  return { busy: false, runs: results };
}
