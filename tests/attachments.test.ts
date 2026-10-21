import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-attachments-"));
process.env.JH_DATA_DIR = join(directory, "data");
process.env.JH_PROFILE_SEED = "";
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const files = await import("../core/assistant/attachments.ts");
const service = await import("../core/assistant/service.ts");
const { app } = await import("../server/index.ts");
const context = { page: "profile", dirty: false };
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
after(async () => {
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});
test("extracts bounded PDF text and rejects malformed, oversized and non-text uploads", async () => {
  const text = "Synthetic candidate document";
  const stream = `BT /F1 12 Tf 30 150 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((value, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${value}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const attachment = await files.storeAttachment(
    "resume.pdf",
    Buffer.from(pdf),
  );
  assert.match(
    files.attachment(attachment.id).text,
    /Synthetic candidate document/,
  );
  await assert.rejects(
    files.storeAttachment("bad.pdf", Buffer.from("%PDF-broken")),
  );
  await assert.rejects(
    files.storeAttachment("bad.png", Buffer.from("text")),
    /format/,
  );
  await assert.rejects(
    files.storeAttachment("bad.txt", Buffer.from([255])),
    /UTF-8/,
  );
  await assert.rejects(
    files.storeAttachment("large.txt", Buffer.alloc(10 * 1024 * 1024 + 1)),
    /10 MB/,
  );
  await assert.rejects(
    files.storeAttachment("x.html", Buffer.from("<script/>")),
    /Attach a PDF/,
  );
});
test("only explicit user paths import files, with loopback and credential protections", async () => {
  const path = join(directory, "candidate notes.txt");
  writeFileSync(path, "User-supplied notes");
  assert.deepEqual(files.mentionedLocalPaths(`${path}\n\nRead this?`), [path]);
  assert.deepEqual(files.mentionedLocalPaths("https://example.com/a.pdf"), []);
  assert.equal(
    (await files.importLocalAttachment(path)).name,
    "candidate notes.txt",
  );
  const secretDirectory = join(directory, ".codex");
  mkdirSync(secretDirectory);
  const secret = join(secretDirectory, "session.txt");
  writeFileSync(secret, "{}");
  const alias = join(directory, "innocent.txt");
  symlinkSync(
    process.platform === "win32" ? secretDirectory : secret,
    alias,
    process.platform === "win32" ? "junction" : "file",
  );
  await assert.rejects(
    files.importLocalAttachment(
      process.platform === "win32" ? join(alias, "session.txt") : alias,
    ),
    /Credential/,
  );
  const remote = await app.inject({
    method: "POST",
    url: "/api/assistant/messages",
    remoteAddress: "192.168.1.2",
    payload: { message: path, clientId: randomUUID(), context },
  });
  assert.equal(remote.statusCode, 400);
  assert.match(remote.json().error, /this computer/);
  const rebound = await app.inject({
    method: "POST",
    url: "/api/assistant/messages",
    headers: { host: "untrusted.example" },
    payload: { message: path, clientId: randomUUID(), context },
  });
  assert.equal(rebound.statusCode, 400);
});
test("image-only send, idempotency, inference context, follow-up retention and New chat cleanup", async () => {
  service.startAssistant();
  const upload = await app.inject({
    method: "POST",
    url: "/api/assistant/attachments",
    payload: { name: "screenshot.png", data: png.toString("base64") },
  });
  assert.equal(upload.statusCode, 200, upload.body);
  const image = upload.json();
  const notes = await files.storeAttachment(
    "notes.txt",
    Buffer.from("My project uses Rust."),
  );
  const clientId = randomUUID();
  const payload = {
    message: "",
    clientId,
    context,
    attachments: [image.id, notes.id],
  };
  const sent = await app.inject({
    method: "POST",
    url: "/api/assistant/messages",
    payload,
  });
  assert.equal(sent.statusCode, 202, sent.body);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/assistant/messages",
        payload,
      })
    ).statusCode,
    202,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/assistant/messages",
        payload: { ...payload, attachments: [image.id] },
      })
    ).statusCode,
    400,
  );
  let calls = 0;
  await service.processAssistantTurn({
    check: async () => ({ state: "ready", message: "" }),
    infer: async (prompt, _schema, options) => {
      calls++;
      assert.match(prompt, /My project uses Rust/);
      assert.match(prompt, new RegExp(`attachment:${notes.id}`));
      assert.equal(options?.images?.[0].data, png.toString("base64"));
      return {
        result: { done: true, reply: "I can read the attachments.", calls: [] },
        usage: {},
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(service.assistantState().turn?.state, "complete");
  assert.equal(
    service.assistantState().messages.find((m) => m.id === clientId)
      ?.attachments.length,
    2,
  );
  files.removeDraftAttachment(image.id);
  assert.ok(files.attachment(image.id));
  const response = await app.inject({
    method: "GET",
    url: `/api/assistant/attachments/${image.id}/content`,
  });
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(response.rawPayload, png);
  const followup = randomUUID();
  service.enqueueAssistantMessage("What about the notes?", followup, context);
  await service.processAssistantTurn({
    check: async () => ({ state: "ready", message: "" }),
    infer: async (prompt, _schema, options) => {
      assert.match(prompt, /My project uses Rust/);
      assert.equal(options?.images?.length, 1);
      return {
        result: { done: true, reply: "Read again.", calls: [] },
        usage: {},
      };
    },
  });
  service.newAssistantChat();
  assert.equal(
    store.db.prepare("SELECT count(*) AS n FROM assistant_attachments").get()!
      .n,
    0,
  );
});
test("literal local PDF/text path imports are idempotent and not reread on retry", async () => {
  const path = join(directory, "local.txt");
  writeFileSync(path, "Attributable file content");
  const payload = {
    message: `${path}\nRead this file.`,
    clientId: randomUUID(),
    context,
  };
  const sent = await app.inject({
    method: "POST",
    url: "/api/assistant/messages",
    payload,
  });
  assert.equal(sent.statusCode, 202, sent.body);
  rmSync(path);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/assistant/messages",
        payload,
      })
    ).statusCode,
    202,
  );
  const stored = service
    .assistantState()
    .messages.find((m) => m.id === payload.clientId)!.attachments;
  assert.equal(stored.length, 1);
  assert.equal(
    files.attachment(stored[0].id).text,
    "Attributable file content",
  );
});
