import { defaultCoverLetterTemplate } from "../cover-letter/template.ts";
import { z } from "zod";
import * as store from "../db/index.ts";
import { queryJobs, jobQuerySchema, jobSnapshot } from "../job-query.ts";
import { foldLocation } from "../locations.ts";
import {
  applyProfileEdits,
  profileReplySchema,
  type ProfileMessage,
} from "../profile/chat.ts";
import {
  profileSchema,
  coverLetterDocumentSchema,
  type Profile,
  type CoverLetterVersion,
} from "../types.ts";
import { renderCv } from "../cv/render.ts";
import * as latex from "../latex/store.ts";
import { compileLatex, LatexCompileError } from "../latex/compile.ts";
import {
  readReference,
  mentionedUrls,
  referenceTarget,
  referenceLinks,
  type Reference,
} from "./references.ts";
import type { AssistantContext, Receipt } from "./types.ts";

const kind = z.enum(["latex", "cover_letter"]);
const documentArgs = z.object({ kind, jobId: z.string().optional() }).strict();
const replacements = z
  .array(
    z
      .object({
        find: z.string().min(1).max(120000),
        replace: z.string().max(120000),
      })
      .strict(),
  )
  .min(1)
  .max(30);
export const actionSchemas = {
  search_jobs: z
    .object({
      query: z.string().max(300).optional(),
      terms: z.array(z.string().min(1).max(80)).max(10).optional(),
      locations: z.array(z.string().max(200)).max(20).optional(),
      view: z.enum(["jobs", "saved"]).optional(),
      arrangement: z.enum(["all", "remote", "hybrid", "onsite"]).optional(),
      eligibility: z
        .enum(["possible", "all", "review", "incompatible"])
        .optional(),
      availability: z.enum(["current", "stale", "all"]).optional(),
      sort: z.enum(["match", "newest"]).optional(),
      page: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(30).optional(),
    })
    .strict(),
  read_job: z.object({ id: z.string() }).strict(),
  read_profile: z.object({}).strict(),
  read_document: documentArgs,
  read_reference: z.object({ url: z.string().url() }).strict(),
  edit_profile: z
    .object({
      expectedRevision: z.number().int().positive(),
      edits: profileReplySchema.shape.edits,
    })
    .strict(),
  edit_latex: z
    .object({ expectedVersion: z.number().int().positive(), replacements })
    .strict(),
  edit_document: z
    .object({
      kind: z.literal("cover_letter"),
      jobId: z.string().optional(),
      expectedId: z.string().nullable(),
      documentJson: z.string().min(1).max(120000),
    })
    .strict(),
  preview_latex: z.object({}).strict(),
};
type Doc = {
  kind: "cover_letter";
  jobId: string;
  previous: CoverLetterVersion;
  document: CoverLetterVersion["document"];
  changed: boolean;
};
export type ActionDependencies = {
  compile?: typeof compileLatex;
  reference?: typeof readReference;
};
export class AssistantActions {
  profile: Profile;
  readonly baseProfile: Profile;
  private profileRead = false;
  private profileEdits: z.infer<typeof profileReplySchema>["edits"] = [];
  private latexDoc: ReturnType<typeof latex.latexVersion> | null = null;
  private latexSource: string | null = null;
  private build: {
    hash: string;
    pdf?: Buffer;
    diagnostics: any[];
    error?: string;
  } | null = null;
  private documents = new Map<string, Doc>();
  readonly references: Reference[] = [];
  readonly allowedUrls: Set<string>;
  readonly researchText: string;
  readonly budget = { requests: 0, limit: 8 };
  readonly failures = new Map<string, string>();
  focus: AssistantContext | null = null;
  constructor(
    readonly message: ProfileMessage,
    readonly history: ProfileMessage[],
    readonly context: AssistantContext,
    readonly signal: AbortSignal,
    readonly deps: ActionDependencies = {},
    readonly attachments: { id: string; text: string; name?: string }[] = [],
  ) {
    this.baseProfile = store.getProfile();
    this.profile = structuredClone(this.baseProfile);
    const urls = [
      ...history
        .filter((m) => m.role === "user")
        .flatMap((m) => mentionedUrls(m.content)),
      ...mentionedUrls(message.content),
      ...this.profile.projects.flatMap((p) => mentionedUrls(p.url)),
      ...this.profile.sources.flatMap((s) =>
        s.url ? mentionedUrls(s.url) : [],
      ),
    ];
    this.allowedUrls = new Set(urls);
    this.researchText = [
      ...history.filter((m) => m.role === "user").map((m) => m.content),
      message.content,
    ].join("\n");
  }
  private guard(kind: string, jobId?: string) {
    this.signal.throwIfAborted();
    if (
      this.context.dirty &&
      (this.context.document === kind ||
        (kind === "profile" && this.context.document === "html_cv")) &&
      (!jobId || this.context.jobId === jobId)
    )
      throw new Error(
        "There are unsaved edits in this editor. Ask the user to save or discard them before editing the saved document.",
      );
  }
  private evidence() {
    return [
      ...this.history
        .filter((m) => m.role === "user" && m.id !== this.message.id)
        .map((m) => ({ id: `profile-chat:${m.id}`, text: m.content })),
      ...this.references,
      ...this.attachments,
    ];
  }
  private documentKey(kind: string, jobId?: string) {
    return `${kind}:${jobId || "master"}`;
  }
  async execute(
    name: keyof typeof actionSchemas,
    raw: unknown,
  ): Promise<unknown> {
    this.signal.throwIfAborted();
    const unsafe =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const key = name + ":" + (unsafe.kind || "") + ":" + (unsafe.jobId || "");
    try {
      const input = actionSchemas[name].parse(raw) as any;
      const result = await this.perform(name, input);
      if (name.startsWith("edit_")) this.failures.delete(key);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Action failed.";
      if (name.startsWith("edit_")) this.failures.set(key, message);
      throw error;
    }
  }
  private async perform(
    name: keyof typeof actionSchemas,
    input: any,
  ): Promise<unknown> {
    if (name === "search_jobs") {
      const { terms = [], locations = [], limit = 10, ...filters } = input;
      const options = jobSnapshot().locations.options;
      const resolvedLocations = locations.flatMap((location: string) => {
        const value = foldLocation(location);
        const exact = options.filter((o) =>
          [o.value, o.label, ...(o.aliases || [])].some(
            (s) => foldLocation(s) === value,
          ),
        );
        return exact.length ? exact.map((o) => o.value) : [value];
      });
      const result = queryJobs(
        jobQuerySchema.parse({
          ...filters,
          locations: JSON.stringify(resolvedLocations),
          pageSize: limit,
        }),
        terms,
      );
      return {
        ...result,
        scope:
          "Collected jobs only; match score is role fit, not a guarantee of eligibility.",
        items: result.items.map((job) => ({
          ...job,
          href: `#jobs?job=${encodeURIComponent(job.id)}`,
        })),
      };
    }
    if (name === "read_job") {
      const job = store.getJob(input.id);
      if (!job) throw new Error("Job not found.");
      return {
        ...job,
        description: job.description.slice(0, 30000),
        coverLetterVersions: store
          .listCoverLetterVersions(job.id)
          .slice(0, 5)
          .map(({ id, version }) => ({ id, version })),
      };
    }
    if (name === "read_profile") {
      this.profileRead = true;
      return {
        profile: {
          ...this.profile,
          sources: this.profile.sources.map(({ id, type, url }) => ({
            id,
            type,
            url,
          })),
        },
        schema: z.toJSONSchema(profileSchema),
        newSourceId: `profile-chat:${this.message.id}`,
      };
    }
    if (name === "read_reference") {
      referenceTarget(input.url, this.allowedUrls, this.researchText);
      const reference = await (this.deps.reference || readReference)(
        input.url,
        this.allowedUrls,
        this.budget,
        this.signal,
        this.researchText,
      );
      this.references.push(reference);
      for (const url of referenceLinks(reference.url, reference.links || []))
        this.allowedUrls.add(url);
      return reference;
    }
    if (name === "read_document") {
      this.focus = {
        page: input.kind === "cover_letter" ? "saved" : "cv",
        document: input.kind,
        ...(input.jobId ? { jobId: input.jobId } : {}),
        dirty: false,
      };
      if (input.kind === "latex") {
        if (!this.latexDoc) this.latexDoc = latex.latexVersion();
        return {
          ...this.latexDoc,
          source: this.latexSource ?? this.latexDoc.source,
          staged: this.latexSource !== null,
        };
      }
      const key = this.documentKey(input.kind, input.jobId);
      let doc = this.documents.get(key);
      if (!doc) {
        if (!input.jobId)
          throw new Error("Specify the job ID for this document.");
        const previous = store.listCoverLetterVersions(input.jobId)[0];
        if (!previous)
          throw new Error(
            "No saved document exists for this job. Open or generate its cover letter first.",
          );
        doc = {
          kind: "cover_letter",
          jobId: input.jobId,
          previous,
          document: previous.document,
          changed: false,
        };
        this.documents.set(key, doc);
      }
      return {
        kind: doc.kind,
        jobId: doc.jobId,
        id: doc.previous?.id || null,
        version: doc.previous?.version || 0,
        profileRevision: this.baseProfile.revision,
        document: doc.document,
        schema: z.toJSONSchema(coverLetterDocumentSchema),
      };
    }
    if (name === "edit_profile") {
      this.guard("profile");
      if (
        !this.profileRead ||
        input.expectedRevision !== this.baseProfile.revision
      )
        throw new Error(
          "Read the current profile before editing, using its exact revision.",
        );
      const edits = [...this.profileEdits, ...input.edits];
      if (edits.length > 40)
        throw new Error("At most 40 profile changes per turn.");
      const validated = applyProfileEdits(
        this.baseProfile,
        { reply: "Staged", edits },
        this.message,
        this.evidence(),
      );
      this.profile = validated.profile;
      this.profileEdits = edits;
      return {
        staged: true,
        changedFields: input.edits.map((e: any) => e.path),
        note: "Not saved until the turn finishes. Edit requested CV documents separately.",
      };
    }
    if (name === "edit_latex") {
      this.guard("latex");
      if (!this.latexDoc || input.expectedVersion !== this.latexDoc.version)
        throw new Error(
          "Read the current LaTeX document before editing, using its exact version.",
        );
      let source = this.latexSource ?? this.latexDoc.source;
      for (const edit of input.replacements) {
        const index = source.indexOf(edit.find);
        if (
          index < 0 ||
          source.indexOf(edit.find, index + edit.find.length) !== -1
        )
          throw new Error(
            "Each LaTeX replacement must match exactly one existing passage. Read the source and include sufficient context.",
          );
        source =
          source.slice(0, index) +
          edit.replace +
          source.slice(index + edit.find.length);
      }
      if (
        !source.trim() ||
        source.length > 120000 ||
        Buffer.byteLength(source) > 240000
      )
        throw new Error("LaTeX source is empty or too large.");
      this.latexSource = source;
      this.build = null;
      return {
        staged: true,
        note: "Source staged. Use preview_latex to check compilation before finishing.",
      };
    }
    if (name === "edit_document") {
      this.guard(input.kind, input.jobId);
      const doc = this.documents.get(this.documentKey(input.kind, input.jobId));
      if (!doc || input.expectedId !== (doc.previous?.id || null))
        throw new Error("Read this document first and supply its exact ID.");
      const document = coverLetterDocumentSchema.parse(
        JSON.parse(input.documentJson),
      );
      renderCv(document, defaultCoverLetterTemplate);
      Object.assign(doc, { document, changed: true });
      return {
        staged: true,
        preview: "rendered",
        note: "Validated HTML preview; document will be versioned when the turn finishes.",
      };
    }
    if (name === "preview_latex") return this.previewLatex();
    throw new Error("Unsupported application action.");
  }
  async previewLatex() {
    if (!this.latexDoc) throw new Error("Read the LaTeX document first.");
    const source = this.latexSource ?? this.latexDoc.source,
      hash = latex.sourceHash(source);
    if (this.build?.hash !== hash) {
      try {
        const result =
          latex.latexBuild(hash) ||
          (await (this.deps.compile || compileLatex)(source));
        this.build = { hash, ...result };
      } catch (error) {
        this.build = {
          hash,
          error: error instanceof Error ? error.message : "Compilation failed.",
          diagnostics:
            error instanceof LatexCompileError ? error.diagnostics : [],
        };
      }
    }
    this.signal.throwIfAborted();
    return {
      success: !this.build.error,
      error: this.build.error,
      diagnostics: this.build.diagnostics,
      staged: true,
    };
  }
  async prepare() {
    if (this.failures.size)
      throw new Error(
        `No changes were saved because an edit failed: ${[...this.failures.values()].join(" ")}`,
      );
    if (this.latexSource !== null) await this.previewLatex();
    this.signal.throwIfAborted();
  }
  commit(): Receipt[] {
    // Called inside the turn transaction: CAS checks, all document versions, audit
    // records and the assistant reply either commit together or roll back together.
    this.signal.throwIfAborted();
    const receipts: Receipt[] = [];
    if (
      (this.profileEdits.length ||
        (this.profileRead &&
          (this.latexSource !== null ||
            [...this.documents.values()].some((d) => d.changed)))) &&
      store.getProfile().revision !== this.baseProfile.revision
    )
      throw new Error(
        "The profile changed in another window. No assistant changes were saved.",
      );
    if (
      this.latexSource !== null &&
      latex.latexVersion().version !== this.latexDoc!.version
    )
      throw new Error(
        "The LaTeX document changed in another window. No assistant changes were saved.",
      );
    for (const doc of this.documents.values())
      if (doc.changed) {
        const current = store.listCoverLetterVersions(doc.jobId)[0];
        if ((current?.id || null) !== doc.previous.id)
          throw new Error(
            "The document changed in another window. No assistant changes were saved.",
          );
      }
    if (this.profileEdits.length) {
      this.profile = store.saveProfile(
        this.profile,
        this.baseProfile.revision,
        {
          onCommit: (p) => {
            store.db
              .prepare("INSERT INTO profile_changes VALUES (?,?,?,?,?)")
              .run(
                p.revision,
                this.baseProfile.revision,
                this.message.id,
                JSON.stringify(this.profileEdits),
                store.now(),
              );
          },
        },
      );
      receipts.push({
        kind: "profile",
        label: "User profile",
        href: "#profile",
        version: this.profile.revision,
        preview: "none",
      });
    }
    if (this.latexSource !== null) {
      const saved = latex.saveLatex(this.latexSource, this.latexDoc!.version);
      if (this.build?.pdf)
        latex.saveLatexBuild(
          saved.source,
          this.build.pdf,
          this.build.diagnostics,
        );
      receipts.push({
        kind: "latex",
        label: "LaTeX CV",
        href: "#cv?view=latex",
        version: saved.version,
        preview: this.build?.pdf ? "compiled" : "failed",
        ...(this.build?.error ? { warning: this.build.error } : {}),
      });
    }
    for (const doc of this.documents.values())
      if (doc.changed) {
        const saved = store.saveCoverLetter({
          ...doc.previous,
          document: doc.document,
          template: defaultCoverLetterTemplate,
          profileRevision: this.profile.revision,
          evidence: null,
          kind: "edited",
          parentId: doc.previous.id,
        });
        receipts.push({
          kind: "cover_letter",
          label: "Cover letter",
          href: `#saved?job=${encodeURIComponent(doc.jobId)}&tab=cover-letter`,
          version: saved.version,
          preview: "rendered",
        });
      }
    return receipts;
  }
}
