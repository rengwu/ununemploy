import { registerAiAuth } from "./ai-auth.ts";
import { registerAssistantAttachments } from "./assistant-attachments.ts";
import { defaultCoverLetterTemplate } from "../core/cover-letter/template.ts";
import { isRetiredSource } from "../core/source-catalog.ts";
import { profileReadiness } from "../core/profile/facts.ts";
import {
  assistantState,
  startAssistant,
  newAssistantChat,
} from "../core/assistant/service.ts";
import { contextSchema } from "../core/assistant/types.ts";
import {
  profileState,
  cancelProfileTurn,
  retryProfileTurn,
  restoreProfile,
} from "../core/profile/chat.ts";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import {
  jobQuerySchema,
  queryJobs,
  jobSnapshot,
  jobsRevision,
} from "../core/job-query.ts";
import type { Bootstrap } from "../core/api-types.ts";
import staticPlugin from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  canLoadVueJobsDescription,
  loadVueJobsDescription,
  queueCoverLetterWithDetails,
} from "../core/vuejobs.ts";
import { config } from "../core/config.ts";
import * as store from "../core/db/index.ts";
import {
  profileSchema,
  sourceInputSchema,
  cvDocumentSchema,
  coverLetterDocumentSchema,
} from "../core/types.ts";
import { fromProfile, renderCv } from "../core/cv/render.ts";
import { scan } from "../core/scan.ts";
import { exportPdf, exportDocx } from "../core/cv/export.ts";
import { xToken, setXToken } from "../core/x-auth.ts";
import { web3Token, setWeb3Token } from "../core/web3-auth.ts";
import { xBudgetKey } from "../core/x.ts";
import { refreshAiStatus } from "../core/ai/generate.ts";
import { registerLatex } from "./latex.ts";
import { registerBackup } from "./backup.ts";
import { personalDataActivity } from "../core/backup/activity.ts";

