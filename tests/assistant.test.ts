import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-assistant-test-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = "";
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const assistant = await import("../core/assistant/service.ts");
const chat = await import("../core/profile/chat.ts");
const { AssistantActions } = await import("../core/assistant/actions.ts");
const { referenceTarget, mentionedUrls } =
  await import("../core/assistant/references.ts");
const latex = await import("../core/latex/store.ts");
const { LatexCompileError } = await import("../core/latex/compile.ts");
const { app } = await import("../server/index.ts");
const ready = async () => ({ state: "ready", message: "" });
const compile = async (_source: string) => ({
  pdf: Buffer.from("fixture-pdf"),
  diagnostics: [],
});
const call = (name: string, args: unknown = {}) => ({
  name,
  argumentsJson: JSON.stringify(args),
});
const intermediate = (...calls: ReturnType<typeof call>[]) => ({
  reply: "",
  done: false,
  calls,
});
const finish = {
  reply: "Updated the requested document.",
  done: true,
  calls: [],
};
const message = (
  content = "My name is Maya. Change the wording to New wording.",
) => ({
  id: randomUUID(),
  role: "user" as const,
  content,
  createdAt: store.now(),
  turnId: null,
  kind: "chat",
});
const actions = (
  text?: string,
  context = { page: "profile" as const, dirty: false },
) =>
  new AssistantActions(
    message(text),
    [],
    context,
    new AbortController().signal,
    { compile },
  );
