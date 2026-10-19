import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-pi-test-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = "";
const store = await import("../core/db/index.ts");
const { credentials } = await import("../core/ai/pi-credentials.ts");
const { infer, models, checkAi, finalResponseText } =
  await import("../core/ai/pi.ts");
const credential = {
  type: "oauth" as const,
  access: "synthetic-access",
  refresh: "synthetic-refresh",
  expires: Date.now() + 3600000,
};
after(() => {
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});
test("subscription-only credentials persist privately and serialize writes across processes", async () => {
  process.env.OPENAI_API_KEY = "must-not-be-used";
  assert.equal(await models.checkAuth("openai"), undefined);
  assert.equal((await checkAi()).state, "signed_out");
  await credentials.modify("openai", async () => ({
    ...credential,
    counter: 0,
  }));
  if (process.platform !== "win32")
    assert.equal(
      statSync(join(directory, "pi-auth/credentials.json")).mode & 0o777,
      0o600,
    );
  const child = () =>
    new Promise<void>((resolve, reject) => {
      const process = spawn(
        globalThis.process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `const {credentials}=await import('./core/ai/pi-credentials.ts'); await credentials.modify('openai',async value=>{await new Promise(r=>setTimeout(r,80));return {...value,counter:Number(value.counter)+1};});`,
        ],
        { env: globalThis.process.env, stdio: ["ignore", "ignore", "pipe"] },
      );
      let errors = "";
      process.stderr.on("data", (chunk) => (errors += chunk));
      process.on("error", reject);
      process.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(errors)),
      );
    });
  await Promise.all([child(), child(), child()]);
  assert.equal((await credentials.read("openai"))?.counter, 3);
  delete process.env.OPENAI_API_KEY;
});
test("production inference sends the exact model, schema and images; limits surface without retry or fallback", async () => {
  let requests = 0;
  const fetcher: typeof fetch = async (url, options) => {
    requests++;
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, "gpt-5.6-sol");
    assert.equal(body.reasoning.effort, "high");
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    assert.ok(!body.tools?.length);
    assert.equal(body.text.format.type, "json_schema");
    assert.ok(
      JSON.stringify(body.input).includes("data:image/png;base64,c3ludGhldGlj"),
    );
    return new Response(
      JSON.stringify({
        error: {
          code: "subscription_sharing_usage_limit_exceeded",
          message: "private-error-body",
        },
      }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
  };
  await assert.rejects(
    infer(
      "Synthetic prompt",
      { type: "object", properties: {}, additionalProperties: false },
      {
        fetch: fetcher,
        images: [
          { name: "image.png", mediaType: "image/png", data: "c3ludGhldGlj" },
        ],
      },
    ),
    /subscription allowance/,
  );
  assert.equal(requests, 1);
  assert.ok(store.lease("codex-inference", "test-lock", 1000));
  await assert.rejects(infer("x", {}), /Another model/);
  store.release("codex-inference", "test-lock");
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(infer("x", {}, { signal: cancelled.signal }));
  await credentials.delete("openai");
  assert.equal((await checkAi()).state, "signed_out");
});

test("structured responses use the final answer without commentary or reasoning", () => {
  const text = (value: string, phase?: string) => ({
    type: "text",
    text: value,
    ...(phase
      ? { textSignature: JSON.stringify({ v: 1, id: "synthetic", phase }) }
      : {}),
  });
  assert.deepEqual(
    JSON.parse(
      finalResponseText([
        text('{"done":false}', "commentary"),
        text('{"done":true}', "final_answer"),
      ]),
    ),
    { done: true },
  );
  assert.equal(
    finalResponseText([{ type: "thinking" }, text('{"answer":"ok"}')]),
    '{"answer":"ok"}',
  );
  assert.throws(
    () => finalResponseText([text('{"done":true}', "commentary")]),
    /final answer/,
  );
  assert.throws(() =>
    JSON.parse(finalResponseText([text("invalid", "final_answer")])),
  );
});
