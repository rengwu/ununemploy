import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  attachment,
  attachmentMetadata,
  storeAttachment,
  removeDraftAttachment,
  mentionedLocalPaths,
  importLocalAttachment,
} from "../core/assistant/attachments.ts";
import { enqueueAssistantMessage } from "../core/assistant/service.ts";
import { contextSchema } from "../core/assistant/types.ts";
import * as store from "../core/db/index.ts";

function localRequest(req: FastifyRequest) {
  const loopback = (host: string) =>
    ["localhost", "127.0.0.1", "[::1]", "::1", "::ffff:127.0.0.1"].includes(
      host,
    );
  try {
    return (
      loopback(req.ip) &&
      loopback(new URL(`http://${req.headers.host}`).hostname) &&
      (!req.headers.origin || loopback(new URL(req.headers.origin).hostname))
    );
  } catch {
    return false;
  }
}
export function registerAssistantAttachments(app: FastifyInstance) {
  app.post(
    "/api/assistant/attachments",
    { bodyLimit: 14 * 1024 * 1024 },
    async (req) => {
      const body = z
        .object({
          name: z.string().min(1).max(500),
          data: z
            .string()
            .max(13981016)
            .regex(
              /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
            ),
        })
        .parse(req.body);
      return storeAttachment(body.name, Buffer.from(body.data, "base64"));
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/assistant/attachments/:id",
    async (req) => {
      const { data, text, ...meta } = attachment(
        z.string().uuid().parse(req.params.id),
      );
      return meta;
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/assistant/attachments/:id/content",
    async (req, reply) => {
      const item = attachment(z.string().uuid().parse(req.params.id));
      return reply
        .type(item.mediaType)
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "no-store")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .header(
          "Content-Disposition",
          `${item.mediaType.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(item.name)}`,
        )
        .send(Buffer.from(item.data));
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/assistant/attachments/:id",
    async (req) => {
      removeDraftAttachment(z.string().uuid().parse(req.params.id));
      return { ok: true };
    },
  );
  app.post("/api/assistant/messages", async (req, reply) => {
    const body = z
      .object({
        message: z.string().trim().max(16000),
        clientId: z.string().uuid(),
        context: contextSchema,
        attachments: z.array(z.string().uuid()).max(5).default([]),
      })
      .parse(req.body);
    if (!body.message && !body.attachments.length)
      throw new Error("Write a message or attach a file.");
    const paths = mentionedLocalPaths(body.message);
    if (paths.length && !localRequest(req))
      throw new Error(
        "Local paths can only be read on this computer. Use Attach files to send a file from your device.",
      );
    const existing = store.db
      .prepare("SELECT content FROM profile_messages WHERE id=?")
      .get(body.clientId);
    if (existing) {
      const ids = attachmentMetadata()
        .filter((a) => a.messageId === body.clientId)
        .map((a) => a.id);
      if (
        (body.message
          ? existing.content !== body.message
          : !["Attached files.", "Please read the attached files."].includes(
              String(existing.content),
            )) ||
        body.attachments.some((id) => !ids.includes(id)) ||
        ids.length !== body.attachments.length + paths.length
      )
        throw new Error(
          "This message ID was already used for different content.",
        );
      return reply
        .code(202)
        .send(
          enqueueAssistantMessage(
            String(existing.content),
            body.clientId,
            body.context,
            ids,
          ),
        );
    }
    if (paths.length + body.attachments.length > 5)
      throw new Error("Attach at most five files per message.");
    const imported: string[] = [];
    try {
      for (const path of paths)
        imported.push((await importLocalAttachment(path)).id);
      return reply
        .code(202)
        .send(
          enqueueAssistantMessage(
            body.message || "Attached files.",
            body.clientId,
            body.context,
            [...body.attachments, ...imported],
          ),
        );
    } catch (error) {
      for (const id of imported) removeDraftAttachment(id);
      throw error;
    }
  });
}