const edit = (path: string, value: unknown, evidenceQuote: string) => ({
  op: "set",
  path,
  valueJson: JSON.stringify(value),
  evidenceQuote,
});
const save = async (a: InstanceType<typeof AssistantActions>) => {
  await a.prepare();
  return store.transaction(() => a.commit());
};
after(async () => {
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("assistant preserves legacy chat and idempotent messages while sharing one active queue", async () => {
  store.db
    .prepare("INSERT INTO profile_messages VALUES (?,?,?,?,?,?)")
    .run(
      randomUUID(),
      "assistant",
      "Historical profile welcome",
      store.now(),
      null,
      "welcome",
    );
  const previous = chat.profileMessages();
  const state = assistant.startAssistant();
  assert.equal(state.messages[0].id, previous[0].id);
  assert.equal(
    assistant.startAssistant().messages.length,
    state.messages.length,
  );
  const id = randomUUID();
  const turn = assistant.enqueueAssistantMessage("What can you do?", id, {
    page: "cv",
    document: "latex",
  });
  assert.equal(
    assistant.enqueueAssistantMessage("What can you do?", id, {
      page: "profile",
    }).id,
    turn.id,
  );
  assert.equal(assistant.assistantState().turn?.context.document, "latex");
  assert.throws(
    () =>
      chat.enqueueProfileMessage(
        "Other message",
        randomUUID(),
        store.getProfile().revision,
      ),
    /already pending/,
  );
  chat.cancelProfileTurn(turn.id);
});

test("job search applies AND technology terms, geography, eligibility and links real collected jobs", async () => {
  const source = store.addSource({
    name: "Assistant fixture",
    type: "ashby",
    identifier: "assistant-fixture",
    enabled: false,
    requestLimit: 1,
  });
  const records = [
    ["Malaysia", "React TypeScript", "yes"],
    ["Singapore", "React TypeScript", "wrong-country"],
    ["Malaysia", "Python", "wrong-stack"],
  ];
  for (const [location, skills, id] of records)
    store.ingestJob(source, {
      sourceItemId: id,
      title: `Engineer ${id}`,
      company: "Example",
      location,
      arrangement: "Remote",
      employmentType: "FullTime",
      salary: "",
      url: `https://example.com/${id}`,
      description: `Build applications with ${skills}.`,
      publishedAt: store.now(),
      kind: "opening",
    });
  const result = (await actions().execute("search_jobs", {
    terms: ["React", "TypeScript"],
    locations: ["Malaysia"],
    limit: 10,
  })) as any;
  assert.equal(result.total, 1);
  assert.match(result.items[0].title, /yes/);
  assert.match(result.items[0].href, /^#jobs\?job=/);
});

test("profile and actual LaTeX edits commit together, preserving previous versions and unrelated content", async () => {
  const initial = latex.latexVersion();
  latex.saveLatex("Old wording\nKeep this unchanged", initial.version);
  const base = latex.latexVersion(),
    before = store.getProfile();
  const msg = message();
  // Audit references point at the real queued user message.
  store.db
    .prepare("INSERT INTO profile_messages VALUES (?,?,?,?,?,?)")
    .run(msg.id, msg.role, msg.content, msg.createdAt, null, "chat");
  const a = new AssistantActions(
    msg,
    [],
    { page: "cv", document: "latex", dirty: false },
    new AbortController().signal,
    { compile },
  );
  await a.execute("read_profile", {});
  await a.execute("read_document", { kind: "latex" });
  await a.execute("edit_profile", {
    expectedRevision: before.revision,
    edits: [edit("/basics/name", "Maya", "My name is Maya.")],
  });
  await a.execute("edit_latex", {
    expectedVersion: base.version,
    replacements: [{ find: "Old wording", replace: "New wording" }],
  });
  assert.equal(latex.latexVersion().version, base.version);
  assert.equal(store.getProfile().revision, before.revision);
  const receipts = await save(a);
  assert.equal(store.getProfile().basics.name, "Maya");
  assert.equal(latex.latexVersion().source, "New wording\nKeep this unchanged");
  assert.equal(latex.latexVersion(base.version).source, base.source);
  assert.ok(
    receipts.some((r) => r.kind === "latex" && r.preview === "compiled"),
  );
  assert.ok(receipts.some((r) => r.kind === "profile"));
  assert.ok(!receipts.some((r) => r.kind === "html_cv"));
  assert.deepEqual(store.listCvVersions(), []);
  assert.ok(latex.latexBuild(latex.latexVersion().hash));
});

test("a concurrent LaTeX save rolls back all coordinated profile and document changes", async () => {
  const before = store.getProfile(),
    base = latex.latexVersion();
  const msg = message("My name is Jo.");
  store.db
    .prepare("INSERT INTO profile_messages VALUES (?,?,?,?,?,?)")
    .run(msg.id, msg.role, msg.content, msg.createdAt, null, "chat");
  const a = new AssistantActions(
    msg,
    [],
    { page: "profile", dirty: false },
    new AbortController().signal,
    { compile },
  );
  await a.execute("read_profile", {});
  await a.execute("read_document", { kind: "latex" });
  await a.execute("edit_profile", {
    expectedRevision: before.revision,
    edits: [edit("/basics/name", "Jo", "My name is Jo.")],
  });
  await a.execute("edit_latex", {
    expectedVersion: base.version,
    replacements: [{ find: "New wording", replace: "Jo wording" }],
  });
  latex.saveLatex(base.source + "\nConcurrent edit", base.version);
  await assert.rejects(save(a), /changed in another window/);
  assert.deepEqual(store.getProfile(), before);
  assert.match(latex.latexVersion().source, /Concurrent edit/);
});

test("profile corrections during a CV rewrite cause a conflict instead of resurrecting stale facts", async () => {
  const a = actions();
  await a.execute("read_profile", {});
  const doc = (await a.execute("read_document", { kind: "latex" })) as any;
  await a.execute("edit_latex", {
    expectedVersion: doc.version,
    replacements: [{ find: "New wording", replace: "Better wording" }],
  });
  store.saveProfile(store.getProfile(), store.getProfile().revision);
  await assert.rejects(save(a), /profile changed/);
});

test("read-before-edit, unique replacements, unsaved-editor protection and invalid edit rollback are enforced", async () => {
  const a = actions();
  await assert.rejects(
    a.execute("edit_latex", {
      expectedVersion: 1,
      replacements: [{ find: "x", replace: "y" }],
    }),
    /Read the current/,
  );
  const b = new AssistantActions(
    message(),
    [],
    { page: "cv", document: "latex", dirty: true },
    new AbortController().signal,
    { compile },
  );
  const doc = (await b.execute("read_document", { kind: "latex" })) as any;
  await assert.rejects(
    b.execute("edit_latex", {
      expectedVersion: doc.version,
      replacements: [{ find: "New wording", replace: "Newer" }],
    }),
    /unsaved edits/,
  );
  const c = actions();
  await c.execute("read_document", { kind: "latex" });
  await assert.rejects(
    c.execute("edit_latex", {
      expectedVersion: doc.version,
      replacements: [{ find: "Missing passage", replace: "y" }],
    }),
    /exactly one/,
  );
  await assert.rejects(c.prepare(), /No changes were saved/);
  await assert.rejects(
    c.execute("edit_document", { kind: "html_cv", expectedId: null, css: 99 }),
    /string/,
  );
  await assert.rejects(c.prepare(), /No changes were saved/);
});

test("public reference access permits only supplied exact URLs and deterministic repository README mapping", async () => {
  const allowed = new Set(
    mentionedUrls(
      "Read https://chartr.dev and https://github.com/rengwu/chartr.",
    ),
  );
  assert.equal(
    referenceTarget("https://github.com/rengwu/chartr", allowed).request,
    "https://api.github.com/repos/rengwu/chartr/readme",
  );
  assert.throws(
    () => referenceTarget("https://chartr.dev/?secret=private", allowed),
    /supplied public URL/,
  );
  assert.throws(
    () => referenceTarget("http://127.0.0.1/admin", allowed),
    /supplied public URL/,
  );
  const a = actions("Read https://chartr.dev");
  await assert.rejects(
    a.execute("read_reference", {
      url: "https://attacker.example/?data=private",
    }),
    /supplied public URL/,
  );
});

test("repository research derives commit and PR URLs without asking for pasted links", async () => {
  const root = "https://github.com/example/project";
  const allowed = new Set([root]);
  const user = "Review @contributor's work.";
  assert.equal(
    referenceTarget(`${root}/commits?author=contributor`, allowed, user)
      .request,
    "https://api.github.com/repos/example/project/commits?per_page=30&author=contributor",
  );
  assert.equal(
    referenceTarget(
      `${root}/pulls?q=is%3Apr+author%3Acontributor`,
      allowed,
      user,
    ).request,
    "https://api.github.com/search/issues?per_page=30&q=repo%3Aexample%2Fproject%20is%3Apr%20author%3Acontributor",
  );
  assert.equal(
    referenceTarget(`${root}/commit/1234567`, allowed).request,
    "https://api.github.com/repos/example/project/commits/1234567",
  );
  assert.equal(
    referenceTarget(`${root}/pull/12/files`, allowed).request,
    "https://api.github.com/repos/example/project/pulls/12/files",
  );
  for (const url of [
    `${root}/commits?author=not-mentioned`,
    `${root}/commits?author=contributor&secret=private`,
    `${root}/pulls?q=private`,
    `${root}-other/commits`,
    `${root}/settings`,
    "https://attacker.example/?data=private",
    "file:///etc/passwd",
    "https://user:secret@github.com/example/project/commits",
  ])
    assert.throws(() => referenceTarget(url, allowed, user));
  const reads: string[] = [];
  const msg = message(`Review ${root} and contributions by @contributor`);
  const a = new AssistantActions(
    msg,
    [],
    { page: "cv", dirty: false },
    new AbortController().signal,
    {
      reference: async (url) => {
        reads.push(url);
        return {
          id: `reference:${reads.length}`,
          url,
          text: "Public source evidence.",
          truncated: false,
          fetchedAt: store.now(),
          links: [`${root}/blob/main/README.md`, "https://attacker.example/"],
        };
      },
    },
  );
  await a.execute("read_reference", {
    url: `${root}/commits?author=contributor`,
  });
  await a.execute("read_reference", { url: `${root}/blob/main/README.md` });
  assert.equal(reads.length, 2);
  assert.ok(!a.allowedUrls.has("https://attacker.example/"));
  await assert.rejects(
    a.execute("read_reference", { url: "https://attacker.example/" }),
  );
});

test("attributable fetched text can support profile edits and is saved as provenance", async () => {
  const msg = message("Refresh my project from https://chartr.dev.");
  store.db
    .prepare("INSERT INTO profile_messages VALUES (?,?,?,?,?,?)")
    .run(msg.id, msg.role, msg.content, msg.createdAt, null, "chat");
  const a = new AssistantActions(
    msg,
    [],
    { page: "profile", dirty: false },
    new AbortController().signal,
    {
      reference: async () => ({
        id: "reference:fixture",
        url: "https://chartr.dev/",
        text: "chartr is built with Rust and GPUI.",
        truncated: false,
        fetchedAt: store.now(),
      }),
    },
  );
  await a.execute("read_profile", {});
  await a.execute("read_reference", { url: "https://chartr.dev/" });
  await a.execute("edit_profile", {
    expectedRevision: store.getProfile().revision,
    edits: [
      edit(
        "/facts/-",
        {
          id: "chartr-stack",
          category: "Project",
          text: "chartr uses Rust and GPUI",
          status: "confirmed",
          sources: ["reference:fixture"],
        },
        "chartr is built with Rust and GPUI.",
      ),
    ],
  });
  await save(a);
  assert.equal(
    store.getProfile().sources.find((s) => s.id === "reference:fixture")?.url,
    "https://chartr.dev/",
  );
});

test("the assistant rejects removed HTML and legacy CV editors", async () => {
  for (const kind of ["html_cv", "legacy_cv"]) {
    await assert.rejects(actions().execute("read_document", { kind }));
    await assert.rejects(
      actions().execute("edit_document", {
        kind,
        expectedId: null,
        css: "body{}",
      }),
    );
  }
});

test("cover-letter rewrites preserve the original version and job status and reject stale manual saves", async () => {
  const job = store.listJobs()[0];
  store.writeJob({ ...job, status: "saved" });
  const document = {
    name: "Maya",
    location: "Malaysia",
    contacts: [],
    company: job.company,
    role: job.title,
    salutation: "Dear team,",
    paragraphs: ["Old paragraph."],
    closing: "Regards,",
  };
  const original = store.saveCoverLetter({
    jobId: job.id,
    kind: "edited",
    document,
    template: store.getCoverLetterTemplate(),
    profileRevision: store.getProfile().revision,
    parentId: null,
    reviewNotes: [],
    evidence: null,
  });
  const a = actions("Make the letter direct.");
  const doc = (await a.execute("read_document", {
    kind: "cover_letter",
    jobId: job.id,
  })) as any;
  assert.equal("template" in doc, false);
  await assert.rejects(
    a.execute("edit_document", {
      kind: "cover_letter",
      jobId: job.id,
      expectedId: doc.id,
      html: "custom",
    }),
  );
  await a.execute("edit_document", {
    kind: "cover_letter",
    jobId: job.id,
    expectedId: doc.id,
    documentJson: JSON.stringify({
      ...document,
      paragraphs: ["I build useful software."],
    }),
  });
  const receipts = await save(a);
  assert.equal(store.listCoverLetterVersions(job.id).length, 2);
  assert.deepEqual(store.getCoverLetter(original.id)!.document, document);
  assert.equal(store.getJob(job.id)?.status, "saved");
  assert.equal(receipts[0].kind, "cover_letter");
  const response = await app.inject({
    method: "POST",
    url: `/api/cover-letters/${original.id}/versions`,
    payload: { document, expectedId: original.id },
  });
  assert.equal(response.statusCode, 409);
});

test("compilation failure saves the source with an explicit failed-preview receipt and keeps the previous PDF", async () => {
  const base = latex.latexVersion(),
    previousHash = store.setting("latexLastBuild", null);
  const a = new AssistantActions(
    message(),
    [],
    { page: "cv", document: "latex", dirty: false },
    new AbortController().signal,
    {
      compile: async () => {
        throw new LatexCompileError("Missing package");
      },
    },
  );
  await a.execute("read_document", { kind: "latex" });
  await a.execute("edit_latex", {
    expectedVersion: base.version,
    replacements: [{ find: "New wording", replace: "Invalid TeX" }],
  });
  const receipts = await save(a);
  assert.equal(receipts[0].preview, "failed");
  assert.match(receipts[0].warning!, /Missing package/);
  assert.equal(store.setting("latexLastBuild", null), previousHash);
});

test("the agent loop saves real-version receipts, retains focus across turns, and cannot perform unknown capabilities", async () => {
  const turn = assistant.enqueueAssistantMessage(
    "Make my CV clearer.",
    randomUUID(),
    { page: "profile" },
  );
  let round = 0;
  await assistant.processAssistantTurn({
    check: ready,
    compile,
    infer: async (prompt) => {
      round++;
      assert.match(prompt, /actual LaTeX CV/);
      const result =
        round === 1
          ? intermediate(call("read_document", { kind: "latex" }))
          : round === 2
            ? intermediate(
                call("edit_latex", {
                  expectedVersion: latex.latexVersion().version,
                  replacements: [
                    { find: "Invalid TeX", replace: "Clear wording" },
                  ],
                }),
                call("preview_latex"),
              )
            : finish;
      return { result, usage: null };
    },
  });
  const state = assistant.assistantState();
  assert.equal(state.turn?.id, turn.id);
  assert.equal(state.turn?.state, "complete");
  assert.match(state.messages.at(-1)!.content, /PDF compiled successfully/);
  assert.equal(state.focus?.document, "latex");
  assistant.enqueueAssistantMessage("Send it to someone.", randomUUID(), {
    page: "profile",
  });
  await assistant.processAssistantTurn({
    check: ready,
    infer: async () => ({
      result: intermediate(call("send_email")),
      usage: null,
    }),
  });
  assert.equal(assistant.assistantState().turn?.state, "failed");
});

test("cancellation and authentication failure preserve original documents and support retry", async () => {
  const before = latex.latexVersion();
  const turn = assistant.enqueueAssistantMessage(
    "Change the wording.",
    randomUUID(),
    { page: "cv", document: "latex" },
  );
  await assistant.processAssistantTurn({
    check: async () => ({ state: "signed_out", message: "Sign in to Codex." }),
  });
  assert.equal(assistant.assistantState().turn?.state, "paused");
  chat.retryProfileTurn(turn.id);
  let round = 0;
  await assistant.processAssistantTurn({
    check: ready,
    compile,
    infer: async () => {
      round++;
      if (round === 1)
        return {
          result: intermediate(
            call("read_document", { kind: "latex" }),
            call("edit_latex", {
              expectedVersion: before.version,
              replacements: [
                { find: "Clear wording", replace: "Cancelled wording" },
              ],
            }),
          ),
          usage: null,
        };
      chat.cancelProfileTurn(turn.id);
      return { result: finish, usage: null };
    },
  });
  assert.equal(assistant.assistantState().turn?.state, "cancelled");
  assert.deepEqual(latex.latexVersion(), before);
});

test("a failed staged edit cannot silently commit another document change", async () => {
  const before = latex.latexVersion();
  assistant.enqueueAssistantMessage("Edit my CV and template.", randomUUID(), {
    page: "cv",
  });
  let round = 0;
  await assistant.processAssistantTurn({
    check: ready,
    compile,
    infer: async () => ({
      result:
        ++round === 1
          ? intermediate(
              call("read_document", { kind: "latex" }),
              call("edit_latex", {
                expectedVersion: before.version,
                replacements: [
                  { find: "Clear wording", replace: "Partial change" },
                ],
              }),
              { name: "edit_document", argumentsJson: "{" },
            )
          : finish,
      usage: null,
    }),
  });
  assert.equal(assistant.assistantState().turn?.state, "failed");
  assert.deepEqual(latex.latexVersion(), before);
});

test("nested transaction failures roll back inner writes and leave outer transaction usable", () => {
  store.transaction(() => {
    store.putSetting("outer-test", "kept");
    assert.throws(
      () =>
        store.transaction(() => {
          store.putSetting("inner-test", "bad");
          throw new Error("rollback");
        }),
      /rollback/,
    );
    assert.equal(store.setting("inner-test", null), null);
  });
  assert.equal(store.setting("outer-test", null), "kept");
});

test("New chat clears history and focus while preserving saved work and quoted profile evidence", async () => {
  const before = {
    profile: store.getProfile(),
    latex: latex.latexVersion(),
    cv: store.listCvVersions(),
    jobs: store.listJobs(),
    letters: store.listCoverLetterVersions(store.listJobs()[0].id),
    changes: store.db
      .prepare(
        "SELECT revision,previous_revision,document FROM profile_changes ORDER BY revision",
      )
      .all(),
  };
  assert.ok(before.changes.length);
  assert.ok(chat.profileMessages().length > 1);
  const oldTurn = assistant.assistantState().turn!;
  const response = await app.inject({
    method: "POST",
    url: "/api/assistant/new",
  });
  assert.equal(response.statusCode, 200, response.body);
  const state = response.json();
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].kind, "assistant-intro");
  assert.equal(state.turn, null);
  assert.equal(state.focus, null);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM assistant_steps").get()!.n,
    0,
  );
  assert.deepEqual(store.getProfile(), before.profile);
  assert.deepEqual(latex.latexVersion(), before.latex);
  assert.deepEqual(store.listCvVersions(), before.cv);
  assert.deepEqual(store.listJobs(), before.jobs);
  assert.deepEqual(
    store.listCoverLetterVersions(before.jobs[0].id),
    before.letters,
  );
  assert.deepEqual(
    store.db
      .prepare(
        "SELECT revision,previous_revision,document FROM profile_changes ORDER BY revision",
      )
      .all(),
    before.changes,
  );
  assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.throws(() => chat.retryProfileTurn(oldTurn.id), /not found/);
  assert.equal(assistant.startAssistant().messages.length, 1);
  assistant.enqueueAssistantMessage("Fresh question", randomUUID(), {
    page: "jobs",
  });
  await assistant.processAssistantTurn({
    check: ready,
    infer: async (prompt) => {
      assert.ok(!prompt.includes("Edit my CV and template."));
      return { result: finish, usage: null };
    },
  });
  assert.equal(assistant.assistantState().turn?.state, "complete");
});

