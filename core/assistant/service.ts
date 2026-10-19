import {
  attachmentMetadata,
  attachmentContext,
  bindAttachments,
} from "./attachments.ts";
import type { InferenceImage } from "./attachment-types.ts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as store from "../db/index.ts";
import { config } from "../config.ts";
import { checkAi, infer } from "../ai/pi.ts";
import {
  enqueueProfileMessage,
  profileMessages,
  latestProfileTurn,
  type ProfileTurn,
} from "../profile/chat.ts";
import { profileReadiness, profileWelcome } from "../profile/facts.ts";
import { AssistantActions, type ActionDependencies } from "./actions.ts";
import { assistantPrompt } from "./prompt.ts";
import {
  contextSchema,
  stepSchema,
  type AssistantContext,
  type Receipt,
} from "./types.ts";

export type AssistantInference = (
  prompt: string,
  schema: object,
  options?: { signal?: AbortSignal; images?: InferenceImage[] },
) => Promise<{ result: unknown; usage: unknown }>;
export type AssistantTurn = ProfileTurn & {
  engine: string;
  context: AssistantContext;
  activity: string | null;
  receipts: Receipt[];
};
function turnDetail(id: string): AssistantTurn {
  const row = store.db
    .prepare(
      "SELECT engine,context,activity,receipts FROM profile_turns WHERE id=?",
    )
    .get(id)!;
  const turn = store.db
    .prepare(
      "SELECT id,user_message_id AS userMessageId,state,expected_revision AS expectedRevision,error,created_at AS createdAt,updated_at AS updatedAt,result_revision AS resultRevision FROM profile_turns WHERE id=?",
    )
    .get(id) as ProfileTurn;
  return {
    ...turn,
    engine: String(row.engine),
    context: contextSchema.parse(JSON.parse(String(row.context))),
    activity: row.activity as string | null,
    receipts: JSON.parse(String(row.receipts)),
  };
}
export function assistantState() {
  const latest = latestProfileTurn();
  const attachments = attachmentMetadata();
  const messages = profileMessages().map((message) => ({
    ...message,
    attachments: attachments.filter((a) => a.messageId === message.id),
  }));
  return {
    messages,
    turn: latest ? turnDetail(latest.id) : null,
    focus: store.setting<AssistantContext | null>("assistantFocus", null),
    profileRevision: store.getProfile().revision,
  };
}
export function startAssistant() {
  store.transaction(() => {
    if (
      !store.db
        .prepare(
          "SELECT id FROM profile_messages WHERE kind='assistant-intro' LIMIT 1",
        )
        .get()
    ) {
      const profile = store.getProfile();
      const text = profileReadiness(profile).ready
        ? "I can help you find jobs, update your profile, edit your LaTeX CV, and rewrite saved cover letters. Tell me what you’d like to work on."
        : profileWelcome(profile);
      store.db
        .prepare("INSERT INTO profile_messages VALUES (?,?,?,?,?,?)")
        .run(
          randomUUID(),
          "assistant",
          text,
          store.now(),
          null,
          "assistant-intro",
        );
    }
  });
  return assistantState();
}
export function enqueueAssistantMessage(
  content: string,
  clientId: string,
  rawContext: unknown,
  attachmentIds: string[] = [],
) {
  const context = contextSchema.parse(rawContext);
  return store.transaction(() => {
    const existing = store.db
      .prepare("SELECT id FROM profile_turns WHERE user_message_id=?")
      .get(clientId);
    const turn = enqueueProfileMessage(
      content,
      clientId,
      store.getProfile().revision,
    );
    if (existing) {
      const linked = attachmentMetadata()
        .filter((a) => a.messageId === clientId)
        .map((a) => a.id)
        .sort();
      if (JSON.stringify(linked) !== JSON.stringify([...attachmentIds].sort()))
        throw new Error(
          "This message was already sent with different attachments.",
        );
    }
    bindAttachments(attachmentIds, clientId);
    if (!existing)
      store.db
        .prepare(
          "UPDATE profile_turns SET engine='assistant',context=? WHERE id=?",
        )
        .run(JSON.stringify(context), turn.id);
    return turnDetail(turn.id);
  });
}
export function newAssistantChat() {
  return store.transaction(() => {
    const owner = randomUUID();
    // A cancelled turn may still be unwinding in the worker. Keep its records
    // until it releases the shared chat lease, including for legacy turns.
    if (!store.lease("profile-chat", owner, 300000))
      throw new Error(
        "The assistant is still working. Wait for it to stop, then try New chat again.",
      );
    try {
      if (
        store.db
          .prepare(
            "SELECT id FROM profile_turns WHERE state IN ('queued','running') LIMIT 1",
          )
          .get()
      )
        throw new Error(
          "Wait for the assistant or stop its reply before starting a new chat.",
        );
      // Preserve saved revisions and their quoted evidence while removing the
      // optional link to the conversation that the user chose to clear.
      store.db.exec(`
        UPDATE profile_changes SET message_id=NULL WHERE message_id IS NOT NULL;
        DELETE FROM assistant_attachments;
        DELETE FROM assistant_steps;
        DELETE FROM profile_turns;
        DELETE FROM profile_messages;
      `);
      store.putSetting("assistantFocus", null);
      return startAssistant();
    } finally {
      store.release("profile-chat", owner);
    }
  });
}
const activities: Record<string, string> = {
  search_jobs: "Searching collected jobs…",
  read_job: "Reading job details…",
  read_profile: "Reading profile facts…",
  read_document: "Reading the document…",
  read_reference: "Reading a public reference…",
  edit_profile: "Preparing profile changes…",
  edit_latex: "Editing the LaTeX CV…",
  edit_document: "Editing the document…",
  preview_latex: "Checking the PDF preview…",
};
export async function processAssistantTurn(
  deps: ActionDependencies & {
    infer?: AssistantInference;
    check?: typeof checkAi;
  } = {},
): Promise<boolean> {
  const owner = randomUUID();
  if (!store.lease("profile-chat", owner, 300000)) return false;
  const heartbeat = setInterval(
    () => store.lease("profile-chat", owner, 300000),
    30000,
  );
  let cancelCheck: NodeJS.Timeout | undefined;
  try {
    const row = store.db
      .prepare(
        "SELECT id FROM profile_turns WHERE state='queued' AND engine='assistant' ORDER BY rowid LIMIT 1",
      )
      .get();
    if (!row) return false;
    const turn = turnDetail(String(row.id));
    if (turn.expectedRevision !== store.getProfile().revision) {
      store.db
        .prepare(
          "UPDATE profile_turns SET state='conflict',error=?,updated_at=? WHERE id=?",
        )
        .run(
          "The profile changed while this message was queued. Review the current facts, then retry.",
          store.now(),
          turn.id,
        );
      return true;
    }
    const health = await (deps.check || checkAi)();
    if (turnDetail(turn.id).state !== "queued") return true;
    if (health.state !== "ready") {
      store.putSetting("aiStatus", {
        ...health,
        model: config.model,
        reasoning: config.reasoning,
        checkedAt: store.now(),
      });
      store.db
        .prepare(
          "UPDATE profile_turns SET state='paused',error=?,activity=NULL,updated_at=? WHERE id=?",
        )
        .run(health.message, store.now(), turn.id);
      return true;
    }
    store.db
      .prepare(
        "UPDATE profile_turns SET state='running',error=NULL,activity='Thinking…',updated_at=? WHERE id=?",
      )
      .run(store.now(), turn.id);
    const controller = new AbortController();
    cancelCheck = setInterval(() => {
      if (turnDetail(turn.id).state !== "running") controller.abort();
    }, 250);
    const history = profileMessages(),
      message = history.find((m) => m.id === turn.userMessageId)!;
    const attachments = attachmentContext(history.map((m) => m.id));
    const actions = new AssistantActions(
      message,
      history,
      turn.context,
      controller.signal,
      deps,
      attachments.sources.filter(
        (s) => !s.text.startsWith("Image supplied by the user."),
      ),
    );
    const steps: unknown[] = [],
      usages: unknown[] = [];
    let sequence = Number(
      store.db
        .prepare(
          "SELECT COALESCE(MAX(sequence),0) AS n FROM assistant_steps WHERE turn_id=?",
        )
        .get(turn.id)!.n,
    );
    let focus = store.setting<AssistantContext | null>("assistantFocus", null);
    try {
      for (let round = 0; round < 10; round++) {
        controller.signal.throwIfAborted();
        store.db
          .prepare("UPDATE profile_turns SET activity='Thinking…' WHERE id=?")
          .run(turn.id);
        const output = await (deps.infer || infer)(
          assistantPrompt({
            profile: actions.profile,
            context: turn.context,
            focus,
            message,
            history,
            steps,
            attachments: attachments.sources,
            allowedUrls: [...actions.allowedUrls],
          }),
          z.toJSONSchema(stepSchema),
          { signal: controller.signal, images: attachments.images },
        );
        if (turnDetail(turn.id).state !== "running") return true;
        usages.push(output.usage);
        const step = stepSchema.parse(output.result);
        if (step.done) {
          if (step.calls.length)
            throw new Error(
              "The assistant returned actions after finishing. No changes were saved.",
            );
          store.db
            .prepare(
              "UPDATE profile_turns SET activity='Checking and saving changes…' WHERE id=?",
            )
            .run(turn.id);
          await actions.prepare();
          if (turnDetail(turn.id).state !== "running") return true;
          store.transaction(() => {
            if (turnDetail(turn.id).state !== "running")
              throw new Error("Assistant request cancelled.");
            const receipts = actions.commit();
            const suffix = receipts.length
              ? "\n\n" +
                receipts
                  .map(
                    (r) =>
                      `- Saved [${r.label}](${r.href}), ${r.kind === "profile" ? "revision" : "version"} ${r.version}.${r.preview === "compiled" ? " PDF compiled successfully." : r.preview === "rendered" ? " HTML preview rendered." : r.preview === "failed" ? ` PDF preview failed: ${r.warning} The previous preview is preserved.` : ""}`,
                  )
                  .join("\n")
              : "";
            store.db
              .prepare("INSERT INTO profile_messages VALUES (?,?,?,?,?,?)")
              .run(
                randomUUID(),
                "assistant",
                (step.reply.trim() || "Done.") + suffix,
                store.now(),
                turn.id,
                "chat",
              );
            store.db
              .prepare(
                "UPDATE profile_turns SET state='complete',result_revision=?,receipts=?,usage=?,activity=NULL,updated_at=? WHERE id=?",
              )
              .run(
                store.getProfile().revision,
                JSON.stringify(receipts),
                JSON.stringify(usages),
                store.now(),
                turn.id,
              );
            if (actions.focus)
              store.putSetting("assistantFocus", actions.focus);
          });
          store.putSetting("aiStatus", {
            state: "ready",
            model: config.model,
            reasoning: config.reasoning,
            checkedAt: store.now(),
          });
          return true;
        }
        if (!step.calls.length)
          throw new Error(
            "The assistant returned no next action. Retry your message; no changes were saved.",
          );
        for (const call of step.calls) {
          if (turnDetail(turn.id).state !== "running") return true;
          store.db
            .prepare(
              "UPDATE profile_turns SET activity=?,updated_at=? WHERE id=?",
            )
            .run(activities[call.name], store.now(), turn.id);
          let result: unknown;
          try {
            result = await actions.execute(
              call.name,
              JSON.parse(call.argumentsJson),
            );
            actions.failures.delete(`malformed:${call.name}`);
          } catch (error) {
            controller.signal.throwIfAborted();
            const message =
              error instanceof Error ? error.message : "Action failed.";
            if (error instanceof SyntaxError && call.name.startsWith("edit_"))
              actions.failures.set(`malformed:${call.name}`, message);
            result = { error: message };
          }
          if (turnDetail(turn.id).state !== "running") return true;
          steps.push({
            action: call.name,
            arguments: call.argumentsJson,
            result,
          });
          store.db
            .prepare("INSERT INTO assistant_steps VALUES (?,?,?,?,?,?)")
            .run(
              turn.id,
              ++sequence,
              call.name,
              call.argumentsJson,
              JSON.stringify(result),
              store.now(),
            );
          focus = actions.focus || focus;
        }
      }
      throw new Error(
        "This request reached the action limit. No changes were saved. Retry with a smaller task.",
      );
    } catch (error) {
      if (turnDetail(turn.id).state !== "running") return true;
      const message =
        error instanceof z.ZodError
          ? "The assistant returned invalid fields. No changes were saved. Retry or clarify the request."
          : error instanceof Error
            ? error.message
            : "Assistant request failed. No changes were saved.";
      const state = /Another model generation/.test(message)
        ? "queued"
        : /changed in another window/.test(message)
          ? "conflict"
          : /subscription|sign.in|cannot use|not installed/i.test(message)
            ? "paused"
            : "failed";
      store.db
        .prepare(
          "UPDATE profile_turns SET state=?,error=?,activity=NULL,usage=?,updated_at=? WHERE id=?",
        )
        .run(state, message, JSON.stringify(usages), store.now(), turn.id);
      if (state === "paused")
        store.putSetting("aiStatus", {
          state,
          message,
          model: config.model,
          reasoning: config.reasoning,
          checkedAt: store.now(),
        });
    }
    return true;
  } finally {
    clearInterval(heartbeat);
    clearInterval(cancelCheck);
    store.release("profile-chat", owner);
  }
}
