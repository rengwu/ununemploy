import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { models } from "../core/ai/pi.ts";
import { credentials, hostId } from "../core/ai/pi-credentials.ts";
import { refreshAiStatus } from "../core/ai/generate.ts";
let connection: {
  state: string;
  url?: string;
  message?: string;
  manual?: boolean;
} = { state: "idle" };
let controller: AbortController | undefined;
let manual: ((value: string) => void) | undefined;
let active: Promise<void> | undefined;
export function registerAiAuth(app: FastifyInstance) {
  app.get("/api/ai/connection", async (_req, reply) =>
    reply.header("Cache-Control", "no-store").send(connection),
  );
  app.post("/api/ai/connect", async () => {
    if (active) return connection;
    controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(900000),
    ]);
    connection = { state: "connecting" };
    active = (async () => {
      try {
        const id = await hostId();
        await models.login(
          "openai",
          "oauth",
          {
            signal,
            notify(event) {
              if (event.type === "auth_url") {
                const url = new URL(event.url);
                if (
                  url.protocol !== "https:" ||
                  url.hostname !== "auth.openai.com"
                )
                  throw new Error("Unexpected sign-in destination.");
                connection = {
                  state: "connecting",
                  url: event.url,
                  manual: true,
                };
              }
            },
            prompt(prompt) {
              if (prompt.type !== "manual_code")
                return Promise.reject(new Error("Unsupported sign-in prompt."));
              return new Promise((resolve, reject) => {
                manual = resolve;
                const cancellation = prompt.signal || signal;
                const cancel = () => {
                  manual = undefined;
                  reject(new Error("Cancelled"));
                };
                if (cancellation.aborted) cancel();
                else
                  cancellation.addEventListener("abort", cancel, {
                    once: true,
                  });
              });
            },
          },
          { agentName: "ununemploy", getDeviceId: () => id },
        );
        const status = await refreshAiStatus();
        connection = { state: status.state, message: status.message };
      } catch (error) {
        connection = {
          state: "failed",
          message: signal.aborted
            ? "Sign-in was cancelled or timed out. Try again."
            : /Port 1455/.test(error instanceof Error ? error.message : "")
              ? "Another sign-in is using port 1455. Finish or cancel it, then try again."
              : "ChatGPT sign-in failed. Try again.",
        };
      } finally {
        controller = undefined;
        manual = undefined;
        active = undefined;
      }
    })();
    return connection;
  });
  app.post("/api/ai/connect/callback", async (req) => {
    const { url } = z
      .object({ url: z.string().min(1).max(8192) })
      .parse(req.body);
    if (!manual) throw new Error("Start Sign in with ChatGPT first.");
    manual(url);
    manual = undefined;
    return { ok: true };
  });
  app.post("/api/ai/connect/cancel", async () => {
    controller?.abort();
    await active;
    return { ok: true };
  });
  app.post("/api/ai/disconnect", async () => {
    controller?.abort();
    await active;
    await credentials.delete("openai");
    connection = { state: "idle" };
    return refreshAiStatus();
  });
  app.addHook("onClose", async () => {
    controller?.abort();
    await active;
  });
}
