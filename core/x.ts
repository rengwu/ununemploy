import { xToken } from "./x-auth.ts";
import {
  getCounter,
  getSettings,
  incrementCounter,
  listSources,
  transaction,
} from "./db/index.ts";
import {
  readUrl,
  RequestLimitError,
  FetchError,
  type FetchContext,
} from "./http.ts";
import type { IncomingJob, Source } from "./types.ts";

export function xBudgetKey(date = new Date()) {
  return `x-posts:${date.toISOString().slice(0, 7)}`;
}
// Divide remaining reads across the remaining month and enabled searches. The
// API requires at least ten results per request, so small budgets need longer
// intervals. Unused quota is recalculated on the next scan, never pre-spent.
export function xScanBudget(
  limit: number,
  used: number,
  intervalHours: number,
  sourceCount: number,
  date = new Date(),
) {
  const monthEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  const timeLeft = monthEnd - date.getTime();
  const remaining = Math.max(0, limit - used);
  if (remaining < 10)
    return { posts: 0, resumeAt: new Date(monthEnd).toISOString() };
  const interval = intervalHours * 3600000;
  const sources = Math.max(1, sourceCount);
  const scansLeft = Math.max(1, timeLeft / interval) * sources;
  const posts = Math.min(
    remaining,
    Math.max(10, Math.floor(remaining / scansLeft)),
  );
  const delay = Math.max(interval, (posts * sources * timeLeft) / remaining);
  return {
    posts,
    resumeAt: new Date(
      Math.min(monthEnd, date.getTime() + delay),
    ).toISOString(),
  };
}
export function reserveXPosts(max: number, key = xBudgetKey()): number {
  return transaction(() => {
    const available = getSettings().xMonthlyPostLimit - getCounter(key);
    const count = Math.min(max, available);
    if (count < 10)
      throw new Error(
        "X monthly post limit reached. Increase the limit or wait until next month.",
      );
    incrementCounter(key, count);
    return count;
  });
}
export async function collectX(
  source: Source,
  ctx: FetchContext,
  emit: (job: IncomingJob) => void,
  checkpoint: (value: Record<string, unknown>) => void,
) {
  const settings = getSettings();
  if (!settings.xEnabled || !xToken() || settings.xMonthlyPostLimit < 10)
    throw new Error(
      "Add an X bearer token, set a monthly post limit of at least 10, and enable X in Settings.",
    );
  const budget = xScanBudget(
    settings.xMonthlyPostLimit,
    getCounter(xBudgetKey()),
    settings.scanIntervalHours,
    listSources().filter((s) => s.type === "x" && s.enabled).length,
  );
  ctx.resumeAt = budget.resumeAt;
  if (!budget.posts)
    throw new RequestLimitError(
      "X monthly post limit reached. Collection will resume next month.",
    );
  let scanPosts = 0;
  const state = { ...source.checkpoint } as Record<string, any>;
  // Fixed windows keep pagination stable. A checkpoint advances only after every page succeeds.
  const oldest = Date.now() - 7 * 86400000 + 60000;
  if (state.windowStart && Date.parse(state.windowStart) < oldest) {
    delete state.nextToken;
    delete state.windowEnd;
    delete state.windowStart;
    delete state.newestId;
  }
  state.windowEnd ||= new Date(Date.now() - 15000).toISOString();
  state.windowStart ||= new Date(
    Math.max(
      oldest,
      state.completedAt ? Date.parse(state.completedAt) : Date.now() - 86400000,
    ),
  ).toISOString();
  checkpoint(state);
  while (true) {
    if (ctx.requests >= ctx.limit)
      throw new RequestLimitError(
        "Request limit reached; X collection will resume on the next scan.",
      );
    if (budget.posts - scanPosts < 10)
      throw new RequestLimitError(
        "X scan post limit reached. Collection will resume on the next scan.",
      );
    const key = xBudgetKey();
    const count = reserveXPosts(Math.min(100, budget.posts - scanPosts), key);
    const url = new URL("https://api.x.com/2/tweets/search/recent");
    url.searchParams.set("query", source.identifier);
    url.searchParams.set("max_results", String(count));
    url.searchParams.set("tweet.fields", "created_at,author_id");
    url.searchParams.set("start_time", state.windowStart);
    url.searchParams.set("end_time", state.windowEnd);
    if (state.nextToken) url.searchParams.set("next_token", state.nextToken);
    // Failed/ambiguous requests retain their reservation so retries cannot exceed the cap.
    let result;
    try {
      result = JSON.parse(
        await readUrl(url.href, ctx, {
          cache: false,
          headers: { Authorization: `Bearer ${xToken()}` },
        }),
      );
    } catch (error) {
      if (error instanceof FetchError) {
        const messages: Record<number, string> = {
          401: "X rejected the bearer token. Replace it in Settings.",
          402: "X API credits are unavailable. Check billing in the X developer console.",
          403: "X search is unavailable to this app. Check API access in the X developer console.",
          429: "X rate limit reached. Collection will resume after the cooldown.",
        };
        if (error.status && messages[error.status])
          throw new FetchError(
            messages[error.status],
            error.retryAfterMs,
            error.status,
          );
      }
      throw error;
    }
    if (result.errors?.length || (!result.meta && !Array.isArray(result.data)))
      throw new Error(
        "X search returned an error. Check the query and API access in the X developer console.",
      );
    const posts = result.data || [];
    incrementCounter(key, -Math.max(0, count - posts.length));
    scanPosts += posts.length;
    for (const post of posts) {
      if (!/^\d+$/.test(post.id) || typeof post.text !== "string") continue;
      emit({
        sourceItemId: post.id,
        title:
          post.text
            .split("\n")
            .find((line: string) => line.trim())
            ?.slice(0, 160) || "Hiring post",
        company: source.name,
        location: "",
        arrangement: /remote/i.test(post.text) ? "Remote" : "Unspecified",
        employmentType: "Unspecified",
        salary: "",
        url: `https://x.com/i/web/status/${post.id}`,
        description: post.text,
        publishedAt: post.created_at || null,
        kind: "lead",
      });
      if (!state.newestId || BigInt(post.id) > BigInt(state.newestId))
        state.newestId = post.id;
    }
    state.nextToken = result.meta?.next_token || null;
    checkpoint(state);
    if (!state.nextToken) {
      checkpoint({
        completedAt: state.windowEnd,
        sinceId: state.newestId || state.sinceId || null,
      });
      return;
    }
  }
}
