import { db, now } from "../db/index.ts";
import type { IncomingJob } from "../types.ts";
export type QueueRow = {
  url: string;
  document: string;
  state: string;
  checked_at: string | null;
};
export function enqueueBoardJob(sourceId: string, job: IncomingJob) {
  const timestamp = now();
  db.prepare(
    `INSERT INTO board_queue(source_id,url,document,state,discovered_at,seen_at,checked_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(source_id,url) DO UPDATE SET
    seen_at=excluded.seen_at,
    document=CASE WHEN excluded.state='full' OR board_queue.state!='full' THEN excluded.document ELSE board_queue.document END,
    state=CASE WHEN excluded.state='full' THEN 'full' ELSE board_queue.state END,
    checked_at=CASE WHEN excluded.state='full' THEN excluded.checked_at ELSE board_queue.checked_at END`,
  ).run(
    sourceId,
    job.url,
    JSON.stringify(job),
    job.descriptionQuality === "full" ? "full" : "pending",
    timestamp,
    timestamp,
    job.descriptionQuality === "full" ? timestamp : null,
  );
  return JSON.parse(
    (
      db
        .prepare("SELECT document FROM board_queue WHERE source_id=? AND url=?")
        .get(sourceId, job.url) as { document: string }
    ).document,
  ) as IncomingJob;
}
export function dueBoardJobs(sourceId: string): QueueRow[] {
  return db
    .prepare(
      `SELECT url,document,state,checked_at FROM board_queue WHERE source_id=?
    AND (retry_at IS NULL OR retry_at<=?) AND state!='closed'
    AND (state!='full' OR (checked_at<? AND seen_at>?))
    ORDER BY CASE WHEN state='full' THEN 1 ELSE 0 END, COALESCE(checked_at,discovered_at),url LIMIT 100`,
    )
    .all(
      sourceId,
      now(),
      new Date(Date.now() - 7 * 86400000).toISOString(),
      new Date(Date.now() - 14 * 86400000).toISOString(),
    ) as QueueRow[];
}
export function finishBoardJob(sourceId: string, job: IncomingJob) {
  db.prepare(
    "UPDATE board_queue SET document=?,state=?,checked_at=?,retry_at=NULL,error=NULL WHERE source_id=? AND url=?",
  ).run(
    JSON.stringify(job),
    job.descriptionQuality === "full" ? "full" : "excerpt",
    now(),
    sourceId,
    job.url,
  );
  if (job.descriptionQuality !== "full")
    failBoardJob(
      sourceId,
      job.url,
      "The source description is an excerpt.",
      7 * 86400000,
    );
}
export function failBoardJob(
  sourceId: string,
  url: string,
  error: string,
  delay = 86400000,
  closed = false,
) {
  db.prepare(
    "UPDATE board_queue SET state=CASE WHEN ? THEN 'closed' ELSE state END,checked_at=?,retry_at=?,error=? WHERE source_id=? AND url=?",
  ).run(
    Number(closed),
    now(),
    new Date(Date.now() + delay).toISOString(),
    error.slice(0, 500),
    sourceId,
    url,
  );
}
export function boardQueueStats(sourceId: string) {
  const rows = db
    .prepare(
      "SELECT state,count(*) AS count FROM board_queue WHERE source_id=? GROUP BY state",
    )
    .all(sourceId);
  return Object.fromEntries(
    rows.map((r) => [String(r.state), Number(r.count)]),
  );
}
