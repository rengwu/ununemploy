import type { IncomingJob, Source } from "./types.ts";
import { readJson, readUrl, type FetchContext } from "./http.ts";
import { collectX } from "./x.ts";
import { collectPublicBoard } from "./boards/collector.ts";
import { collectWeb3 } from "./web3.ts";
import { htmlText, sourceDate as dateOrNull } from "./source-text.ts";
import { collectDiscovery, normalizeRss } from "./discovery.ts";
export { htmlText } from "./source-text.ts";

type AnyRecord = Record<string, any>;
const asArray = <T>(value: T | T[] | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];
const defaults = {
  arrangement: "Unspecified",
  employmentType: "Unspecified",
  salary: "",
  publishedAt: null,
  kind: "opening" as const,
  descriptionQuality: "full" as const,
};
export function normalizeAshby(data: AnyRecord, source: Source): IncomingJob[] {
  if (!Array.isArray(data.jobs))
    throw new Error("Unexpected Ashby response: missing jobs array.");
  return data.jobs
    .filter((j: AnyRecord) => j.isListed !== false)
    .map((j: AnyRecord) => ({
      ...defaults,
      sourceItemId: j.id || new URL(j.jobUrl).pathname.split("/").at(-1),
      title: j.title,
      company: source.name,
      location: [
        j.location,
        ...(j.secondaryLocations || []).map((l: AnyRecord) => l.location),
      ]
        .filter(Boolean)
        .join(" · "),
      arrangement: j.workplaceType || (j.isRemote ? "Remote" : "Unspecified"),
      employmentType: j.employmentType || "Unspecified",
      salary:
        j.compensation?.scrapeableCompensationSalarySummary ||
        j.compensation?.compensationTierSummary ||
        "",
      url: j.jobUrl,
      applicationUrl: j.applyUrl,
      description: j.descriptionPlain || htmlText(j.descriptionHtml || ""),
      publishedAt: dateOrNull(j.publishedAt),
    }));
}
export function normalizeGreenhouse(
  data: AnyRecord,
  source: Source,
): IncomingJob[] {
  if (!Array.isArray(data.jobs))
    throw new Error("Unexpected Greenhouse response: missing jobs array.");
  return data.jobs.map((j: AnyRecord) => ({
    ...defaults,
    sourceItemId: String(j.id),
    title: j.title,
    company: source.name,
    location: j.location?.name || "",
    arrangement: /remote/i.test(j.location?.name || "")
      ? "Remote"
      : "Unspecified",
    url: j.absolute_url,
    description: htmlText(j.content || ""),
    publishedAt: dateOrNull(j.first_published),
  }));
}
export async function collect(
  source: Source,
  ctx: FetchContext,
  emit: (job: IncomingJob) => void,
  checkpoint: (value: Record<string, unknown>) => void,
): Promise<void> {
  const identifier = encodeURIComponent(source.identifier);
  if (source.type === "ashby") {
    const data = await readJson<AnyRecord>(
      `https://api.ashbyhq.com/posting-api/job-board/${identifier}?includeCompensation=true`,
      ctx,
    );
    for (const job of normalizeAshby(data, source)) emit(job);
    return;
  }
  if (source.type === "greenhouse") {
    const data = await readJson<AnyRecord>(
      `https://boards-api.greenhouse.io/v1/boards/${identifier}/jobs?content=true`,
      ctx,
    );
    for (const job of normalizeGreenhouse(data, source)) emit(job);
    return;
  }
  if (source.type === "lever") {
    const pageSize = 100;
    let skip = Number(source.checkpoint.skip || 0);
    const cycleStartedAt = String(
      source.checkpoint.cycleStartedAt || new Date().toISOString(),
    );
    ctx.snapshotStartedAt = cycleStartedAt;
    checkpoint({ skip, cycleStartedAt });
    while (true) {
      const jobs = await readJson<AnyRecord[]>(
        `https://api.lever.co/v0/postings/${identifier}?mode=json&limit=${pageSize}&skip=${skip}`,
        ctx,
      );
      if (!Array.isArray(jobs)) throw new Error("Unexpected Lever response.");
      for (const j of jobs)
        emit({
          ...defaults,
          sourceItemId: j.id,
          title: j.text,
          company: source.name,
          location: j.categories?.location || "",
          arrangement: j.workplaceType || "Unspecified",
          employmentType: j.categories?.commitment || "Unspecified",
          salary: j.salaryRange
            ? `${j.salaryRange.currency} ${j.salaryRange.min}–${j.salaryRange.max} / ${j.salaryRange.interval}`
            : "",
          url: j.hostedUrl,
          applicationUrl: j.applyUrl,
          description: [
            htmlText(j.description || ""),
            ...(j.lists || []).map(
              (l: AnyRecord) => `${l.text}\n${htmlText(l.content || "")}`,
            ),
            htmlText(j.additional || ""),
          ].join("\n\n"),
        });
      if (jobs.length < pageSize) {
        checkpoint({});
        break;
      }
      skip += jobs.length;
      checkpoint({ skip, cycleStartedAt });
    }
    return;
  }
  if (source.type === "hn") {
    const api = "https://hacker-news.firebaseio.com/v0";
    let threads = asArray(source.checkpoint.threads as AnyRecord[] | undefined);
    if (
      !threads.length ||
      Date.now() - Number(source.checkpoint.discoveredAt || 0) > 86400000
    ) {
      const user = await readJson<AnyRecord>(
        `${api}/user/whoishiring.json`,
        ctx,
      );
      const found: AnyRecord[] = [];
      for (const id of (user.submitted || []).slice(0, 10)) {
        const item = await readJson<AnyRecord>(`${api}/item/${id}.json`, ctx);
        if (/^Ask HN: Who is hiring\?/i.test(item?.title || "")) {
          const previous = threads.find((t) => t.id === id);
          found.push({
            id,
            seen: previous?.seen || [],
            recheck: previous?.recheck || 0,
          });
        }
        if (found.length === 2) break;
      }
      if (!found.length)
        throw new Error("Could not find a current Who is hiring thread.");
      threads = found;
      source.checkpoint = { threads, discoveredAt: Date.now() };
      checkpoint(source.checkpoint);
    }
    for (const thread of threads) {
      const story = await readJson<AnyRecord>(
        `${api}/item/${thread.id}.json`,
        ctx,
      );
      const seen = new Set<number>(thread.seen);
      const kids: number[] = story.kids || [];
      // New top-level comments first; a rotating subset of older comments catches edits.
      const fresh = kids.filter((id) => !seen.has(id)).reverse();
      const old = kids.filter((id) => seen.has(id));
      const rechecks = old.slice(thread.recheck, thread.recheck + 2);
      for (const id of [...fresh, ...rechecks]) {
        const item = await readJson<AnyRecord>(`${api}/item/${id}.json`, ctx);
        if (item && !item.deleted && !item.dead && item.text) {
          const description = htmlText(item.text);
          const first = description.split("\n")[0];
          const pieces = first.split("|").map((s) => s.trim());
          emit({
            ...defaults,
            sourceItemId: String(id),
            company: pieces[0].slice(0, 100) || "HN hiring post",
            title:
              pieces
                .find((p) =>
                  /engineer|developer|designer|technical|founding|research/i.test(
                    p,
                  ),
                )
                ?.slice(0, 160) || "Hiring post",
            location: pieces
              .slice(1)
              .filter((p) => !/engineer|developer|designer/i.test(p))
              .join(" · ")
              .slice(0, 250),
            arrangement: /remote/i.test(first) ? "Remote" : "Unspecified",
            url: `https://news.ycombinator.com/item?id=${id}`,
            description,
            publishedAt: new Date(item.time * 1000).toISOString(),
            kind: "lead",
            descriptionQuality: "excerpt",
          });
        }
        seen.add(id);
        thread.seen = [...seen];
        checkpoint(source.checkpoint);
      }
      thread.recheck = old.length
        ? (Number(thread.recheck || 0) + 2) % old.length
        : 0;
      checkpoint(source.checkpoint);
    }
    return;
  }
  if (source.type === "rss") {
    const xml = await readUrl(source.identifier, ctx);
    for (const job of normalizeRss(xml, source)) emit(job);
    return;
  }
  if (source.type === "x") return collectX(source, ctx, emit, checkpoint);
  if (source.type === "web3") return collectWeb3(ctx, emit);
  if (source.type === "public_board")
    return collectPublicBoard(source, ctx, emit, checkpoint);
  if (source.type === "website")
    throw new Error("This source supports manual job entry only.");
  return collectDiscovery(source, ctx, emit, checkpoint);
}
