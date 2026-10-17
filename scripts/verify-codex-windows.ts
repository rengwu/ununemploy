// Uses a small amount of the signed-in ChatGPT subscription allowance.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const directory = await mkdtemp(
  join(tmpdir(), "ununemploy-codex-verification-"),
);
process.env.JH_DATA_DIR = directory;
delete process.env.JH_PROFILE_SEED;
process.env.JH_CODEX_BIN = resolve(
  "build/desktop/windows/resources/codex/bin/codex.exe",
);
process.env.JH_CODEX_MODEL = "gpt-5.6-sol";
process.env.JH_CODEX_REASONING_EFFORT = "high";
const { checkCodex, infer } = await import("../core/ai/codex.ts");
const { db } = await import("../core/db/index.ts");
try {
  assert.equal(
    (await checkCodex()).state,
    "ready",
    "Sign in with ChatGPT using the official Codex runtime first.",
  );
  const generated = await infer<{ ok: boolean }>(
    "This is a synthetic runtime verification. Return the JSON object with ok set to true. Do not use tools.",
    {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
      additionalProperties: false,
    },
  );
  assert.deepEqual(generated.result, { ok: true });
  const results = {
    checkedAt: new Date().toISOString(),
    model: "gpt-5.6-sol",
    reasoning: "high",
    authentication: "ChatGPT",
    result: "Passed",
    usage: generated.usage,
  };
  await mkdir(".local-data/verification/windows", { recursive: true });
  await writeFile(
    ".local-data/verification/windows/codex.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    "Passed: bundled official Codex, ChatGPT authentication, gpt-5.6-sol high, structured response.",
  );
} finally {
  db.close();
  await rm(directory, { recursive: true, force: true });
}
