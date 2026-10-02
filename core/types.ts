import { z } from "zod";

const text = z.string().max(50000);
const date = z.looseObject({
  year: z.number().int().nullable(),
  month: z.number().int().min(1).max(12).nullable(),
  display: z.string().nullable(),
  precision: z.string().optional(),
});
const point = z.looseObject({
  id: z.string().min(1),
  text,
  sources: z.array(z.string()),
  status: z.string().optional(),
});
export const profileSchema = z
  .looseObject({
    schemaVersion: z.literal(1),
    revision: z.number().int().positive(),
    basics: z.looseObject({
      name: z.string().max(200),
      headline: z.string(),
      location: z.string(),
      summary: text,
      email: z.string().nullable(),
      phone: z.string().nullable(),
      website: z.string(),
      github: z.string(),
      linkedin: z.string(),
      citizenship: z.string(),
      sources: z.array(z.string()),
    }),
    experience: z.array(
      z.looseObject({
        id: z.string().min(1),
        employer: z.string().min(1),
        title: z.string().nullable(),
        start: date,
        end: date,
        isCurrent: z.boolean().nullable(),
        location: z.string().nullable(),
        bullets: z.array(point),
        technologies: z.array(z.string()),
      }),
    ),
    projects: z.array(
      z.looseObject({
        id: z.string().min(1),
        name: z.string(),
        url: z.string(),
        summary: text,
        bullets: z.array(text),
        technologies: z.array(z.string()),
        attribution: z.string().optional(),
        sources: z.array(z.string()),
      }),
    ),
    education: z.array(
      z.looseObject({
        id: z.string(),
        institution: z.string(),
        qualification: z.string(),
        specialization: z.string().optional(),
        start: date,
        end: date,
      }),
    ),
    awards: z.array(
      z.looseObject({
        id: z.string(),
        name: z.string(),
        result: z.string(),
        year: z.number(),
        description: text.optional(),
      }),
    ),
    sources: z.array(
      z.looseObject({
        id: z.string(),
        type: z.string(),
        url: z.string().optional(),
        description: text.optional(),
        localEvidenceFile: z.string().optional(),
      }),
    ),
    openItems: z.array(
      z.looseObject({
        id: z.string(),
        field: z.string(),
        question: z.string(),
        blocks: z.string(),
      }),
    ),
    preferences: z.record(z.string(), z.unknown()),
    presentation: z.record(z.string(), z.unknown()),
    facts: z
      .array(
        z.object({
          id: z.string().min(1),
          category: z.string().min(1),
          text,
          status: z.enum(["confirmed", "preference", "inferred"]),
          sources: z.array(z.string()),
        }),
      )
      .optional(),
  })
  .superRefine((p, ctx) => {
    const ids = [
      ...p.experience,
      ...p.projects,
      ...p.education,
      ...p.awards,
      ...(p.facts || []),
    ].map((x) => x.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message:
          "Experience, project, education, award, and fact IDs must be unique.",
      });
    const sources = new Set(p.sources.map((s) => s.id));
    if (sources.size !== p.sources.length)
      ctx.addIssue({ code: "custom", message: "Source IDs must be unique." });
    for (const record of [p.basics, ...p.projects, ...(p.facts || [])])
      for (const source of record.sources)
        if (!sources.has(source))
          ctx.addIssue({
            code: "custom",
            message: `Unknown source ${source}.`,
          });
    for (const e of p.experience)
      for (const b of e.bullets)
        for (const s of b.sources)
          if (!sources.has(s))
            ctx.addIssue({
              code: "custom",
              message: `Unknown source ${s} in ${b.id}`,
            });
  });
export type Profile = z.infer<typeof profileSchema>;
export type ReviewStatus = "new" | "saved" | "dismissed" | "applied";
export type MatchCategory = "strong" | "adjacent" | "stretch" | "other";
export type Job = {
  jev?: import("./jev/types.ts").JevJob;
  id: string;
  sourceId: string;
  sourceItemId: string;
  sourceName: string;
  sourceType: string;
  title: string;
  company: string;
  location: string;
  locationScope?: "listed" | "hiring";
  arrangement: string;
  employmentType: string;
  salary: string;
  url: string;
  description: string;
  descriptionQuality?: "full" | "excerpt" | "unknown";
  descriptionSource?: { name: string; url: string; checkedAt: string };
  canLoadDescription?: boolean;
  applicationUrl?: string;
  publishedAt: string | null;
  expiresAt?: string | null;
  firstSeenAt: string;
  /** First deliberate user open, distinct from the collector's firstSeenAt. */
  seenAt?: string | null;
  lastSeenAt: string;
  contentHash: string;
  kind: "opening" | "lead";
  availability: "open" | "unknown" | "closed";
  category: MatchCategory;
  score: number;
  reasons: string[];
  gaps: string[];
  eligibility: "unknown" | "review" | "incompatible";
  eligibilityNotes: string[];
  eligibilityEvidence?: {
    rule: string;
    text: string;
    outcome: "review" | "incompatible";
    source: "description" | "location";
  }[];
  remoteEligibility?: "possible" | "restricted" | "unknown";
  matchVersion?: number;
  matchScoreCap?: number;
  matchProfileRevision?: number;
  matchBreakdown?: { label: string; points: number }[];
  matchedEvidence?: {
    technology: string;
    basis: "professional" | "project";
    ids: string[];
  }[];
  freshness?: "recent" | "stale" | "unknown";
  qualityNotes?: string[];
  contentChangedAt?: string;
  duplicateOf?: string;
  duplicateReason?: string;
  relatedListings?: {
    id: string;
    name: string;
    url: string;
    status: ReviewStatus;
  }[];
  status: ReviewStatus;
  notes: string;
  descriptionOverride?: string;
  savedAt: string | null;
  coverLetterState?: string | null;
  coverLetterId?: string | null;
  cvState?: string | null;
  cvId?: string | null;
  sourceLinks?: { name: string; url: string }[];
};
export type IncomingJob = Pick<
  Job,
  | "sourceItemId"
  | "title"
  | "company"
  | "location"
  | "locationScope"
  | "arrangement"
  | "employmentType"
  | "salary"
  | "url"
  | "description"
  | "descriptionQuality"
  | "descriptionSource"
  | "applicationUrl"
  | "publishedAt"
  | "expiresAt"
  | "kind"
