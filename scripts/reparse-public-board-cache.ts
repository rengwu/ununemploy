// Reprocess previously fetched HTML after a parser update. Makes no network requests.
import { randomUUID } from "node:crypto";
import {
  db,
  listSources,
  ingestJob,
  saveSource,
  putRun,
  now,
} from "../core/db/index.ts";
import { parseBoardDetail } from "../core/boards/parsers.ts";
import { finishBoardJob, boardQueueStats } from "../core/boards/queue.ts";
import type { IncomingJob, ScanRun } from "../core/types.ts";
const report = [];
for (const source of listSources().filter(
  (s) =>
    s.type === "public_board" &&
    (!process.argv[2] || s.identifier === process.argv[2]),
)) {
  if (source.state === "running") continue;
  const run: ScanRun = {
    id: randomUUID(),
    sourceId: source.id,
    sourceName: source.name,
    startedAt: now(),
    finishedAt: null,
    status: "complete",
    requests: 0,
    added: 0,
    updated: 0,
    error: null,
  };
  let parsed = 0,
    unresolved = 0;
  const rows = db
    .prepare(
      `SELECT q.document,c.body,c.checked_at FROM board_queue q JOIN http_cache c ON c.url=q.url WHERE q.source_id=? AND q.state!='closed'`,
    )
    .all(source.id);
  for (const row of rows) {
    try {
      const job = parseBoardDetail(
        source.identifier,
        String(row.body),
        JSON.parse(row.document as string) as IncomingJob,
      );
      job.descriptionSource = {
        name: source.name,
        url: job.url,
        checkedAt: String(row.checked_at),
      };
      const result = ingestJob(source, job);
      run.added += result.added;
      run.updated += result.updated;
      finishBoardJob(source.id, job);
      parsed++;
    } catch {
      unresolved++;
    }
  }
  if (!parsed) continue;
  const queue = boardQueueStats(source.id);
  saveSource({
    ...source,
    jobCount: source.jobCount + run.added,
    checkpoint: { ...source.checkpoint, queue },
    ...(source.state === "partial" && !unresolved && !queue.pending
      ? { state: "idle", lastError: null, retryAt: null }
      : {}),
  });
  run.finishedAt = now();
  putRun(run);
  report.push({ source: source.name, parsed, unresolved, requests: 0 });
}
console.log(JSON.stringify(report));
db.close();
