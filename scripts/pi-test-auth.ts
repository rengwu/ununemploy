// Only for explicitly requested live verification in a temporary database.
import { readFile } from "node:fs/promises";
export async function connectPiFixture() {
  const path = process.env.JH_PI_VERIFY_CREDENTIALS;
  if (!path)
    throw new Error(
      "Set JH_PI_VERIFY_CREDENTIALS to a fresh app-owned Pi credential file for live verification.",
    );
  const credential = JSON.parse(await readFile(path, "utf8"));
  if (credential.type !== "oauth" || credential.expires <= Date.now() + 900000)
    throw new Error(
      "Reconnect first: this isolated check requires a token valid for more than 15 minutes.",
    );
  const { credentials } = await import("../core/ai/pi-credentials.ts");
  await credentials.modify("openai", async () => credential);
  const { models } = await import("../core/ai/pi.ts");
  const complete = models.complete.bind(models);
  const deadline = AbortSignal.timeout(600000);
  models.complete = (model, context, options) =>
    complete(model, context, {
      ...options,
      signal: AbortSignal.any([
        deadline,
        ...(options?.signal ? [options.signal] : []),
      ]),
    } as NonNullable<typeof options>);
}
