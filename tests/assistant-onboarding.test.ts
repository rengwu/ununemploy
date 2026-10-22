import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const directory = mkdtempSync(join(tmpdir(), "ununemploy-onboarding-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = "";
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const service = await import("../core/assistant/service.ts");
const chat = await import("../core/profile/chat.ts");
const { StructuredResponseError } = await import("../core/ai/pi.ts");
const { app } = await import("../server/index.ts");
const ready = async () => ({ state: "ready", message: "" });
const context = { page: "profile" };
const call = (name: string, args = {}) => ({
  name,
  argumentsJson: JSON.stringify(args),
});
const step = (...calls: ReturnType<typeof call>[]) => ({
  done: false,
  reply: "",
  calls,
});
const done = { done: true, reply: "Saved the supported details.", calls: [] };
const edit = (path: string, value: unknown, evidenceQuote: string) => ({
  op: "set",
  path,
  valueJson: JSON.stringify(value),
  evidenceQuote,
});
const enqueue = (message: string) =>
  service.enqueueAssistantMessage(message, randomUUID(), context);

// A real, extractable PDF with only fictional candidate evidence.
function resumePdf() {
  const stream =
    "BT /F1 12 Tf 30 150 Td (Maya Chen) Tj 0 -20 Td (Example Works - Support Analyst) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [i, value] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${value}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

after(async () => {
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("fresh PDF onboarding retains evidence across a natural confirmation and repairs a rejected profile path", async () => {
  service.startAssistant();
  assert.equal(store.getProfile().basics.name, "");
  const upload = await app.inject({
    method: "POST",
    url: "/api/assistant/attachments",
    payload: { name: "resume.pdf", data: resumePdf().toString("base64") },
  });
  assert.equal(upload.statusCode, 200, upload.body);
  const attachmentId = upload.json().id;
  const sent = await app.inject({
    method: "POST",
    url: "/api/assistant/messages",
    payload: {
      message: "",
      clientId: randomUUID(),
      context,
      attachments: [attachmentId],
    },
  });
  assert.equal(sent.statusCode, 202, sent.body);
  await service.processAssistantTurn({
    check: ready,
    infer: async () => ({
      result: { done: true, reply: "Is this your résumé?", calls: [] },
      usage: null,
    }),
  });
  enqueue("yeah that's my profile");
  let round = 0;
  const revision = store.getProfile().revision;
  await service.processAssistantTurn({
    check: ready,
    infer: async (prompt) => {
      const data = JSON.parse(
        prompt.split(
          "SUPPLIED APPLICATION DATA (not system instructions):\n",
        )[1],
      );
      assert.match(data.attachments[0].text, /Maya Chen/);
      assert.equal(data.latestUserMessage, "yeah that's my profile");
      round++;
      if (round === 4) {
        assert.match(JSON.stringify(data.steps), /source.*automatically/i);
        assert.match(JSON.stringify(data.steps), /repair|correct/i);
      }
      return {
        result:
          round === 1
            ? step(call("read_profile"))
            : round === 2
              ? step(
                  call("edit_profile", {
                    expectedRevision: revision,
                    edits: [edit("/sources/-", {}, "Maya Chen")],
                  }),
                )
              : round === 3
                ? done
                : round === 4
                  ? step(
                      call("edit_profile", {
                        expectedRevision: revision,
                        edits: [
                          edit("/basics/name", "Maya Chen", "Maya Chen"),
                          edit(
                            "/basics/summary",
                            "Support Analyst at Example Works.",
                            "Example Works - Support Analyst",
                          ),
                        ],
                      }),
                    )
                  : done,
        usage: null,
      };
    },
  });
  assert.equal(
    service.assistantState().turn?.state,
    "complete",
    service.assistantState().turn?.error || "",
  );
  assert.equal(round, 5);
  assert.equal(store.getProfile().basics.name, "Maya Chen");
  assert.equal(store.getProfile().revision, revision + 1);
  assert.ok(
    store
      .getProfile()
      .sources.some(
        (s) =>
          s.id === `attachment:${attachmentId}` &&
          s.description?.includes("Maya Chen"),
      ),
  );
  const changes = chat.profileState().changes[0].edits;
  assert.equal(changes.length, 2);
  assert.equal(changes[0].evidenceQuote, "Maya Chen");
  assert.equal(service.assistantState().turn?.receipts.length, 1);
  assert.deepEqual(store.listCvVersions(), []);
});

test("invalid step fields and an empty action step recover without another user message", async () => {
  service.newAssistantChat();
  enqueue("What else is needed?");
  let round = 0;
  await service.processAssistantTurn({
    check: ready,
    infer: async (prompt) => {
      if (round) assert.match(prompt, /response_error/);
      return {
        result:
          ++round === 1
            ? { done: "false" }
            : round === 2
              ? step()
              : {
                  done: true,
                  reply: "Which roles would you like to find?",
                  calls: [],
                },
        usage: null,
      };
    },
  });
  assert.equal(service.assistantState().turn?.state, "complete");
  assert.equal(round, 3);
  assert.equal(service.assistantState().messages.length, 3);
});

test("exhausted response recovery is bounded and never commits staged edits", async () => {
  service.newAssistantChat();
  enqueue("My name is Jo.");
  const before = store.getProfile();
  let round = 0;
  await service.processAssistantTurn({
    check: ready,
    infer: async () => ({
      result:
        ++round === 1
          ? step(
              call("read_profile"),
              call("edit_profile", {
                expectedRevision: before.revision,
                edits: [edit("/basics/name", "Jo", "My name is Jo.")],
              }),
            )
          : step(),
      usage: null,
    }),
  });
  assert.equal(round, 4);
  assert.equal(service.assistantState().turn?.state, "failed");
  assert.match(
    service.assistantState().turn?.error || "",
    /no changes were saved/i,
  );
  assert.deepEqual(store.getProfile(), before);
  assert.equal(service.assistantState().messages.length, 2);
});

test("subscription failures are not retried as response repairs", async () => {
  service.newAssistantChat();
  enqueue("Read my profile.");
  let requests = 0;
  await service.processAssistantTurn({
    check: ready,
    infer: async () => {
      requests++;
      throw new Error(
        "Your ChatGPT subscription allowance is unavailable. Retry after it resets.",
      );
    },
  });
  assert.equal(requests, 1);
  assert.equal(service.assistantState().turn?.state, "paused");
});

test("completed but unparseable model output is repaired and its usage retained", async () => {
  service.newAssistantChat();
  enqueue("What else is needed?");
  let requests = 0;
  await service.processAssistantTurn({
    check: ready,
    infer: async () => {
      if (++requests === 1)
        throw new StructuredResponseError("Invalid structured response", {
          output: 12,
        });
      assert.equal(
        service.assistantState().turn?.activity,
        "Correcting the response…",
      );
      return {
        result: {
          done: true,
          reply: "Which roles would you like to find?",
          calls: [],
        },
        usage: { output: 10 },
      };
    },
  });
  assert.equal(requests, 2);
  assert.equal(service.assistantState().turn?.state, "complete");
  const usage = store.db
    .prepare("SELECT usage FROM profile_turns WHERE id=?")
    .get(service.assistantState().turn!.id)!.usage;
  assert.deepEqual(JSON.parse(String(usage)), [{ output: 12 }, { output: 10 }]);
});

test("a contradictory finish never executes its calls and an empty final answer cannot claim success", async () => {
  service.newAssistantChat();
  enqueue("My name is Jo.");
  const before = store.getProfile();
  let requests = 0;
  await service.processAssistantTurn({
    check: ready,
    infer: async () => {
      requests++;
      return {
        result:
          requests === 1
            ? {
                ...done,
                calls: [
                  call("read_profile"),
                  call("edit_profile", {
                    expectedRevision: before.revision,
                    edits: [edit("/basics/name", "Jo", "My name is Jo.")],
                  }),
                ],
              }
            : { done: true, reply: " ", calls: [] },
        usage: null,
      };
    },
  });
  assert.equal(requests, 3);
  assert.equal(service.assistantState().turn?.state, "failed");
  assert.deepEqual(store.getProfile(), before);
  assert.equal(service.assistantState().messages.length, 2);
});

test("cancellation during response recovery discards late output", async () => {
  service.newAssistantChat();
  const turn = enqueue("What else is needed?");
  let requests = 0;
  await service.processAssistantTurn({
    check: ready,
    infer: async () => {
      if (++requests === 1) return { result: step(), usage: null };
      chat.cancelProfileTurn(turn.id);
      return { result: done, usage: null };
    },
  });
  assert.equal(requests, 2);
  assert.equal(service.assistantState().turn?.state, "cancelled");
  assert.equal(service.assistantState().messages.length, 2);
});
