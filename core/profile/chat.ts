import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as store from "../db/index.ts";
import { profileSchema, type Profile } from "../types.ts";
import { profileMarkdown, profileReadiness } from "./facts.ts";

export type ProfileMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  turnId: string | null;
  kind: string;
};
export type ProfileTurn = {
  id: string;
  userMessageId: string;
  state:
    | "queued"
    | "running"
    | "complete"
    | "paused"
    | "failed"
    | "cancelled"
    | "conflict";
  expectedRevision: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  resultRevision: number | null;
};
const turnFields =
  "id, user_message_id AS userMessageId, state, expected_revision AS expectedRevision, error, created_at AS createdAt, updated_at AS updatedAt, result_revision AS resultRevision";
export const profileReplySchema = z
  .object({
    reply: z.string().trim().min(1).max(12000),
    edits: z
      .array(
        z
          .object({
            op: z.enum(["set", "remove"]),
            path: z.string().max(300),
            valueJson: z.string().max(40000),
            evidenceQuote: z.string().trim().min(1).max(16000),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();
export type ProfileReply = z.infer<typeof profileReplySchema>;
export function profileMessages(): ProfileMessage[] {
  return store.db
    .prepare(
      "SELECT id,role,content,created_at AS createdAt,turn_id AS turnId,kind FROM profile_messages ORDER BY rowid",
    )
    .all() as ProfileMessage[];
}
export function latestProfileTurn(): ProfileTurn | null {
  return (
    (store.db
      .prepare(
        `SELECT ${turnFields} FROM profile_turns ORDER BY rowid DESC LIMIT 1`,
      )
      .get() as ProfileTurn) || null
  );
}
function getTurn(id: string) {
  return store.db
    .prepare(`SELECT ${turnFields} FROM profile_turns WHERE id=?`)
    .get(id) as ProfileTurn | undefined;
}
export function profileState() {
  const profile = store.getProfile();
  return {
    profile,
    markdown: profileMarkdown(profile),
    readiness: profileReadiness(profile),
    messages: profileMessages(),
    turn: latestProfileTurn(),
    versions: store.db
      .prepare(
        "SELECT revision,created_at AS createdAt FROM profile_versions ORDER BY revision DESC LIMIT 30",
      )
      .all() as { revision: number; createdAt: string }[],
    changes: store.db
      .prepare(
        "SELECT revision,document FROM profile_changes ORDER BY revision DESC LIMIT 1",
      )
      .all()
      .map((r) => ({
        revision: Number(r.revision),
        edits: JSON.parse(r.document as string) as {
          path: string;
          evidenceQuote: string;
        }[],
      })),
  };
}
export function enqueueProfileMessage(
  content: string,
  clientId: string,
  expectedRevision: number,
) {
  return store.transaction(() => {
    const duplicate = store.db
      .prepare(
        `SELECT ${turnFields} FROM profile_turns WHERE user_message_id=?`,
      )
      .get(clientId) as ProfileTurn | undefined;
    if (duplicate) {
      const message = store.db
        .prepare("SELECT content FROM profile_messages WHERE id=?")
        .get(clientId);
      if (message?.content !== content)
        throw new Error("This message identifier is already in use.");
      return duplicate;
    }
    if (store.getProfile().revision !== expectedRevision)
      throw new Error(
        "The profile changed in another window. Review the current facts and send again.",
      );
    if (
      store.db
        .prepare(
          "SELECT id FROM profile_turns WHERE state IN ('queued','running')",
        )
        .get()
    )
      throw new Error(
        "An assistant reply is already pending. Wait or stop it before sending another message.",
      );
    const id = randomUUID(),
      at = store.now();
    store.db
      .prepare("INSERT INTO profile_messages VALUES (?,?,?,?,?,?)")
      .run(clientId, "user", content, at, id, "chat");
    store.db
      .prepare(
        "INSERT INTO profile_turns (id,user_message_id,state,expected_revision,created_at,updated_at,engine) VALUES (?,?,'queued',?,?,?,'assistant')",
      )
      .run(id, clientId, expectedRevision, at, at);
    return getTurn(id)!;
  });
}
export function cancelProfileTurn(id: string) {
  const turn = getTurn(id);
  if (!turn) throw new Error("Profile turn not found.");
  store.db
    .prepare(
      "UPDATE profile_turns SET state='cancelled',error=NULL,updated_at=? WHERE id=? AND state IN ('queued','running','paused','failed','conflict')",
    )
    .run(store.now(), id);
  return getTurn(id)!;
}
export function retryProfileTurn(id: string) {
  return store.transaction(() => {
    const turn = getTurn(id);
    if (!turn) throw new Error("Profile turn not found.");
    if (turn.id !== latestProfileTurn()?.id)
      throw new Error("Send a new message to revisit an earlier request.");
    if (!["paused", "failed", "conflict", "cancelled"].includes(turn.state))
      return turn;
    store.db
      .prepare(
        "UPDATE profile_turns SET state='queued',error=NULL,expected_revision=?,updated_at=? WHERE id=?",
      )
      .run(store.getProfile().revision, store.now(), id);
    return getTurn(id)!;
  });
}
export function recoverProfileTurns() {
  store.db
    .prepare(
      "UPDATE profile_turns SET state='paused',error=?,updated_at=? WHERE state='running'",
    )
    .run(
      "The assistant was interrupted by a restart. Retry to continue.",
      store.now(),
    );
}
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
function safeValue(value: unknown): void {
  if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) throw new Error("Invalid profile field.");
      safeValue(child);
    }
}
export function applyProfileEdits(
  profile: Profile,
  raw: unknown,
  userMessage: ProfileMessage,
  evidence: { id: string; text: string; url?: string }[] = [],
): { profile: Profile; result: ProfileReply } {
  const result = profileReplySchema.parse(raw),
    next = structuredClone(profile);
  const sourceId = `profile-chat:${userMessage.id}`;
  for (const edit of result.edits) {
    if (
      !userMessage.content.includes(edit.evidenceQuote) &&
      !evidence.some((e) => e.text.includes(edit.evidenceQuote))
    )
      throw new Error(
        "A profile change was not supported by a quote from your message. No facts were changed.",
      );
    const parts = edit.path
      .split("/")
      .slice(1)
      .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
    const [root] = parts;
    if (
      !edit.path.startsWith("/") ||
      parts.length < 2 ||
      parts.length > 8 ||
      parts.some((s) => !s || forbiddenKeys.has(s)) ||
      ![
        "basics",
        "experience",
        "projects",
        "education",
        "awards",
        "facts",
        "preferences",
        "openItems",
      ].includes(root) ||
      (root === "basics" && parts[1] === "sources")
    )
      throw new Error(
        "The assistant attempted an unsupported profile change. No facts were changed.",
      );
    if (root === "facts" && !next.facts) next.facts = [];
    let parent: any = next;
    for (const key of parts.slice(0, -1)) {
      if (
        !Object.hasOwn(parent, key) ||
        !parent[key] ||
        typeof parent[key] !== "object"
      )
        throw new Error(
          "The profile field to update does not exist. Ask for a more specific correction.",
        );
      parent = parent[key];
    }
    const key = parts.at(-1)!;
    if (
      Array.isArray(parent) &&
      key !== "-" &&
      (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= parent.length)
    )
      throw new Error("The requested profile entry does not exist.");
    if (edit.op === "remove") {
      if (key === "-" || !Object.hasOwn(parent, key))
        throw new Error("The requested profile entry does not exist.");
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    } else {
      const value = JSON.parse(edit.valueJson);
      safeValue(value);
      if (Array.isArray(parent) && key === "-") parent.push(value);
      else parent[key] = value;
    }
  }
  if (result.edits.length) {
    for (const item of evidence.filter((e) =>
      result.edits.some((edit) => e.text.includes(edit.evidenceQuote)),
    ))
      if (!next.sources.some((s) => s.id === item.id))
        next.sources.push({
          id: item.id,
          type: item.url ? "public_reference" : "user_statement",
          ...(item.url ? { url: item.url } : {}),
          description: item.text.slice(0, 40000),
        });
    next.sources.push({
      id: sourceId,
      type: "user_statement",
      description: `Profile conversation on ${userMessage.createdAt}: ${userMessage.content}`,
    });
    if (!next.basics.sources.includes(sourceId))
      next.basics.sources.push(sourceId);
  }
  return { profile: profileSchema.parse(next), result };
}
export function restoreProfile(revision: number, expectedRevision: number) {
  const row = store.db
    .prepare("SELECT document FROM profile_versions WHERE revision=?")
    .get(revision);
  if (!row) throw new Error("Profile version not found.");
  const document = store.saveProfile(
    JSON.parse(row.document as string),
    expectedRevision,
    {
      onCommit: (p) => {
        store.db.prepare("INSERT INTO profile_changes VALUES (?,?,?,?,?)").run(
          p.revision,
          expectedRevision,
          null,
          JSON.stringify([
            {
              path: "/",
              evidenceQuote: `User restored revision ${revision}`,
            },
          ]),
          store.now(),
        );
        store.db
          .prepare("INSERT INTO profile_messages VALUES (?,?,?,?,?,?)")
          .run(
            randomUUID(),
            "assistant",
            `Restored profile revision ${revision} as revision ${p.revision}.`,
            store.now(),
            null,
            "notice",
          );
      },
    },
  );
  return { revision: document.revision };
}
