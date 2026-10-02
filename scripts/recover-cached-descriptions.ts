import {
  db,
  listSources,
  recoverCachedDescription,
  refreshAllJobs,
} from "../core/db/index.ts";
import { normalizeAshby, normalizeGreenhouse } from "../core/connectors.ts";
import {
  normalizeHimalayas,
  normalizeRemoteOk,
  normalizeRemotive,
  normalizeJobicy,
  normalizeFourDayWeek,
  normalizeArbeitnow,
  normalizeRss,
} from "../core/discovery.ts";
import type { IncomingJob, Source } from "../core/types.ts";
// Uses only existing public response cache. Does not spend budgets, scan, or change last-seen/closure state.
let recovered = 0;
const errors: string[] = [];
const sources = listSources();
for (const row of db
  .prepare("SELECT url,body,checked_at FROM http_cache")
  .all() as { url: string; body: string; checked_at: string }[]) {
  const url = new URL(row.url);
  let source: Source | undefined,
    items: IncomingJob[] = [];
  try {
    if (url.hostname === "api.ashbyhq.com") {
      source = sources.find(
        (s) => s.type === "ashby" && url.pathname.endsWith(`/${s.identifier}`),
      );
      if (source) items = normalizeAshby(JSON.parse(row.body), source);
    } else if (url.hostname === "boards-api.greenhouse.io") {
      source = sources.find(
        (s) =>
          s.type === "greenhouse" &&
          url.pathname.includes(`/boards/${s.identifier}/`),
      );
      if (source) items = normalizeGreenhouse(JSON.parse(row.body), source);
    } else if (url.hostname === "himalayas.app") {
      source = sources.find((s) => s.type === "himalayas");
      if (source) items = normalizeHimalayas(JSON.parse(row.body));
    } else if (url.hostname === "remoteok.com") {
      source = sources.find((s) => s.type === "remoteok");
      if (source) items = normalizeRemoteOk(JSON.parse(row.body));
    } else if (url.hostname === "remotive.com") {
      source = sources.find((s) => s.type === "remotive");
      if (source) items = normalizeRemotive(JSON.parse(row.body));
    } else if (url.hostname === "jobicy.com") {
      source = sources.find((s) => s.type === "jobicy");
      if (source) items = normalizeJobicy(JSON.parse(row.body));
    } else if (url.hostname === "4dayweek.io") {
      source = sources.find((s) => s.type === "fourdayweek");
      if (source) items = normalizeFourDayWeek(JSON.parse(row.body));
    } else if (/^www\.arbeitnow\.(com|co\.uk)$/.test(url.hostname)) {
      source = sources.find(
        (s) =>
          s.type === "arbeitnow" &&
          s.identifier === (url.hostname.endsWith("co.uk") ? "uk" : "de"),
      );
      if (source) items = normalizeArbeitnow(JSON.parse(row.body));
    } else {
      source = sources.find(
        (s) => s.type === "rss" && s.identifier === row.url,
      );
      if (source) items = normalizeRss(row.body, source);
    }
    if (source)
      for (const item of items)
        if (recoverCachedDescription(source, item, row.checked_at)) recovered++;
  } catch {
    errors.push(`${url.hostname}${url.pathname}`);
  }
}
const assessed = refreshAllJobs();
console.log(JSON.stringify({ recovered, assessed, errors }));
db.close();
