import { publicBoards, boardSourceDefaults } from "./boards/catalog.ts";
import type { Source } from "./types.ts";

// Retain old database records without offering or scanning unimplemented adapters.
export function isRetiredSource(source: Pick<Source, "type" | "identifier">) {
  return (
    source.type === "public_board" &&
    ["adzuna", "jooble", "careerjet"].includes(source.identifier)
  );
}

export const sourceTypes = {
  ashby: "Ashby",
  greenhouse: "Greenhouse",
  lever: "Lever",
  hn: "Hacker News",
  hn_jobs: "Hacker News · YC jobs",
  rss: "RSS / Atom",
  x: "X",
  himalayas: "Himalayas",
  remoteok: "Remote OK",
  workingnomads: "Working Nomads",
  remotive: "Remotive",
  fourdayweek: "4 Day Week",
  arbeitnow: "Arbeitnow",
  jobicy: "Jobicy",
  web3: "Web3.career",
  website: "Manual entry",
  public_board: "Public job board",
};
export const fixedIdentifiers: Partial<Record<Source["type"], string>> = {
  hn: "whoishiring",
  hn_jobs: "jobstories",
  remoteok: "remoteok",
  workingnomads: "workingnomads",
  remotive: "remotive",
  jobicy: "jobicy",
  web3: "web3",
};
export function sourcePolicy(
  source: Pick<Source, "type" | "identifier" | "intervalHours">,
) {
  let minimumHours = 4;
  if (source.type === "himalayas") minimumHours = 24;
  if (
    source.type === "workingnomads" ||
    (source.type === "rss" &&
      [
        "https://jobs.wordpress.net/feed/",
        "https://www.remotejobs.com/jobs.rss",
      ].includes(source.identifier))
  )
    minimumHours = 24;
  if (source.type === "remotive") minimumHours = 6;
  if (source.type === "web3" || source.type === "public_board")
    minimumHours = 12;
  return {
    minimumHours,
    intervalHours: Math.max(minimumHours, source.intervalHours || 4),
    dailyCap: Math.floor(24 / minimumHours),
  };
}

export const discoverySources: Pick<
  Source,
  "name" | "type" | "identifier" | "enabled" | "requestLimit" | "intervalHours"
>[] = [
  ...Object.keys(publicBoards).map(boardSourceDefaults),
  {
    name: "Working Nomads",
    type: "workingnomads",
    identifier: "workingnomads",
    requestLimit: 1,
    intervalHours: 24,
  },
  {
    name: "WordPress Jobs",
    type: "rss",
    identifier: "https://jobs.wordpress.net/feed/",
    requestLimit: 1,
    intervalHours: 24,
  },
  {
    name: "RemoteJobs.com",
    type: "rss",
    identifier: "https://www.remotejobs.com/jobs.rss",
    requestLimit: 1,
    intervalHours: 24,
  },
  {
    name: "VueJobs",
    type: "rss",
    identifier: "https://app.vuejobs.com/feed/posts",
    requestLimit: 1,
    intervalHours: 12,
  },
  {
    name: "Web3.career",
    type: "web3",
    identifier: "web3",
    requestLimit: 1,
    intervalHours: 12,
  },
  {
    name: "Himalayas",
    type: "himalayas",
    identifier:
      "frontend|full stack|product engineer|AI engineer|developer tools|mobile|native|design engineer|founding engineer|harness",
    requestLimit: 20,
    intervalHours: 24,
  },
  {
    name: "Remote OK",
    type: "remoteok",
    identifier: "remoteok",
    requestLimit: 1,
    intervalHours: 6,
  },
  {
    name: "Remotive",
    type: "remotive",
    identifier: "remotive",
    requestLimit: 1,
    intervalHours: 12,
  },
  {
    name: "4 Day Week",
    type: "fourdayweek",
    identifier: "engineering,product,design,data",
    requestLimit: 4,
    intervalHours: 12,
  },
  {
    name: "We Work Remotely · Programming",
    type: "rss",
    identifier:
      "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    requestLimit: 1,
    intervalHours: 6,
  },
  {
    name: "We Work Remotely · Design",
    type: "rss",
    identifier: "https://weworkremotely.com/categories/remote-design-jobs.rss",
    requestLimit: 1,
    intervalHours: 6,
  },
  {
    name: "We Work Remotely · Product",
    type: "rss",
    identifier: "https://weworkremotely.com/categories/remote-product-jobs.rss",
    requestLimit: 1,
    intervalHours: 6,
  },
  {
    name: "GolangProjects",
    type: "rss",
    identifier: "https://www.golangprojects.com/rss.xml",
    requestLimit: 1,
    intervalHours: 24,
  },
  {
    name: "LaraJobs",
    type: "rss",
    identifier: "https://larajobs.com/feed",
    requestLimit: 1,
    intervalHours: 24,
  },
  {
    name: "ClojureJobboard",
    type: "rss",
    identifier: "https://clojurejobboard.com/rss.xml",
    requestLimit: 1,
    intervalHours: 24,
  },
  {
    name: "Hacker News · YC jobs",
    type: "hn_jobs",
    identifier: "jobstories",
    requestLimit: 21,
    intervalHours: 4,
  },
  {
    name: "Arbeitnow · Germany · Visa sponsorship",
    type: "arbeitnow",
    identifier: "de",
    requestLimit: 3,
    intervalHours: 12,
  },
  {
    name: "Arbeitnow · UK · Visa sponsorship",
    type: "arbeitnow",
    identifier: "uk",
    requestLimit: 3,
    intervalHours: 12,
  },
  {
    name: "Jobicy",
    type: "jobicy",
    identifier: "jobicy",
    requestLimit: 1,
    intervalHours: 6,
  },
  {
    name: "LangChain",
    type: "ashby",
    identifier: "langchain",
    requestLimit: 2,
    intervalHours: 6,
  },
  {
    name: "Cognition",
    type: "ashby",
    identifier: "cognition",
    requestLimit: 2,
    intervalHours: 6,
  },
  {
    name: "Replit",
    type: "ashby",
    identifier: "replit",
    requestLimit: 2,
    intervalHours: 6,
  },
  {
    name: "Figma",
    type: "greenhouse",
    identifier: "figma",
    requestLimit: 2,
    intervalHours: 6,
  },
  {
    name: "Notion",
    type: "ashby",
    identifier: "notion",
    requestLimit: 2,
    intervalHours: 6,
  },
  {
    name: "Supabase",
    type: "ashby",
    identifier: "supabase",
    requestLimit: 2,
    intervalHours: 6,
  },
  {
    name: "Sourcegraph",
    type: "greenhouse",
    identifier: "sourcegraph91",
    requestLimit: 2,
    intervalHours: 6,
  },
].map((s) => ({
  ...s,
  enabled: s.type !== "website",
})) as typeof discoverySources;
