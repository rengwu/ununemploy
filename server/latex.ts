import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { compileLatex, LatexCompileError } from "../core/latex/compile.ts";
import {
  ensureLatex,
  latexContext,
  latexVersion,
  latexBuild,
  saveLatex,
  saveLatexBuild,
  sourceHash,
} from "../core/latex/store.ts";
const source = z
  .string()
  .min(1)
  .max(120000)
  .refine((s) => Buffer.byteLength(s) <= 240000, "LaTeX source is too large.");
export function registerLatex(app: FastifyInstance) {
  app.get("/api/latex", async (_req, reply) =>
    reply.header("Cache-Control", "no-store").send(latexContext()),
  );
  app.get<{ Params: { version: string } }>(
    "/api/latex/versions/:version",
    async (req, reply) => {
      const version = z.coerce
        .number()
        .int()
        .positive()
        .parse(req.params.version);
      return reply
        .header("Cache-Control", "no-store")
        .send(latexVersion(version));
    },
  );
  app.put("/api/latex", async (req) => {
    const body = z
      .object({
        source,
        expectedVersion: z.number().int().positive(),
        restoredFrom: z.number().int().positive().optional(),
      })
      .parse(req.body);
    ensureLatex();
    return saveLatex(body.source, body.expectedVersion, body.restoredFrom);
  });
  app.post("/api/latex/compile", async (req, reply) => {
    const body = z.object({ source }).parse(req.body);
    const hash = sourceHash(body.source);
    const existing = latexBuild(hash);
    if (existing)
      return saveLatexBuild(body.source, existing.pdf, existing.diagnostics);
    try {
      const result = await compileLatex(body.source);
      return saveLatexBuild(body.source, result.pdf, result.diagnostics);
    } catch (error) {
      if (!(error instanceof LatexCompileError)) throw error;
      return reply
        .code(error.statusCode)
        .send({ error: error.message, diagnostics: error.diagnostics });
    }
  });
  app.get<{ Params: { hash: string } }>(
    "/api/latex/pdf/:hash",
    async (req, reply) => {
      const hash = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(req.params.hash);
      const result = latexBuild(hash);
      if (!result)
        return reply
          .code(404)
          .send({ error: "PDF preview not found. Recompile the document." });
      return reply
        .header("Cache-Control", "private, no-store")
        .header("Content-Disposition", 'inline; filename="resume.pdf"')
        .header("X-Content-Type-Options", "nosniff")
        .type("application/pdf")
        .send(result.pdf);
    },
  );
}
