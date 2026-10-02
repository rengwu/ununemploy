import { boardFor } from "./catalog.ts";
import {
  BoardUnavailableError,
  parseBoardListing,
  parseBoardDetail,
  jobUrl,
  itemId,
} from "./parsers.ts";
import {
  enqueueBoardJob,
  dueBoardJobs,
  finishBoardJob,
  failBoardJob,
  boardQueueStats,
} from "./queue.ts";
import {
  FetchError,
  RequestLimitError,
  readUrl,
  type FetchContext,
} from "../http.ts";
import type { IncomingJob, Source } from "../types.ts";
export class BoardPartialError extends Error {}
export async function collectPublicBoard(
  source: Source,
  ctx: FetchContext,
  emit: (job: IncomingJob) => void,
  checkpoint: (value: Record<string, unknown>) => void,
  read: typeof readUrl = readUrl,
) {
  const board = boardFor(source.identifier);
  if (board.setup) throw new BoardUnavailableError(board.setup);
  const index = Number(source.checkpoint.seedIndex || 0) % board.seeds.length;
  const seed = board.seeds[index];
  const pages = {
    ...((source.checkpoint.pages as Record<string, string>) || {}),
  };
  let nextIndex = index;
  const update = () =>
    checkpoint({
      ...source.checkpoint,
      seedIndex: nextIndex,
      pages,
      queue: boardQueueStats(source.id),
    });
  // One current page on every pass; one older page continues the saved backfill.
  // Detail requests use the remaining budget, including redirects and failed requests.
  const discover = async (url: string) => {
    const result = parseBoardListing(
      source.identifier,
      await read(url, ctx),
      url,
    );
    for (const job of result.jobs) {
      job.descriptionSource = {
        name: source.name,
        url: job.url,
        checkedAt: new Date().toISOString(),
      };
      const known = enqueueBoardJob(source.id, job);
      // Empty/image-only links stay in the queue until detail parsing supplies a title.
      if (known.title !== "Job opening") emit(known);
    }
    return result.next;
  };
  const headNext = await discover(seed);
  const backfill = pages[seed] || headNext;
  if (headNext && !pages[seed]) pages[seed] = headNext;
  nextIndex = (index + 1) % board.seeds.length;
  update();
  if (backfill && ctx.requests < Math.min(2, ctx.limit - 1)) {
    // Checkpoints are data, not arbitrary destinations. Restrict to the same public search route.
    const next = new URL(backfill),
      start = new URL(seed);
    if (
      next.origin === start.origin &&
      next.pathname === start.pathname &&
      next.href !== start.href
    ) {
      const remaining = await discover(next.href);
      if (remaining) pages[seed] = remaining;
      else delete pages[seed];
      update();
    } else {
      delete pages[seed];
      update();
    }
  }
  let failures = 0;
  for (const row of dueBoardJobs(source.id)) {
    if (ctx.requests >= ctx.limit) break;
    const candidate = JSON.parse(row.document) as IncomingJob;
    try {
      const job = parseBoardDetail(
        source.identifier,
        await read(candidate.url, ctx, {
          allowRedirect: (url) => {
            const target = jobUrl(source.identifier, url.href);
            return (
              target !== null &&
              itemId(source.identifier, target) === candidate.sourceItemId
            );
          },
        }),
        candidate,
      );
      job.descriptionSource = {
        name: source.name,
        url: candidate.url,
        checkedAt: new Date().toISOString(),
      };
      emit(job);
      finishBoardJob(source.id, job);
    } catch (error) {
      if (error instanceof RequestLimitError) break;
      const message =
        error instanceof Error
          ? error.message
          : "Description retrieval failed.";
      const closed =
        error instanceof FetchError && [404, 410].includes(error.status || 0);
      failBoardJob(source.id, candidate.url, message, 86400000, closed);
      if (closed) emit({ ...candidate, expiresAt: new Date().toISOString() });
      else failures++;
      if (
        error instanceof FetchError &&
        [401, 403, 429].includes(error.status || 0)
      ) {
        update();
        throw error;
      }
    }
    update();
  }
  update();
  if (failures)
    throw new BoardPartialError(
      `${failures} description page${failures === 1 ? "" : "s"} could not be read; listings were retained and retries are queued.`,
    );
}
