import { z } from "zod";
import { profileSchema, coverLetterDocumentSchema } from "../types.ts";

const id = z.string().min(1).max(500);
const timestamp = z.iso.datetime({ offset: true });
const text = z.string().max(2 * 1024 * 1024);
const link = z
  .string()
  .max(8000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Invalid job link.");
const descriptionSource = z.object({
  name: text,
  url: link,
  checkedAt: timestamp,
});
export const incomingSchema = z.object({
  sourceItemId: id,
  title: text,
  company: text,
  location: text,
  locationScope: z.enum(["listed", "hiring"]).optional(),
  arrangement: text,
  employmentType: text,
  salary: text,
  url: link,
  description: text,
  descriptionQuality: z.enum(["full", "excerpt", "unknown"]).optional(),
  descriptionSource: descriptionSource.optional(),
  applicationUrl: link.optional(),
  publishedAt: timestamp.nullable(),
  expiresAt: timestamp.nullable().optional(),
  removedAt: timestamp.nullable().optional(),
  kind: z.enum(["opening", "lead"]),
});
export const jobSchema = incomingSchema.extend({
  id,
  sourceId: id,
  sourceName: text,
  sourceType: text,
  firstSeenAt: timestamp,
  seenAt: timestamp.nullable().optional(),
  lastSeenAt: timestamp,
  contentHash: text,
  availability: z.enum(["open", "unknown", "closed"]),
  category: z.enum(["strong", "adjacent", "stretch", "other"]),
  score: z.number().finite(),
  reasons: z.array(text),
  gaps: z.array(text),
  eligibility: z.enum(["unknown", "review", "incompatible"]),
  eligibilityNotes: z.array(text),
  eligibilityEvidence: z
    .array(
      z.object({
        rule: text,
        text,
        outcome: z.enum(["review", "incompatible"]),
        source: z.enum(["description", "location"]),
      }),
    )
    .optional(),
  remoteEligibility: z.enum(["possible", "restricted", "unknown"]).optional(),
  matchVersion: z.number().int().optional(),
  matchScoreCap: z.number().optional(),
  matchProfileRevision: z.number().int().positive().optional(),
  matchBreakdown: z
    .array(z.object({ label: text, points: z.number() }))
    .optional(),
  matchedEvidence: z
    .array(
      z.object({
        technology: text,
        basis: z.enum(["professional", "project"]),
        ids: z.array(id),
      }),
    )
    .optional(),
  freshness: z.enum(["recent", "stale", "unknown"]).optional(),
  qualityNotes: z.array(text).optional(),
  contentChangedAt: timestamp.optional(),
  status: z.enum(["new", "saved", "dismissed", "applied"]),
  notes: text,
  descriptionOverride: text.optional(),
  savedAt: timestamp.nullable(),
});
const observation = z.object({
  sourceId: id,
  sourceType: text,
  sourceName: text,
  item: incomingSchema,
  firstSeenAt: timestamp,
  checkedAt: timestamp,
  changedAt: timestamp,
  missingAt: timestamp.nullable(),
});
const template = z.object({ html: text, css: text });
const version = z.object({
  id,
  version: z.number().int().positive(),
  kind: text,
  template,
  profileRevision: z.number().int().positive(),
  createdAt: timestamp,
  reviewNotes: z.array(text),
  evidence: z.unknown(),
  parentId: z.null(),
});
const choice = z.object({
  type: z.literal("choice"),
  choice: text,
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
  confidence: z.number().min(0).max(1),
});
const assessment = z.object({
  fingerprint: id,
  assessedAt: timestamp,
  model: text,
  match: choice,
  arrangement: choice,
  sponsorship: choice,
  eligibility: choice,
  locationEvidence: text.nullable(),
  arrangementEvidence: text.nullable(),
  eligibilityEvidence: text.nullable(),
  sponsorshipEvidence: text.nullable(),
  locations: z.array(
    z.object({
      name: text,
      kind: z.enum(["workplace", "hiring"]),
      confidence: z.number().min(0).max(1),
    }),
  ),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});
export const backupDataSchema = z.object({
  profile: profileSchema,
  jobs: z.array(jobSchema.extend({ canonicalUrl: link })).max(100000),
  observations: z
    .array(z.object({ jobId: id, items: z.array(observation).max(500) }))
    .max(100000),
  coverLetters: z
    .array(version.extend({ jobId: id, document: coverLetterDocumentSchema }))
    .max(100000),
  assessments: z
    .array(z.object({ jobId: id, document: assessment }))
    .max(100000),
  latex: z.object({
    version: z.number().int().positive(),
    createdAt: timestamp,
  }),
});
export type BackupData = z.infer<typeof backupDataSchema>;
export const manifestSchema = z.object({
  format: z.literal("ununemploy-personal-backup"),
  version: z.literal(1),
  createdAt: timestamp,
  files: z.record(
    z.string(),
    z.object({
      bytes: z.number().int().nonnegative(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});
