import type { FastifyInstance } from "fastify";
import {
  exportBackup,
  importBackup,
  MAX_ZIP_BYTES,
} from "../core/backup/archive.ts";

export function registerBackup(app: FastifyInstance) {
  app.addContentTypeParser(
    "application/zip",
    { parseAs: "buffer", bodyLimit: MAX_ZIP_BYTES },
    (_req, body, done) => done(null, body),
  );
  let busy = false;
  app.get("/api/backups/export", async (_req, reply) => {
    if (busy)
      return reply
        .code(409)
        .send({
          error:
            "Another backup operation is running. Try again when it finishes.",
        });
    busy = true;
    try {
      const { buffer, filename } = await exportBackup();
      return reply
        .header("Cache-Control", "private, no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .type("application/zip")
        .send(buffer);
    } finally {
      busy = false;
    }
  });
  app.post(
    "/api/backups/import",
    { bodyLimit: MAX_ZIP_BYTES },
    async (req, reply) => {
      if (!Buffer.isBuffer(req.body))
        return reply.code(400).send({ error: "Upload a ZIP backup." });
      if (busy)
        return reply
          .code(409)
          .send({
            error:
              "Another backup operation is running. Try again when it finishes.",
          });
      busy = true;
      try {
        return reply
          .header("Cache-Control", "no-store")
          .send(await importBackup(req.body));
      } finally {
        busy = false;
      }
    },
  );
}