export const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
app.addHook("onRequest", async (req, reply) => {
  // The home app has no login. Cross-origin browser writes still have no purpose here.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin) {
    const allowed = config.origin || `http://${req.headers.host}`;
    const devOrigin = "http://127.0.0.1:2839";
    if (
      req.headers.origin !== allowed &&
      req.headers.origin !== devOrigin &&
      req.headers.origin !== "http://localhost:2839"
    )
      return reply.code(403).send({ error: "Cross-origin request rejected." });
  }
});
app.setErrorHandler((error, req, reply) => {
  const message = error instanceof Error ? error.message : "Request failed.";
  const code =
    error instanceof z.ZodError
      ? 400
      : /not found/i.test(message)
        ? 404
        : /another window|changed/i.test(message)
          ? 409
          : 400;
  reply.code(code).send({ error: message });
});
const activeWrites = new WeakMap<FastifyRequest, () => void>();
app.addHook("preHandler", async (req) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.routeOptions.url !== "/api/backups/import"
  )
    activeWrites.set(req, personalDataActivity());
});
app.addHook("onResponse", async (req) => {
  activeWrites.get(req)?.();
  activeWrites.delete(req);
});
registerLatex(app);
registerBackup(app);
registerAiAuth(app);
app.get("/api/assistant", async (req, reply) =>
  conditional(req, reply, assistantState()),
);
app.post("/api/assistant/start", async () => startAssistant());
app.post("/api/assistant/new", async () => newAssistantChat());
registerAssistantAttachments(app);
app.post<{ Params: { id: string } }>("/api/assistant/:id/cancel", async (req) =>
  cancelProfileTurn(req.params.id),
);
app.post<{ Params: { id: string } }>(
  "/api/assistant/:id/retry",
  async (req) => {
    const body = z
      .object({ context: contextSchema.optional() })
      .parse(req.body || {});
    return store.transaction(() => {
      const turn = retryProfileTurn(req.params.id);
      if (body.context && turn.state === "queued")
        store.db
          .prepare(
            "UPDATE profile_turns SET context=? WHERE id=? AND engine='assistant'",
          )
          .run(JSON.stringify(body.context), turn.id);
      return turn;
    });
  },
);
app.get("/api/health", async (req, reply) => {
  const heartbeat = store.setting<string | null>("workerHeartbeat", null);
  const ok = !!heartbeat && Date.now() - Date.parse(heartbeat) < 90000;
  return reply.code(ok ? 200 : 503).send({ ok, worker: heartbeat });
});
function conditional(req: FastifyRequest, reply: FastifyReply, value: unknown) {
  const body = JSON.stringify(value);
  const etag = `"${store.hash(body)}"`;
  reply.header("ETag", etag).header("Cache-Control", "private, no-cache");
  if (req.headers["if-none-match"] === etag) return reply.code(304).send();
  return reply.type("application/json; charset=utf-8").send(body);
}
app.get("/api/bootstrap", async (req, reply) => {
  const counts = store.db
    .prepare(
      `SELECT COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status != 'dismissed') AS jobs,
    COUNT(*) FILTER (WHERE status IN ('saved','applied')) AS saved FROM jobs`,
    )
    .get() as Bootstrap["counts"];
  const coverLetterJobs = store.db
    .prepare(
      `WITH document_jobs AS (
        SELECT id FROM jobs WHERE json_extract(document,'$.savedAt') IS NOT NULL
        UNION SELECT job_id FROM cover_letter_versions
      )
      SELECT j.id, json_extract(j.document,'$.title') AS title,
        json_extract(j.document,'$.company') AS company
      FROM document_jobs d JOIN jobs j ON j.id=d.id
      ORDER BY j.first_seen_at DESC,j.id`,
    )
    .all() as Bootstrap["coverLetterJobs"];
  const tasks = store.db
    .prepare(
      `SELECT json_remove(t.document,'$.input') AS document,
    json_extract(j.document,'$.title') AS title FROM tasks t JOIN jobs j ON j.id=t.job_id ORDER BY t.created_at,t.rowid`,
    )
    .all()
    .map((row) => ({
      ...JSON.parse(row.document as string),
      jobTitle: row.title,
    })) as Bootstrap["tasks"];
  const value: Bootstrap = {
    jobsRevision: jobsRevision(),
    profile: {
      revision: store.getProfile().revision,
      ...profileReadiness(store.getProfile()),
    },
    counts,
    coverLetterJobs,
    tasks,
    x: { configured: !!xToken(), used: store.getCounter(xBudgetKey()) },
    web3: { configured: !!web3Token() },
    sources: store.listSources().filter((source) => !isRetiredSource(source)),
    settings: store.getSettings(),
    runs: store.listRuns(),
    ai: store.setting("aiStatus", {
      state: "checking",
      model: config.model,
      reasoning: config.reasoning,
    }),
  };
  return conditional(req, reply, value);
});
function requestedJobsRevision(req: FastifyRequest) {
  const value = req.headers["x-jobs-revision"];
  return typeof value === "string" ? value : undefined;
}
app.get("/api/jobs", async (req, reply) =>
  conditional(
    req,
    reply,
    queryJobs(jobQuerySchema.parse(req.query), [], requestedJobsRevision(req)),
  ),
);
app.get("/api/job-locations", async (req, reply) => {
  const snapshot = jobSnapshot(requestedJobsRevision(req));
  return conditional(req, reply, {
    options: snapshot.locations.options,
    timezoneOffsets: Object.fromEntries(
      [...snapshot.timezoneOffsets].map(([country, offsets]) => [
        country,
        [...offsets],
      ]),
    ),
    revision: snapshot.revision,
  });
});
app.get<{ Params: { id: string } }>("/api/jobs/:id", async (req, reply) => {
  const job = jobSnapshot(requestedJobsRevision(req)).byId.get(req.params.id);
  if (!job) throw new Error("Job not found.");
  return conditional(req, reply, {
    ...job,
    canLoadDescription: canLoadVueJobsDescription(job),
  });
});
app.get("/api/profile", async (req, reply) =>
  conditional(req, reply, profileState()),
);
app.post("/api/profile/restore", async (req) => {
  const { revision, expectedRevision } = z
    .object({
      revision: z.number().int().positive(),
      expectedRevision: z.number().int().positive(),
    })
    .parse(req.body);
  return restoreProfile(revision, expectedRevision);
});
app.get("/api/master", async (req, reply) =>
  conditional(req, reply, {
    profile: store.getProfile(),
    template: store.getTemplate(),
  }),
);
app.patch<{ Params: { id: string } }>("/api/jobs/:id", async (req) => {
  const body = z
    .object({
      status: z.enum(["new", "saved", "dismissed", "applied"]).optional(),
      notes: z.string().max(10000).optional(),
      description: z.string().max(100000).optional(),
    })
    .parse(req.body);
  const job = store.getJob(req.params.id);
  if (!job) throw new Error("Job not found.");
  if (body.notes !== undefined) job.notes = body.notes;
  if (body.description !== undefined) {
    job.description = body.description;
    job.descriptionOverride = body.description;
    job.descriptionQuality = body.description.trim() ? "full" : "unknown";
    job.descriptionSource = {
      name: "Manual edit",
      url: job.url,
      checkedAt: store.now(),
    };
  }
  if (body.status === "saved") {
    store.writeJob(job);
    await queueCoverLetterWithDetails(job.id);
    return store.getJob(job.id);
  }
  if (body.status) job.status = body.status;
  return store.writeJob(job);
});
app.post<{ Params: { id: string } }>("/api/jobs/:id/seen", async (req) =>
  store.markJobSeen(req.params.id),
);
app.post<{ Params: { id: string } }>("/api/jobs/:id/generate", async (req) =>
  queueCoverLetterWithDetails(req.params.id, true),
);
app.post<{ Params: { id: string } }>(
  "/api/jobs/:id/description/fetch",
  async (req) => loadVueJobsDescription(req.params.id),
);
app.post("/api/jobs", async (req) => {
  const item = z
    .object({
      title: z.string().min(1).max(200),
      company: z.string().min(1).max(200),
      url: z
        .url()
        .refine((s) => /^https?:\/\//.test(s), "Use an HTTP or HTTPS URL."),
      description: z.string().max(100000),
      location: z.string().max(300).default(""),
      arrangement: z.string().max(100).default("Unspecified"),
      sourceId: z.string().optional(),
    })
    .parse(req.body);
  let source = item.sourceId ? store.getSource(item.sourceId) : undefined;
  if (
    item.sourceId &&
    (!source || !["website", "public_board"].includes(source.type))
  )
    throw new Error("Choose a source that supports manual job entry.");
  source ||= store.listSources().find((s) => s.identifier === "manual");
  if (!source)
    source = store.addSource({
      name: "Manual",
      type: "rss",
      identifier: "manual",
      enabled: false,
      requestLimit: 1,
    });
  const { sourceId, ...content } = item;
  const result = store.ingestJob(source, {
    ...content,
    sourceItemId: store.canonicalUrl(item.url),
    salary: "",
    employmentType: "Unspecified",
    publishedAt: null,
    kind: "opening",
  });
  store.saveSource({ ...source, jobCount: source.jobCount + result.added });
  return result.job;
});
app.put("/api/profile", async (req) => {
  const body = z
    .object({ profile: profileSchema, expectedRevision: z.number() })
    .parse(req.body);
  return store.saveProfile(body.profile, body.expectedRevision);
});
app.get<{ Params: { revision: string } }>(
  "/api/profile/:revision",
  async (req) => {
    const row = store.db
      .prepare("SELECT document FROM profile_versions WHERE revision=?")
      .get(Number(req.params.revision)) as { document: string } | undefined;
    if (!row) throw new Error("Profile version not found.");
    return JSON.parse(row.document);
  },
);
const templateSchema = z.object({
  html: z.string().min(1).max(100000),
  css: z.string().max(100000),
});
const previewSchema = z.union([
  z.object({ profile: profileSchema, template: templateSchema }),
  z.object({ document: cvDocumentSchema, template: templateSchema }),
]);
let exporting = false;
app.post("/api/cv/export", async (req, reply) => {
  if (exporting)
    return reply
      .code(429)
      .send({ error: "An export is already running. Try again shortly." });
  const input = req.body as Record<string, unknown>;
  const body = previewSchema.parse(input);
  const format = z.enum(["pdf", "docx", "html"]).parse(input.format);
  const document =
    "profile" in body ? fromProfile(body.profile) : body.document;
  const filename =
    document.name
      .replace(/[^a-zA-Z0-9 -]/g, "")
      .trim()
      .replace(/ +/g, "-") || "CV";
  exporting = true;
  try {
    const buffer =
      format === "pdf"
        ? await exportPdf(document, body.template)
        : format === "docx"
          ? await exportDocx(document)
          : Buffer.from(renderCv(document, body.template));
    return reply
      .header(
        "Content-Disposition",
        `attachment; filename="${filename}-CV.${format}"`,
      )
      .type(
        format === "pdf"
          ? "application/pdf"
          : format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "text/html",
      )
      .send(buffer);
  } finally {
    exporting = false;
  }
});
app.get("/api/cv", async (req) => {
  const { jobId } = req.query as { jobId?: string };
  return store.listCvVersions(jobId);
});
app.get<{ Params: { id: string } }>("/api/cv/:id", async (req) => {
  const cv = store.getCv(req.params.id);
  if (!cv) throw new Error("CV not found.");
  return cv;
});
const letterPreviewSchema = z
  .object({
    document: coverLetterDocumentSchema,
  })
  .strict();
app.get("/api/cover-letters", async (req) => {
  const { jobId } = z.object({ jobId: z.string().min(1) }).parse(req.query);
  return store.listCoverLetterVersions(jobId);
});
app.get<{ Params: { id: string } }>("/api/cover-letters/:id", async (req) => {
  const letter = store.getCoverLetter(req.params.id);
  if (!letter) throw new Error("Cover letter not found.");
  return letter;
});
app.post("/api/cover-letters/preview", async (req) => {
  const body = letterPreviewSchema.parse(req.body);
  return { html: renderCv(body.document, defaultCoverLetterTemplate) };
});
app.post<{ Params: { id: string } }>(
  "/api/cover-letters/:id/versions",
  async (req) => {
    const previous = store.getCoverLetter(req.params.id);
    if (!previous) throw new Error("Cover letter not found.");
    const body = letterPreviewSchema
      .extend({ expectedId: z.string().optional() })
      .parse(req.body);
    renderCv(body.document, defaultCoverLetterTemplate);
    return store.transaction(() => {
      if (
        body.expectedId &&
        store.listCoverLetterVersions(previous.jobId)[0]?.id !== body.expectedId
      )
        throw new Error(
          "The cover letter changed in another window. Reload before saving.",
        );
      return store.saveCoverLetter({
        ...previous,
        ...body,
        template: defaultCoverLetterTemplate,
        parentId: previous.id,
        kind: "edited",
      });
    });
  },
);
app.post("/api/cover-letters/export", async (req, reply) => {
  if (exporting)
    return reply
      .code(429)
      .send({ error: "An export is already running. Try again shortly." });
  const body = letterPreviewSchema
    .extend({ format: z.literal("pdf") })
    .parse(req.body);
  const filename = `${body.document.name}-${body.document.company}-Cover-letter`
    .replace(/[^a-zA-Z0-9 -]/g, "")
    .replace(/ +/g, "-");
  exporting = true;
  try {
    const buffer = await exportPdf(body.document, defaultCoverLetterTemplate);
    return reply
      .header(
        "Content-Disposition",
        `attachment; filename="${filename}.${body.format}"`,
      )
      .type("application/pdf")
      .send(buffer);
  } finally {
    exporting = false;
  }
});
app.post<{ Params: { id: string } }>("/api/tasks/:id/retry", async (req) => {
  const task = store.listTasks().find((t) => t.id === req.params.id);
  if (!task) throw new Error("Task not found.");
  if (task.kind !== "cover_letter")
    throw new Error(
      "Resume generation has been replaced. Generate a cover letter from the saved job.",
    );
  if (["running", "queued", "complete"].includes(task.state)) return task;
  if (task.state === "needs_details") {
    let job = store.getJob(task.jobId)!;
    if (canLoadVueJobsDescription(job))
      job = await loadVueJobsDescription(job.id);
    if (store.needsJobDetails(job))
      throw new Error("Add a complete job description before retrying.");
    task.input.job = job;
  }
  task.state = "queued";
  task.error = null;
  task.updatedAt = store.now();
  store.saveTask(task);
  return { id: task.id, state: task.state };
});
app.post("/api/x/token", async (req) => {
  const { token } = z
    .object({
      token: z
        .string()
        .trim()
        .min(10)
        .max(5000)
        .regex(/^[A-Za-z0-9%._~+\/=-]+$/, "Enter the bearer token only."),
    })
    .parse(req.body);
  setXToken(token);
  return { configured: true };
});
app.post("/api/ai/check", async () => refreshAiStatus());
app.post("/api/web3/token", async (req) => {
  const { token } = z
    .object({
      token: z
        .string()
        .trim()
        .min(1)
        .max(5000)
        .regex(/^[A-Za-z0-9%._~+\/=-]+$/, "Enter the API token only."),
    })
    .parse(req.body);
  setWeb3Token(token);
  for (const source of store
    .listSources()
    .filter((s) => s.type === "web3" && s.state !== "running"))
    store.saveSource({
      ...source,
      state: "idle",
      lastError: null,
      retryAt: null,
      nextRunAt: null,
    });
  return { configured: true };
});
app.post("/api/scan", async (req, reply) => {
  if (!profileReadiness(store.getProfile()).ready)
    return reply
      .code(409)
      .send({ error: "Complete your User profile before scanning for jobs." });
  const body = z
    .object({ sourceId: z.string().optional() })
    .parse(req.body || {});
  void scan(body.sourceId, true).catch((error) => app.log.error(error));
  return reply.code(202).send({ queued: true });
});
app.post("/api/sources", async (req) =>
  store.addSource(sourceInputSchema.parse(req.body)),
);
app.patch<{ Params: { id: string } }>("/api/sources/:id", async (req) => {
  const source = store.getSource(req.params.id);
  if (!source) throw new Error("Source not found.");
  const patch = sourceInputSchema.partial().parse(req.body);
  if (source.state === "running")
    throw new Error(
      "Wait for the current scan to finish before editing this source.",
    );
  const changed =
    (patch.type && patch.type !== source.type) ||
    (patch.identifier && patch.identifier !== source.identifier);
  return store.saveSource({
    ...source,
    ...patch,
    ...(changed
      ? {
          checkpoint: {},
          state: "idle",
          lastError: null,
          nextRunAt: null,
          retryAt: null,
        }
      : {}),
  });
});
app.put("/api/settings", async (req) => {
  const settings = z
    .object({
      scanIntervalHours: z.number().min(4).max(168),
      scheduleEnabled: z.boolean(),
      timezone: z.string().refine((s) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: s });
          return true;
        } catch {
          return false;
        }
      }, "Use a valid IANA time zone."),
      xMonthlyPostLimit: z.number().int().min(0).max(100000),
      xEnabled: z.boolean(),
      aiEnabled: z.boolean(),
    })
    .parse(req.body);
  store.putSetting("app", settings);
  return settings;
});
if (existsSync(resolve("dist/index.html"))) {
  await app.register(staticPlugin, { root: resolve("dist") });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/")
      ? reply.code(404).send({ error: "Not found." })
      : reply.sendFile("index.html"),
  );
}
if (process.env.JH_TEST_SERVER !== "1") {
  await app.listen({ port: config.port, host: config.host });
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.on(signal, () => void app.close().then(() => process.exit(0)));
}
