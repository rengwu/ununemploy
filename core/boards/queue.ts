import { db, now, transaction } from "../db/index.ts";
import type { IncomingJob } from "../types.ts";
import { transitionQueue, type QueueState } from "./queue-state.ts";
export type QueueRow = {
  url: string;
  document: string;
  state: QueueState["state"];
  checked_at: string | null;
  retry_at: string | null;
  error: string | null;
};
const read = (sourceId: string, url: string) =>
  db
    .prepare("SELECT * FROM board_queue WHERE source_id=? AND url=?")
    .get(sourceId, url) as QueueRow | undefined;
const state = (row: QueueRow): QueueState => ({
  job: JSON.parse(row.document),
  state: row.state,
  checkedAt: row.checked_at,
  retryAt: row.retry_at,
  error: row.error,
});
function write(sourceId: string, url: string, value: QueueState) {
  db.prepare(
    "UPDATE board_queue SET document=?,state=?,checked_at=?,retry_at=?,error=? WHERE source_id=? AND url=?",
  ).run(
    JSON.stringify(value.job),
    value.state,
    value.checkedAt,
    value.retryAt,
    value.error,
    sourceId,
    url,
  );
  return value.job;
}
export function enqueueBoardJob(sourceId: string, job: IncomingJob) {
  return transaction(() => {
    const at = now();
    db.prepare(
      "INSERT INTO board_queue(source_id,url,document,discovered_at,seen_at) VALUES(?,?,?,?,?) ON CONFLICT(source_id,url) DO UPDATE SET seen_at=excluded.seen_at",
    ).run(sourceId, job.url, JSON.stringify(job), at, at);
    return write(
      sourceId,
      job.url,
      transitionQueue(
        state(read(sourceId, job.url)!),
        { type: "discovered", job },
        at,
      ),
    );
  });
}
export function dueBoardJobs(sourceId: string): QueueRow[] {
  const at = now(),
    old = new Date(Date.parse(at) - 7 * 86400000).toISOString(),
    recent = new Date(Date.parse(at) - 14 * 86400000).toISOString();
  // Fetch the reserved recheck separately so a long pending backlog cannot hide it.
  const overdue = db
    .prepare(
      `SELECT * FROM board_queue WHERE source_id=? AND state='full'
    AND (retry_at IS NULL OR retry_at<=?) AND checked_at<? AND seen_at>?
    ORDER BY checked_at,url LIMIT 1`,
    )
    .get(sourceId, at, old, recent) as QueueRow | undefined;
  const remaining = db
    .prepare(
      `SELECT * FROM board_queue WHERE source_id=? AND url!=?
    AND (retry_at IS NULL OR retry_at<=?) AND (state!='closed' OR seen_at>checked_at)
    AND (state!='full' OR (checked_at<? AND seen_at>?))
    ORDER BY CASE WHEN state='full' THEN 1 ELSE 0 END,COALESCE(checked_at,discovered_at),url LIMIT ?`,
    )
    .all(
      sourceId,
      overdue?.url || "",
      at,
      old,
      recent,
      overdue ? 99 : 100,
    ) as QueueRow[];
  return overdue ? [overdue, ...remaining] : remaining;
}
export function finishBoardJob(sourceId: string, job: IncomingJob) {
  const row = read(sourceId, job.url);
  if (row)
    return write(
      sourceId,
      job.url,
      transitionQueue(state(row), { type: "retrieved", job }, now()),
    );
}
export function failBoardJob(
  sourceId: string,
  url: string,
  error: string,
  delay = 86400000,
  closed = false,
) {
  const row = read(sourceId, url),
    at = now();
  if (row)
    return write(
      sourceId,
      url,
      transitionQueue(
        state(row),
        {
          type: "failed",
          message: error,
          retryAt: new Date(Date.parse(at) + delay).toISOString(),
          closed,
        },
        at,
      ),
    );
}
export function boardQueueStats(sourceId: string) {
  return Object.fromEntries(
    db
      .prepare(
        "SELECT state,count(*) AS count FROM board_queue WHERE source_id=? GROUP BY state",
      )
      .all(sourceId)
      .map((r) => [String(r.state), Number(r.count)]),
  );
}
