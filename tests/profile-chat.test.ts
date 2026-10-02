import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-profile-test-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = "";
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const chat = await import("../core/profile/chat.ts");
const { emptyProfile, profileReadiness, profileMarkdown } =
  await import("../core/profile/facts.ts");
const { scan } = await import("../core/scan.ts");
const { app } = await import("../server/index.ts");
const ready = async () => ({ state: "ready", message: "" });
const edit = (path: string, value: unknown, evidenceQuote: string) => ({
  op: "set" as const,
  path,
  valueJson: JSON.stringify(value),
  evidenceQuote,
});
const enqueue = (text: string) =>
  chat.enqueueProfileMessage(text, randomUUID(), store.getProfile().revision);
const latest = () => chat.latestProfileTurn()!;
const reset = () => {
  if (latest()) chat.cancelProfileTurn(latest().id);
  return store.saveProfile(emptyProfile(), store.getProfile().revision);
};
const message = (content: string) => ({
  id: randomUUID(),
  role: "user" as const,
  content,
  createdAt: store.now(),
  turnId: null,
  kind: "chat",
});
after(async () => {
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("fresh installation has no private candidate seed; onboarding is idempotent and scans are blocked", async () => {
  assert.deepEqual(store.getProfile(), emptyProfile());
  const state = chat.startProfileChat();
  assert.equal(state.readiness.ready, false);
  assert.equal(state.readiness.missing.length, 5);
  assert.match(state.messages[0].content, /What name/);
  assert.equal(chat.startProfileChat().messages.length, 1);
  assert.deepEqual(await scan(), { profileRequired: true });
  assert.deepEqual(await scan(undefined, true), { profileRequired: true });
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/scan", payload: {} }))
      .statusCode,
    409,
  );
});

test("a conversation atomically builds canonical facts, evidence, CV context and discovery readiness", async () => {
  const text =
    "I am Maya in Toronto, Canada. I want junior data analyst roles, remote or hybrid. I completed analytics projects with SQL and Python.";
  const turn = enqueue(text);
  assert.equal(
    chat.enqueueProfileMessage(text, turn.userMessageId, 1).id,
    turn.id,
  );
  assert.throws(() => enqueue("Another message"), /already pending/);
  assert.throws(
    () => chat.enqueueProfileMessage("Changed text", turn.userMessageId, 1),
    /already in use/,
  );
  await chat.processProfileTurn({
    check: ready,
    infer: async (prompt) => {
      assert.match(prompt, /Build a user profile/);
      assert.match(prompt, /Never invent/);
      return {
        result: {
          reply:
            "Your profile is ready for discovery. Would you like to add project details?",
          edits: [
            edit("/basics/name", "Maya", "I am Maya"),
            edit("/basics/location", "Toronto, Canada", "Toronto, Canada"),
            edit(
              "/preferences/roleFamilies",
              ["junior data analyst"],
              "junior data analyst roles",
            ),
            edit(
              "/preferences/workArrangements",
              ["remote", "hybrid"],
              "remote or hybrid",
            ),
            edit(
              "/basics/summary",
              "Completed analytics projects with SQL and Python.",
              "I completed analytics projects with SQL and Python.",
            ),
          ],
        },
        usage: { input_tokens: 10 },
      };
    },
  });
  assert.equal(latest().state, "complete");
  const state = chat.profileState();
  assert.equal(state.profile.revision, 2);
  assert.equal(state.readiness.ready, true);
  assert.equal(state.profile.basics.citizenship, "");
  assert.equal(
    state.profile.sources[0].id,
    `profile-chat:${turn.userMessageId}`,
  );
  assert.match(state.markdown, /Maya/);
  assert.equal(state.changes[0].edits.length, 5);
  assert.equal(store.listCvVersions()[0].profileRevision, 2);
  assert.deepEqual(await scan("nonexistent-source", true), {
    busy: false,
    runs: [],
  });
});

test("guided edits and removal preserve unrelated metadata, evidence and prior profile versions", async () => {
  const before = store.getProfile();
  before.preferences.customPreference = { note: "Keep me" };
  store.saveProfile(before, before.revision);
  const turn = enqueue("I use R too.");
  await chat.processProfileTurn({
    check: ready,
    infer: async () => ({
      result: {
        reply: "Added R.",
        edits: [
          edit(
            "/facts/-",
            {
              id: "r",
              category: "Skills",
              text: "Uses R",
              status: "confirmed",
              sources: [`profile-chat:${turn.userMessageId}`],
            },
            "I use R too.",
          ),
        ],
      },
      usage: null,
    }),
  });
  assert.equal(latest().state, "complete");
  const revision = store.getProfile().revision;
  enqueue("Remove the R skill.");
  await chat.processProfileTurn({
    check: ready,
    infer: async () => ({
      result: {
        reply: "Removed R.",
        edits: [
          {
            op: "remove",
            path: "/facts/0",
            valueJson: "null",
            evidenceQuote: "Remove the R skill.",
          },
        ],
      },
      usage: null,
    }),
  });
  assert.deepEqual(store.getProfile().facts, []);
  assert.deepEqual(store.getProfile().preferences.customPreference, {
    note: "Keep me",
  });
  const old = JSON.parse(
    store.db
      .prepare("SELECT document FROM profile_versions WHERE revision=?")
      .get(revision)!.document as string,
  );
  assert.equal(old.facts[0].text, "Uses R");
});

test("invalid, unquoted and unsafe changes fail without partial edits or assistant success replies", async () => {
  const before = store.getProfile();
  const bad = [
    edit("/basics/name", "Invented", "not in message"),
    edit("/revision", 99, "Hello"),
    edit("/preferences/__proto__/polluted", true, "Hello"),
    edit("/preferences/data", { constructor: { polluted: true } }, "Hello"),
    edit(
      "/facts/-",
      {
        id: "bad",
        category: "Skills",
        text: "C",
        status: "confirmed",
        sources: ["missing"],
      },
      "Hello",
    ),
    edit("/basics/name", 42, "Hello"),
  ];
  for (const value of bad) {
    enqueue("Hello");
    const messages = chat.profileMessages().length;
    await chat.processProfileTurn({
      check: ready,
      infer: async () => ({
        result: {
          reply: "Saved",
          edits: [edit("/basics/location", "Changed", "Hello"), value],
        },
        usage: null,
      }),
    });
    assert.equal(latest().state, "failed");
    assert.deepEqual(store.getProfile(), before);
    assert.equal(chat.profileMessages().length, messages);
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("authentication pauses are retryable, cancellation discards late replies, and restart recovers running work", async () => {
  const turn = enqueue("Keep my current profile.");
  let calls = 0;
  await chat.processProfileTurn({
    check: async () => ({ state: "signed_out", message: "Sign in to Codex." }),
    infer: async () => {
      calls++;
      throw new Error("Should not run");
    },
  });
  assert.equal(calls, 0);
  assert.equal(latest().state, "paused");
  chat.retryProfileTurn(turn.id);
  const revision = store.getProfile().revision;
  await chat.processProfileTurn({
    check: ready,
    infer: async () => {
      chat.cancelProfileTurn(turn.id);
      return {
        result: {
          reply: "Changed",
          edits: [edit("/basics/name", "Wrong", "Keep my current profile.")],
        },
        usage: null,
      };
    },
  });
  assert.equal(latest().state, "cancelled");
  assert.equal(store.getProfile().revision, revision);
  chat.retryProfileTurn(turn.id);
  store.db
    .prepare("UPDATE profile_turns SET state='running' WHERE id=?")
    .run(turn.id);
  chat.recoverProfileTurns();
  assert.equal(latest().state, "paused");
  chat.retryProfileTurn(turn.id);
  await chat.processProfileTurn({
    check: ready,
    infer: async () => ({
      result: { reply: "No changes made.", edits: [] },
      usage: null,
    }),
  });
  assert.equal(latest().state, "complete");
  assert.equal(store.getProfile().revision, revision);
});

test("stopping a running turn aborts its inference signal and releases the chat lease", async () => {
  const turn = enqueue("Keep my profile unchanged.");
  let aborted = false;
  await chat.processProfileTurn({
    check: ready,
    infer: async (_prompt, _schema, options) =>
      new Promise((_resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Cancellation did not abort inference")),
          2000,
        );
        options!.signal!.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            aborted = true;
            reject(new Error("Codex request cancelled."));
          },
          { once: true },
        );
        chat.cancelProfileTurn(turn.id);
      }),
  });
  assert.equal(aborted, true);
  assert.equal(latest().state, "cancelled");
  assert.equal(store.lease("profile-chat", "test", 1000), true);
  store.release("profile-chat", "test");
});

test("prompt context uses current facts and bounded conversation without replaying historical source text", () => {
  const p = emptyProfile();
  p.basics.name = "Current name";
  p.sources = [
    {
      id: "old",
      type: "user_statement",
      description: "SUPERSEDED HISTORICAL CLAIM",
    },
  ];
  const latestMessage = message("Update my current profile.");
  const history = Array.from({ length: 30 }, () => message("x".repeat(16000)));
  const prompt = chat.profilePrompt(p, history, latestMessage);
  assert.ok(prompt.length < 100000);
  assert.match(prompt, /Current name/);
  assert.ok(!prompt.includes("SUPERSEDED HISTORICAL CLAIM"));
  assert.match(prompt, /Update my current profile/);
});

test("concurrent updates cannot be overwritten by queued or in-flight profile replies", async () => {
  enqueue("Change my name to Jo.");
  store.saveProfile(store.getProfile(), store.getProfile().revision);
  await chat.processProfileTurn({
    check: ready,
    infer: async () => {
      throw new Error("Should not run");
    },
  });
  assert.equal(latest().state, "conflict");
  const turn = chat.retryProfileTurn(latest().id);
  await chat.processProfileTurn({
    check: ready,
    infer: async () => {
      const newer = store.getProfile();
      newer.basics.name = "Concurrent change";
      store.saveProfile(newer, newer.revision);
      return {
        result: {
          reply: "Updated",
          edits: [edit("/basics/name", "Jo", "Change my name to Jo.")],
        },
        usage: null,
      };
    },
  });
  assert.equal(latest().state, "conflict");
  assert.equal(store.getProfile().basics.name, "Concurrent change");
  assert.equal(
    chat
      .profileMessages()
      .filter((m) => m.turnId === turn.id && m.role === "assistant").length,
    0,
  );
});

test("restores create new revisions, retain historical chat, and reapply the readiness gate", async () => {
  const messages = chat.profileMessages().length;
  const revision = store.getProfile().revision;
  chat.restoreProfile(1, revision);
  assert.equal(store.getProfile().revision, revision + 1);
  assert.equal(store.getProfile().basics.name, "");
  assert.equal(chat.profileMessages().length, messages + 1);
  assert.equal(profileReadiness(store.getProfile()).ready, false);
  assert.deepEqual(await scan(), { profileRequired: true });
  assert.throws(() => chat.restoreProfile(2, revision), /another window/);
});

test("Markdown includes extension facts and distinguishes historical sources from current facts", () => {
  const p = emptyProfile();
  p.facts = [
    {
      id: "x",
      category: "Availability",
      text: "Possibly July",
      status: "inferred",
      sources: [],
    },
  ];
  p.preferences.extra = {
    note: "A <script>alert(1)</script> and ![pixel](https://example.com/pixel)",
  };
  const markdown = profileMarkdown(p);
  assert.match(markdown, /Possibly July/);
  assert.match(markdown, /inferred/);
  assert.match(markdown, /Historical source descriptions/);
  assert.ok(!markdown.includes("<script>"));
  assert.ok(markdown.includes("\\!\\[pixel\\]"));
});

test("profile API validates messages, exposes conditional state, and preserves state across a second DB connection", async () => {
  reset();
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/profile/chat",
        payload: {
          message: "",
          clientId: randomUUID(),
          expectedRevision: store.getProfile().revision,
        },
      })
    ).statusCode,
    400,
  );
  const response = await app.inject("/api/profile");
  assert.equal(
    (
      await app.inject({
        url: "/api/profile",
        headers: { "if-none-match": response.headers.etag },
      })
    ).statusCode,
    304,
  );
  const { DatabaseSync } = await import("node:sqlite");
  const peer = new DatabaseSync(join(directory, "job-hunter.db"));
  try {
    assert.equal(
      peer.prepare("SELECT count(*) AS n FROM profile_messages").get()!.n,
      chat.profileMessages().length,
    );
  } finally {
    peer.close();
  }
});
