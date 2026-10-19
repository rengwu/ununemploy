import { randomUUID } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { Worker } from "node:worker_threads";
import * as store from "../db/index.ts";
import { config } from "../config.ts";
import {
  attachmentCountLimit,
  attachmentLimit,
  type AssistantAttachment,
  type InferenceImage,
} from "./attachment-types.ts";

const types: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".md": "text/plain",
  ".csv": "text/plain",
  ".json": "text/plain",
  ".tex": "text/plain",
};
const fields =
  "id, message_id AS messageId, name, media_type AS mediaType, length(data) AS size";
type Stored = AssistantAttachment & { data: Uint8Array; text: string };
export function attachment(id: string): Stored {
  const row = store.db
    .prepare(
      `SELECT ${fields},data,extracted_text AS text FROM assistant_attachments WHERE id=?`,
    )
    .get(id) as Stored | undefined;
  if (!row) throw new Error("Attachment not found. Attach the file again.");
  return row;
}
export function attachmentMetadata() {
  return store.db
    .prepare(
      `SELECT ${fields} FROM assistant_attachments WHERE message_id IS NOT NULL ORDER BY rowid`,
    )
    .all() as AssistantAttachment[];
}
function extractPdf(data: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./extract-pdf.worker.mjs", import.meta.url),
      { workerData: data, resourceLimits: { maxOldGenerationSizeMb: 192 } },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("PDF reading timed out. Attach a smaller document."));
    }, 15000);
    worker.once("message", (result) => {
      clearTimeout(timer);
      void worker.terminate();
      result.error ? reject(new Error(result.error)) : resolve(result.text);
    });
    worker.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Could not read this PDF."));
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Could not read this PDF."));
    });
  });
}
export async function storeAttachment(name: string, data: Buffer) {
  name = basename(name.replaceAll("\\", "/"))
    .replace(/[\x00-\x1f\x7f]/g, "")
    .slice(0, 200);
  const mediaType = types[extname(name).toLowerCase()];
  if (!mediaType)
    throw new Error("Attach a PDF, text file, PNG, JPEG or WebP image.");
  if (!data.length || data.length > attachmentLimit)
    throw new Error("Each attachment must be nonempty and at most 10 MB.");
  let text = "";
  if (mediaType === "application/pdf") {
    if (!data.subarray(0, 1024).includes(Buffer.from("%PDF-")))
      throw new Error("This file is not a valid PDF.");
    text = await extractPdf(data);
  } else if (mediaType.startsWith("image/")) {
    const valid =
      mediaType === "image/png"
        ? data
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mediaType === "image/jpeg"
          ? data[0] === 255 && data[1] === 216 && data[2] === 255
          : data.toString("ascii", 0, 4) === "RIFF" &&
            data.toString("ascii", 8, 12) === "WEBP";
    if (!valid)
      throw new Error("Image format does not match the file extension.");
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      throw new Error("Text attachments must use UTF-8 encoding.");
    }
    if (text.includes("\0") || text.length > 100000)
      throw new Error("Attach a text file with at most 100,000 characters.");
  }
  // Discard abandoned composer uploads, never files already attached to messages.
  store.db
    .prepare(
      "DELETE FROM assistant_attachments WHERE message_id IS NULL AND created_at < ?",
    )
    .run(new Date(Date.now() - 86400000).toISOString());
  const pendingSize = store.db
    .prepare(
      "SELECT COALESCE(SUM(length(data)),0) AS bytes FROM assistant_attachments WHERE message_id IS NULL",
    )
    .get()!.bytes as number;
  if (pendingSize + data.length > 50 * 1024 * 1024)
    throw new Error(
      "Too many pending attachments. Remove unused files from the composer first.",
    );
  const id = randomUUID();
  store.db
    .prepare("INSERT INTO assistant_attachments VALUES (?,NULL,?,?,?,?,?)")
    .run(id, name, mediaType, data, text, store.now());
  return {
    id,
    name,
    mediaType,
    size: data.length,
    messageId: null,
  } satisfies AssistantAttachment;
}
export function removeDraftAttachment(id: string) {
  store.db
    .prepare(
      "DELETE FROM assistant_attachments WHERE id=? AND message_id IS NULL",
    )
    .run(id);
}
export function bindAttachments(ids: string[], messageId: string) {
  if (ids.length > attachmentCountLimit || new Set(ids).size !== ids.length)
    throw new Error("Attach at most five distinct files per message.");
  let bytes = 0;
  for (const id of ids) {
    const item = attachment(id);
    if (item.messageId && item.messageId !== messageId)
      throw new Error("This attachment already belongs to another message.");
    bytes += item.size;
  }
  if (bytes > 20 * 1024 * 1024)
    throw new Error("Attachments in one message must total at most 20 MB.");
  for (const id of ids)
    store.db
      .prepare("UPDATE assistant_attachments SET message_id=? WHERE id=?")
      .run(messageId, id);
}
export function attachmentContext(messageIds: string[]) {
  const allowed = new Set(messageIds.slice(-40));
  const selected = attachmentMetadata()
    .filter((a) => a.messageId && allowed.has(a.messageId))
    .slice(-20);
  let characters = 0,
    imageBytes = 0;
  const sources: { id: string; name: string; text: string }[] = [];
  const images: InferenceImage[] = [];
  for (const meta of selected.reverse()) {
    const row = attachment(meta.id);
    if (row.mediaType.startsWith("image/")) {
      if (images.length >= 5 || imageBytes + row.size > 20 * 1024 * 1024)
        continue;
      imageBytes += row.size;
      images.unshift({
        name: row.name,
        mediaType: row.mediaType,
        data: Buffer.from(row.data).toString("base64"),
      });
      sources.unshift({
        id: `attachment:${row.id}`,
        name: row.name,
        text: "Image supplied by the user. Describe visual evidence; do not assume it establishes candidate facts.",
      });
    } else {
      const text = row.text.slice(0, Math.max(0, 180000 - characters));
      if (!text) continue;
      characters += text.length;
      sources.unshift({
        id: `attachment:${row.id}`,
        name: row.name,
        text:
          text +
          (text.length < row.text.length
            ? "\n[Attachment text truncated]"
            : ""),
      });
    }
  }
  return { sources, images };
}
export function mentionedLocalPaths(content: string) {
  const paths = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const path = line.trim().replace(/^[`"']|[`"']$/g, "");
    if (/^(?:~\/|\/(?!\/)|[a-z]:[\\/])/i.test(path)) paths.add(path);
  }
  for (const match of content.matchAll(
    /([`"'])((?:~\/|\/(?!\/)|[a-z]:[\\/])[^\r\n]*?)\1/gi,
  ))
    paths.add(match[2]);
  if (paths.size > attachmentCountLimit)
    throw new Error("Attach at most five files per message.");
  return [...paths];
}
export async function importLocalAttachment(input: string) {
  const expanded = input.startsWith("~/")
    ? resolve(homedir(), input.slice(2))
    : input;
  if (!isAbsolute(expanded))
    throw new Error("Use an absolute file path or Attach files.");
  const path = await realpath(expanded).catch(() => {
    throw new Error(
      "Local file not found. Check its path or use Attach files.",
    );
  });
  const within = (root: string) => {
    const rest = relative(root, path);
    return (
      rest === "" ||
      (!rest.startsWith(".." + sep) && rest !== ".." && !isAbsolute(rest))
    );
  };
  if (
    within(await realpath(config.dataDir)) ||
    /(?:^|[\\/])(?:\.ssh|\.codex|\.aws|\.gnupg|\.config|\.env(?:\.[^\\/]*)?)(?:[\\/]|$)/i.test(
      path,
    ) ||
    /(?:^|[\\/])(?:auth|credentials|secrets)\.json$/i.test(path)
  )
    throw new Error(
      "Credential and application-state files cannot be imported into the assistant.",
    );
  if (!types[extname(path).toLowerCase()])
    throw new Error("Attach a PDF, text file, PNG, JPEG or WebP image.");
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW || 0),
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > attachmentLimit || !stat.size)
      throw new Error("Choose a regular file of at most 10 MB.");
    const data = Buffer.alloc(stat.size + 1);
    let bytesRead = 0;
    while (bytesRead < data.length) {
      const next = await handle.read(
        data,
        bytesRead,
        data.length - bytesRead,
        bytesRead,
      );
      if (!next.bytesRead) break;
      bytesRead += next.bytesRead;
    }
    if (bytesRead !== stat.size)
      throw new Error("The file changed while being read. Attach it again.");
    return storeAttachment(basename(path), data.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}
