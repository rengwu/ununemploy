import type { IncomingJob } from "../types.ts";
import { descriptionQuality, preserveDescription } from "../job-quality.ts";

export type QueueState = {
  job: IncomingJob;
  state: "pending" | "full" | "excerpt" | "closed";
  checkedAt: string | null;
  retryAt: string | null;
  error: string | null;
};
type QueueEvent =
  | { type: "discovered" | "retrieved"; job: IncomingJob }
  | { type: "failed"; message: string; retryAt: string; closed: boolean };

export function transitionQueue(
  previous: Readonly<QueueState>,
  event: QueueEvent,
  at: string,
): QueueState {
  if (event.type === "failed")
    return {
      ...previous,
      job: event.closed ? { ...previous.job, removedAt: at } : previous.job,
      state: event.closed ? "closed" : previous.state,
      checkedAt: at,
      retryAt: event.retryAt,
      error: event.message.slice(0, 500),
    };
  const old =
    previous.state === "closed"
      ? {
          ...previous.job,
          removedAt: previous.job.removedAt || previous.checkedAt,
        }
      : previous.job;
  const full = descriptionQuality(event.job) === "full";
  // Cards update seen_at in the shell. Full observations can revalidate a job.
  const retrieved = event.type === "retrieved" || full;
  return {
    job: preserveDescription(old, event.job),
    state: retrieved ? (full ? "full" : "excerpt") : previous.state,
    checkedAt: retrieved ? at : previous.checkedAt,
    retryAt: retrieved
      ? full
        ? null
        : new Date(Date.parse(at) + 7 * 86400000).toISOString()
      : previous.retryAt,
    error: retrieved
      ? full
        ? null
        : "The source description is an excerpt."
      : previous.error,
  };
}
