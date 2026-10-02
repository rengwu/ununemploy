import { XMLParser } from "fast-xml-parser";
import type { IncomingJob, Source } from "./types.ts";
import { readJson, type FetchContext } from "./http.ts";
import { htmlText, sourceDate } from "./source-text.ts";

type RecordData = Record<string, any>;
const array = <T>(v: T | T[] | null | undefined): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];
const str = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";
const text = (v: any): string => htmlText(str(v?.["#text"] ?? v));
const range = (
  min: unknown,
  max: unknown,
  currency: unknown,
  period: unknown,
  divisor = 1,
) => {
  const number = (n: unknown) =>
    n !== null &&
    n !== undefined &&
    n !== "" &&
    Number.isFinite(Number(n)) &&
    Number(n) > 0
      ? Number(n) / divisor
      : null;
  const a = number(min),
    b = number(max);
  if (a === null && b === null) return "";
  const amount =
    a !== null && b !== null
      ? a === b
        ? String(a)
        : `${a}–${b}`
      : a !== null
        ? `from ${a}`
        : `up to ${b}`;
  return `${str(currency)} ${amount}${period ? ` / ${str(period)}` : ""}`.trim();
};
function jobsArray(data: any, key: string, provider: string): RecordData[] {
  if (!data || !Array.isArray(data[key]))
    throw new Error(`Unexpected ${provider} response: missing ${key} array.`);
  return data[key].filter((j: any) => j && typeof j === "object");
}
function base(j: Partial<IncomingJob>): IncomingJob {
  return {
    sourceItemId: "",
    title: "",
    company: "",
    location: "",
    arrangement: "Unspecified",
    employmentType: "Unspecified",
    salary: "",
    url: "",
    description: "",
    publishedAt: null,
    kind: "opening",
    descriptionQuality: "full",
    ...j,
  };
}
function valid(jobs: IncomingJob[]): IncomingJob[] {
  return jobs.filter(
    (j) => j.sourceItemId && j.title && /^https?:\/\//i.test(j.url),
  );
}
export function normalizeHimalayas(data: RecordData): IncomingJob[] {
  return valid(
    jobsArray(data, "jobs", "Himalayas").map((j) =>
      base({
        sourceItemId: str(j.guid),
        title: text(j.title),
        company: text(j.companyName),
        locationScope: "hiring",
        location:
          array(j.locationRestrictions).map(str).join(" · ") || "Not specified",
        arrangement: "Remote",
        employmentType: text(j.employmentType) || "Unspecified",
        salary: range(j.minSalary, j.maxSalary, j.currency, j.salaryPeriod),
        url: str(j.applicationLink || j.guid),
        description: [
          text(j.description || j.excerpt),
          array(j.timezoneRestrictions).length
            ? `Listed timezone restrictions (UTC offsets): ${array(j.timezoneRestrictions).join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        publishedAt: sourceDate(j.pubDate),
        expiresAt: sourceDate(j.expiryDate),
        descriptionQuality: text(j.description) ? "full" : "excerpt",
        kind: text(j.description) ? "opening" : "lead",
      }),
    ),
  );
}
export function normalizeRemoteOk(data: unknown): IncomingJob[] {
  if (!Array.isArray(data))
    throw new Error("Unexpected Remote OK response: expected array.");
  return valid(
    data
      .filter((j) => j && j.id && j.position)
      .map((j) =>
        base({
          sourceItemId: str(j.id),
          title: text(j.position),
          company: text(j.company),
          location: text(j.location) || "Not specified",
          arrangement: "Remote",
          url: str(j.url),
          description: text(j.description),
          applicationUrl: str(j.apply_url) || undefined,
          publishedAt: sourceDate(j.date || j.epoch),
          // The feed does not reliably specify the currency or pay period. Do not invent either.
          salary: range(
            j.salary_min,
            j.salary_max,
            j.salary_currency,
            j.salary_period,
          )
            ? `${range(j.salary_min, j.salary_max, j.salary_currency, j.salary_period)}${!j.salary_currency || !j.salary_period ? " (currency/period not fully specified)" : ""}`
            : "",
        }),
      ),
  );
}
export function normalizeRemotive(data: RecordData): IncomingJob[] {
  return valid(
    jobsArray(data, "jobs", "Remotive").map((j) =>
      base({
        sourceItemId: str(j.id),
        title: text(j.title),
        company: text(j.company_name),
        location: text(j.candidate_required_location) || "Not specified",
        locationScope: "hiring",
        arrangement: "Remote",
        employmentType: text(j.job_type) || "Unspecified",
        salary: text(j.salary),
        url: str(j.url),
        description: text(j.description),
        publishedAt: sourceDate(j.publication_date),
      }),
    ),
  );
}
export function normalizeFourDayWeek(data: RecordData): IncomingJob[] {
  return valid(
    jobsArray(data, "data", "4 Day Week").map((j) =>
      base({
        sourceItemId: str(j.id || j.slug),
        title: text(j.title),
        company: text(j.company?.name),
        location:
          array<RecordData>(j.locations)
            .map((l) => [l.city, l.country].filter(Boolean).join(", "))
            .filter(Boolean)
            .join(" · ") || "Not specified",
        arrangement: text(j.work_arrangement) || "Unspecified",
        employmentType: text(j.contract_type) || "Unspecified",
        salary: range(
          j.salary_min,
          j.salary_max,
          j.salary_currency,
          j.salary_period,
          100,
        ),
        url: str(j.url),
        description: [
          text(j.description),
          j.schedule_type
            ? `Listed schedule: ${text(j.schedule_type).replaceAll("_", " ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        publishedAt: sourceDate(j.posted_at),
      }),
    ),
  );
}
export function normalizeArbeitnow(data: RecordData): IncomingJob[] {
  return valid(
    jobsArray(data, "data", "Arbeitnow").map((j) =>
      base({
        sourceItemId: str(j.slug),
        title: text(j.title),
        company: text(j.company_name),
        location: text(j.location),
        arrangement: j.remote === true ? "Remote" : "Unspecified",
        employmentType: array(j.job_types).map(str).join(", ") || "Unspecified",
        url: str(j.url),
        description: text(j.description),
        publishedAt: sourceDate(j.created_at),
      }),
    ),
  );
}
export function normalizeJobicy(data: RecordData): IncomingJob[] {
  return valid(
    jobsArray(data, "jobs", "Jobicy").map((j) =>
      base({
        sourceItemId: str(j.id),
        title: text(j.jobTitle),
        company: text(j.companyName),
        location: text(j.jobGeo) || "Not specified",
        locationScope: "hiring",
        arrangement: "Remote",
        employmentType: array(j.jobType).map(str).join(", ") || "Unspecified",
        salary: range(
          j.salaryMin,
          j.salaryMax,
          j.salaryCurrency,
          j.salaryPeriod,
        ),
        url: str(j.url),
        description: text(j.jobDescription || j.jobExcerpt),
        descriptionQuality: text(j.jobDescription) ? "full" : "excerpt",
        kind: text(j.jobDescription) ? "opening" : "lead",
        publishedAt: sourceDate(j.pubDate),
      }),
    ),
  );
}

export function normalizeRss(xml: string, source: Source): IncomingJob[] {
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
  }).parse(xml);
  if (!parsed.rss && !parsed.feed)
    throw new Error("URL did not return an RSS or Atom feed.");
  const host = new URL(source.identifier).hostname
    .replace(/^www\./, "")
    .toLowerCase();
  return valid(
    array<RecordData>(parsed.rss?.channel?.item || parsed.feed?.entry).map(
      (entry) => {
        const link = array<any>(entry.link).find(
          (l) =>
            typeof l === "string" || !l["@_rel"] || l["@_rel"] === "alternate",
        );
        const href = typeof link === "string" ? link : link?.["@_href"];
        let url = "";
        try {
          if (href) url = new URL(href, source.identifier).href;
        } catch {
          /* Ignore malformed entries. */
        }
        const completeContent =
          [entry["content:encoded"], entry.content]
            .map(text)
            .sort((a, b) => b.length - a.length)[0] || "";
        const description =
          completeContent ||
          [entry.description, entry.summary]
            .map(text)
            .sort((a, b) => b.length - a.length)[0] ||
          "";
        let title = text(entry.title) || "Hiring post";
        let company = text(
          entry["job:company"] || entry["dc:creator"] || entry.author?.name,
        );
        let location = text(entry["job:location"] || entry.region);
        if (host === "app.vuejobs.com") {
          company =
            description.match(/^Employer:\s*([^\n]+)/i)?.[1]?.trim() || company;
          location =
            description.match(/(?:^|\n)Location:\s*([^\n]+)/i)?.[1]?.trim() ||
            location;
        }
        if (host === "weworkremotely.com") {
          const split = title.indexOf(": ");
          if (split > 0) {
            company = title.slice(0, split);
            title = title.slice(split + 2);
          }
        }
        if (["golangprojects.com", "clojurejobboard.com"].includes(host)) {
          const parts = title.split(/\s+@\s+/);
          if (parts.length > 1) {
            company = parts.pop()!;
            title = parts.join(" @ ");
          }
          location ||= description.split(" - ")[0].slice(0, 180);
        }
        const remote =
          host === "weworkremotely.com" ||
          /\bremote\b|anywhere in the world/i.test(location);
        const hasFullDescription =
          (host === "weworkremotely.com" || !!completeContent) &&
          description.length > 200 &&
          !/(?:\.\.\.|…|read more|continue reading)\s*$/i.test(description);
        return base({
          sourceItemId: text(entry.guid || entry.id) || url,
          title,
          company: company || "Not listed",
          location,
          locationScope: host === "weworkremotely.com" ? "hiring" : "listed",
          arrangement: remote ? "Remote" : "Unspecified",
          employmentType: text(entry["job:job_type"]) || "Unspecified",
          salary: text(entry["job:salary"]),
          url,
          description,
          publishedAt: sourceDate(
            entry.pubDate || entry.published || entry.updated,
          ),
          kind: hasFullDescription ? "opening" : "lead",
          descriptionQuality: hasFullDescription ? "full" : "excerpt",
        });
      },
    ),
  );
}

export async function collectDiscovery(
  source: Source,
  ctx: FetchContext,
  emit: (job: IncomingJob) => void,
  checkpoint: (value: Record<string, unknown>) => void,
  read: typeof readJson = readJson,
): Promise<void> {
  if (source.type === "remoteok") {
    for (const job of normalizeRemoteOk(
      await read("https://remoteok.com/api", ctx),
    ))
      emit(job);
  } else if (source.type === "remotive") {
    for (const job of normalizeRemotive(
      await read("https://remotive.com/api/remote-jobs", ctx),
    ))
      emit(job);
  } else if (source.type === "jobicy") {
    for (const job of normalizeJobicy(
      await read("https://jobicy.com/api/v2/remote-jobs?count=200", ctx),
    ))
      emit(job);
  } else if (source.type === "himalayas") {
    const queries = source.identifier
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
    if (!queries.length)
      throw new Error("Enter at least one Himalayas search keyword.");
    // Two recent pages per query. Resume an interrupted query, then refresh all queries next cycle.
    let index = Math.max(0, Number(source.checkpoint.queryIndex) || 0),
      page = Number(source.checkpoint.page) === 2 ? 2 : 1;
    for (; index < queries.length; index++) {
      for (; page <= 2; page++) {
        checkpoint({ queryIndex: index, page });
        const url = new URL("https://himalayas.app/jobs/api/search");
        url.search = new URLSearchParams({
          q: queries[index],
          sort: "recent",
          page: String(page),
        }).toString();
        const data = await read<RecordData>(url.href, ctx);
        for (const job of normalizeHimalayas(data)) emit(job);
        checkpoint({ queryIndex: index, page: page + 1 });
        if (data.jobs.length < 20) break;
      }
      page = 1;
      checkpoint({ queryIndex: index + 1, page });
    }
    checkpoint({});
  } else if (source.type === "fourdayweek" || source.type === "arbeitnow") {
    if (
      source.type === "arbeitnow" &&
      !["de", "uk"].includes(source.identifier)
    )
      throw new Error("Arbeitnow region must be de or uk.");
    const root =
      source.type === "fourdayweek"
        ? "https://4dayweek.io/api/v2/jobs"
        : `https://www.arbeitnow.${source.identifier === "uk" ? "co.uk" : "com"}/api/job-board-api`;
    let olderPage = Math.max(
      2,
      Math.floor(Number(source.checkpoint.page) || 2),
    );
    let page = 1;
    // Always refresh the newest page, then spend the remaining request budget on older pages.
    while (ctx.requests < ctx.limit) {
      const url = new URL(root);
      url.searchParams.set("page", String(page));
      if (source.type === "fourdayweek") {
        url.searchParams.set("limit", "100");
        url.searchParams.set("category", source.identifier);
      } else url.searchParams.set("visa_sponsorship", "true");
      const data = await read<RecordData>(url.href, ctx);
      for (const job of source.type === "fourdayweek"
        ? normalizeFourDayWeek(data)
        : normalizeArbeitnow(data))
        emit(job);
      const hasMore =
        source.type === "fourdayweek"
          ? data.has_more === true
          : Boolean(data.links?.next);
      if (!hasMore || data.data.length === 0) {
        checkpoint({ page: 2 });
        return;
      }
      if (page > 1) olderPage = page + 1;
      checkpoint({ page: olderPage });
      page = olderPage;
    }
  } else if (source.type === "hn_jobs") {
    const root = "https://hacker-news.firebaseio.com/v0";
    const ids = await read<number[]>(`${root}/jobstories.json`, ctx);
    if (!Array.isArray(ids)) throw new Error("Unexpected HN jobs response.");
    const seen = new Set(array<number>(source.checkpoint.seen as number[]));
    const fresh = ids.filter((id) => !seen.has(id));
    const old = ids.filter((id) => seen.has(id));
    const start =
      Number(source.checkpoint.recheck || 0) % Math.max(1, old.length);
    const rechecks = [...old.slice(start), ...old.slice(0, start)];
    let checked = 0;
    for (const id of [...fresh, ...rechecks]) {
      if (ctx.requests >= ctx.limit) break;
      const item = await read<RecordData | null>(
        `${root}/item/${id}.json`,
        ctx,
      );
      if (
        item &&
        !item.dead &&
        !item.deleted &&
        item.type === "job" &&
        item.title
      ) {
        const hnUrl = `https://news.ycombinator.com/item?id=${id}`;
        emit(
          base({
            sourceItemId: str(id),
            title: text(item.title),
            company: "Not listed",
            url: hnUrl,
            description: [
              text(item.text),
              item.url && /^https?:\/\//i.test(item.url)
                ? `Employer posting: ${item.url}`
                : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
            publishedAt: sourceDate(item.time),
            kind: "lead",
            descriptionQuality: "excerpt",
          }),
        );
      }
      if (seen.has(id)) checked++;
      seen.add(id);
      checkpoint({
        seen: ids.filter((id) => seen.has(id)),
        recheck: (start + checked) % Math.max(1, old.length),
      });
    }
  } else throw new Error(`Unsupported source type: ${source.type}`);
}
