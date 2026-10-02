import type {
  AppSettings,
  Job,
  Profile,
  Template,
  ScanRun,
  Source,
  Task,
} from "./types.ts";
import type { LocationOption } from "./locations.ts";

export type JobSummary = Pick<
  Job,
  | "id"
  | "title"
  | "company"
  | "location"
  | "arrangement"
  | "url"
  | "category"
  | "score"
  | "status"
  | "kind"
  | "firstSeenAt"
  | "seenAt"
  | "publishedAt"
  | "eligibility"
  | "freshness"
  | "cvId"
  | "cvState"
  | "coverLetterId"
  | "coverLetterState"
> & { listingCount: number; matchSource?: "jev" };
export type JobPage = {
  items: JobSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  revision: string;
};
export type JobLocations = { options: LocationOption[]; revision: string };
export type CvContext = { profile: Profile; template: Template };
export type Bootstrap = {
  profile: import("./profile/facts.ts").ProfileReadiness & { revision: number };
  jobsRevision: string;
  counts: { total: number; jobs: number; saved: number };
  cvJobs: Pick<Job, "id" | "title" | "company">[];
  coverLetterJobs: Pick<Job, "id" | "title" | "company">[];
  tasks: (Omit<Task, "input"> & { jobTitle: string })[];
  sources: Source[];
  runs: ScanRun[];
  settings: AppSettings;
  x: { configured: boolean; used: number };
  web3: { configured: boolean };
  jev: import("./jev/types.ts").JevStatus;
  ai: { state: string; model: string; reasoning: string; message?: string };
};

export type UserProfileState = ReturnType<
  typeof import("./profile/chat.ts").profileState
>;
