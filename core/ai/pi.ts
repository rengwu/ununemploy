import { randomUUID } from "node:crypto";
import { createModels, openaiProvider, contentText } from "./pi-sdk.ts";
import { credentials } from "./pi-credentials.ts";
import { config } from "../config.ts";
import { lease, release } from "../db/index.ts";
import type { InferenceImage } from "../assistant/attachment-types.ts";

export const models = createModels({
  credentials,
  authContext: { env: async () => undefined, fileExists: async () => false },
});
const provider = openaiProvider();
delete provider.auth!.apiKey;
models.setProvider(provider);
class AiRequestError extends Error {}
// Only completed responses with unusable application output are repairable.
// Authentication, allowance, transport and cancellation errors are never retried.
export class StructuredResponseError extends AiRequestError {
  constructor(
    message: string,
    readonly usage?: unknown,
  ) {
    super(message);
  }
}
export function inferenceError(message: string) {
  if (
    /subscription_sharing_usage_limit|usage.limit|rate.limit|quota|429/i.test(
      message,
    )
  )
    return "Your ChatGPT subscription allowance is unavailable. Retry after it resets.";
  if (/401|403|auth|token|credential|sign.in/i.test(message))
    return "The ChatGPT connection is unavailable. Sign in again in Settings → AI.";
  if (/model.*(?:not|unavail|access)|model_not_found/i.test(message))
    return "The requested model is unavailable through this ChatGPT subscription. No fallback was used.";
  if (/abort|cancel/i.test(message)) return "Assistant request cancelled.";
  if (/timeout|timed.out/i.test(message))
    return "The model request timed out. Retry when ready.";
  return "The model request did not complete. Retry or check the ChatGPT connection.";
}
export async function checkAi() {
  try {
    if (!(await credentials.read("openai")))
      return {
        state: "signed_out",
        message: "Sign in with ChatGPT in Settings → AI.",
      };
    const auth = await models.getAuth("openai", {
      signal: AbortSignal.timeout(20000),
    });
    if (!auth?.auth.apiKey)
      return {
        state: "signed_out",
        message: "Sign in with ChatGPT in Settings → AI.",
      };
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${auth.auth.apiKey}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      return {
        state: "unavailable",
        message: inferenceError(String(response.status)),
      };
    const catalog = (await response.json()) as { models?: { slug: string }[] };
    if (!catalog.models?.some((m) => m.slug === config.model))
      return {
        state: "unavailable",
        message:
          "The requested model is unavailable through this ChatGPT subscription. No fallback was used.",
      };
    return { state: "ready", message: "" };
  } catch {
    return {
      state: "unavailable",
      message:
        "Could not verify the ChatGPT connection. Check connection or sign in again in Settings → AI.",
    };
  }
}
// Responses can include commentary before the final structured answer. Those
// messages are distinct outputs, not fragments of the final JSON document.
export function finalResponseText(
  content: { type: string; text?: string; textSignature?: string }[],
) {
  const blocks = content.filter((part) => part.type === "text");
  const phase = (part: (typeof blocks)[number]) => {
    try {
      const signature = JSON.parse(part.textSignature || "null");
      return signature?.v === 1 ? signature.phase : undefined;
    } catch {
      return undefined;
    }
  };
  const final = blocks.filter((part) => phase(part) === "final_answer");
  if (final.length) return final.map((part) => part.text || "").join("\n");
  if (blocks.some((part) => phase(part) === "commentary"))
    throw new StructuredResponseError(
      "The model did not return a final answer. Retry when ready.",
    );
  return contentText(
    blocks.map((part) => ({ type: "text" as const, text: part.text || "" })),
  );
}
export async function infer<T>(
  prompt: string,
  schema: object,
  options: {
    signal?: AbortSignal;
    images?: InferenceImage[];
    fetch?: typeof fetch;
  } = {},
): Promise<{ result: T; usage: unknown }> {
  options.signal?.throwIfAborted();
  const owner = randomUUID();
  // Keep the existing lease so old and new workers cannot run inference together.
  if (!lease("codex-inference", owner, 300000))
    throw new Error("Another model generation is running.");
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(240000),
    ...(options.signal ? [options.signal] : []),
  ]);
  const heartbeat = setInterval(() => {
    if (!lease("codex-inference", owner, 300000)) controller.abort();
  }, 30000);
  try {
    const model = models.getModel("openai", config.model);
    if (!model || config.reasoning !== "high")
      throw new AiRequestError(
        "The requested model and high reasoning configuration are required.",
      );
    if (!(await credentials.read("openai")))
      throw new AiRequestError("Sign in with ChatGPT in Settings → AI.");
    const answer = await models.complete(
      model,
      {
        messages: [
          {
            role: "user",
            timestamp: Date.now(),
            content: [
              { type: "text", text: prompt },
              ...(options.images || []).map((image) => ({
                type: "image" as const,
                data: image.data,
                mimeType: image.mediaType,
              })),
            ],
          },
        ],
      },
      {
        signal,
        fetch: options.fetch,
        reasoningEffort: "high",
        maxRetries: 0,
        timeoutMs: 240000,
        onPayload: (payload) => ({
          ...(payload as object),
          text: {
            format: {
              type: "json_schema",
              name: "ununemploy",
              strict: true,
              schema,
            },
          },
        }),
      },
    );
    signal.throwIfAborted();
    if (answer.stopReason !== "stop")
      throw new AiRequestError(
        inferenceError(answer.errorMessage || answer.stopReason),
      );
    let text: string;
    try {
      text = finalResponseText(answer.content);
    } catch (error) {
      if (error instanceof StructuredResponseError)
        throw new StructuredResponseError(error.message, answer.usage);
      throw error;
    }
    if (text.length > 2000000)
      throw new AiRequestError(
        "The model returned too much output. Ask for a smaller change.",
      );
    try {
      return { result: JSON.parse(text) as T, usage: answer.usage };
    } catch {
      throw new StructuredResponseError(
        "The model returned an invalid structured response. Retry when ready.",
        answer.usage,
      );
    }
  } catch (error) {
    if (signal.aborted)
      throw new Error(
        options.signal?.aborted
          ? "Assistant request cancelled."
          : "The model request timed out or was interrupted. Retry when ready.",
      );
    // SDK errors may contain HTTP bodies. Only expose fixed app messages.
    const message = error instanceof Error ? error.message : "";
    if (error instanceof AiRequestError) throw error;
    throw new Error(inferenceError(message));
  } finally {
    clearInterval(heartbeat);
    release("codex-inference", owner);
  }
}