>;
export const sourceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum([
    "ashby",
    "greenhouse",
    "lever",
    "hn",
    "hn_jobs",
    "rss",
    "x",
    "himalayas",
    "remoteok",
    "remotive",
    "fourdayweek",
    "arbeitnow",
    "jobicy",
    "web3",
    "website",
    "public_board",
  ]),
  identifier: z.string().trim().min(1).max(1500),
  enabled: z.boolean().default(true),
  requestLimit: z.number().int().min(1).max(100).default(30),
  intervalHours: z.number().min(4).max(168).optional(),
});
export type Source = z.infer<typeof sourceInputSchema> & {
  id: string;
  state: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  retryAt?: string | null;
  lastError: string | null;
  jobCount: number;
  checkpoint: Record<string, unknown>;
};
export type ScanRun = {
  id: string;
  sourceId: string;
  sourceName?: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  requests: number;
  added: number;
  updated: number;
  error: string | null;
};
export type Template = { html: string; css: string };
export type CvDocument = {
  name: string;
  headline: string;
  location: string;
  contacts: { label: string; url?: string }[];
  summary: string;
  experience: {
    id: string;
    employer: string;
    title: string;
    dates: string;
    location: string;
    bullets: string[];
  }[];
  projects: {
    id: string;
    name: string;
    url: string;
    summary: string;
    bullets: string[];
    attribution?: string;
  }[];
  skills: string[];
  education: { institution: string; qualification: string; dates: string }[];
  awards: { name: string; result: string; year: number }[];
};
const safeLink = z
  .string()
  .refine(
    (s) => /^(https?:\/\/|mailto:)/i.test(s),
    "Use an HTTP, HTTPS, or email link.",
  );
export const cvDocumentSchema = z.object({
  name: z.string().min(1).max(200),
  headline: z.string().max(300),
  location: z.string().max(300),
  summary: text,
  contacts: z
    .array(z.object({ label: z.string().max(300), url: safeLink.optional() }))
    .max(12),
  experience: z
    .array(
      z.object({
        id: z.string(),
        employer: z.string(),
        title: z.string(),
        dates: z.string(),
        location: z.string(),
        bullets: z.array(text).max(30),
      }),
    )
    .max(40),
  projects: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        url: safeLink,
        summary: text,
        bullets: z.array(text).max(30),
        attribution: text.optional(),
      }),
    )
    .max(40),
  skills: z.array(z.string().max(200)).max(100),
  education: z
    .array(
      z.object({
        institution: z.string(),
        qualification: z.string(),
        dates: z.string(),
      }),
    )
    .max(20),
  awards: z
    .array(z.object({ name: z.string(), result: z.string(), year: z.number() }))
    .max(30),
});
export type CvVersion = {
  id: string;
  jobId: string | null;
  version: number;
  kind: string;
  document: CvDocument;
  template: Template;
  profileRevision: number;
  createdAt: string;
  reviewNotes: string[];
  evidence: unknown;
  parentId: string | null;
};
export const coverLetterDocumentSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.string().max(300),
  contacts: cvDocumentSchema.shape.contacts,
  company: z.string().min(1).max(300),
  role: z.string().min(1).max(400),
  salutation: z.string().min(1).max(300),
  paragraphs: z.array(z.string().trim().min(1).max(10000)).min(1).max(12),
  closing: z.string().min(1).max(300),
});
export type CoverLetterDocument = z.infer<typeof coverLetterDocumentSchema>;
export type CoverLetterVersion = Omit<CvVersion, "document" | "jobId"> & {
  jobId: string;
  document: CoverLetterDocument;
};
export type Task = {
  id: string;
  jobId: string;
  kind: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  attempts: number;
  input: { job: Job; profile: Profile; template: Template };
  resultId: string | null;
};
export type AppSettings = {
  scanIntervalHours: number;
  scheduleEnabled: boolean;
  timezone: string;
  xMonthlyPostLimit: number;
  xEnabled: boolean;
  aiEnabled: boolean;
};