test("New chat rejects queued replies and cancelled replies still unwinding in the worker", async () => {
  const turn = assistant.enqueueAssistantMessage(
    "Pending question",
    randomUUID(),
    { page: "profile" },
  );
  const before = assistant.assistantState();
  const response = await app.inject({
    method: "POST",
    url: "/api/assistant/new",
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(assistant.assistantState(), before);
  await assistant.processAssistantTurn({
    check: ready,
    infer: async () => {
      assert.throws(() => assistant.newAssistantChat(), /still working/);
      chat.cancelProfileTurn(turn.id);
      assert.throws(() => assistant.newAssistantChat(), /still working/);
      return { result: finish, usage: null };
    },
  });
  assert.equal(assistant.newAssistantChat().turn, null);
  assert.equal(assistant.assistantState().messages.length, 1);
});

test("read-only answers have no automatic save footer", async () => {
  assistant.enqueueAssistantMessage(
    "Explain how the assistant works.",
    randomUUID(),
    { page: "jobs" },
  );
  await assistant.processAssistantTurn({
    check: ready,
    infer: async () => ({
      result: {
        done: true,
        reply: "I can research your public project references.",
        calls: [],
      },
      usage: null,
    }),
  });
  assert.equal(
    assistant.assistantState().messages.at(-1)?.content,
    "I can research your public project references.",
  );
});
