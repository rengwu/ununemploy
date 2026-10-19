import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-auth-ui-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = "";
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const { credentials } = await import("../core/ai/pi-credentials.ts");
const { app } = await import("../server/index.ts");
after(async () => {
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});
test("connection routes start and cancel OAuth without replacing credentials, then sign out locally", async () => {
  const initialRevision = store.getProfile().revision;
  const token = {
    type: "oauth" as const,
    access: "synthetic-kept-token",
    refresh: "synthetic-kept-refresh",
    expires: Date.now() + 3600000,
  };
  await credentials.modify("openai", async () => token);
  const started = await app.inject({ method: "POST", url: "/api/ai/connect" });
  assert.equal(started.statusCode, 200);
  let state = started.json();
  for (
    let index = 0;
    index < 30 && !state.url && state.state === "connecting";
    index++
  ) {
    await delay(100);
    state = (
      await app.inject({ method: "GET", url: "/api/ai/connection" })
    ).json();
  }
  assert.equal(state.state, "connecting", state.message);
  assert.equal(new URL(state.url).hostname, "auth.openai.com");
  assert.ok(!JSON.stringify(state).includes(token.access));
  const cancelled = await app.inject({
    method: "POST",
    url: "/api/ai/connect/cancel",
  });
  assert.equal(cancelled.statusCode, 200);
  assert.deepEqual(await credentials.read("openai"), token);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/ai/connect/callback",
        payload: { url: "http://localhost:1455/auth/callback?code=late" },
      })
    ).statusCode,
    400,
  );
  const signedOut = await app.inject({
    method: "POST",
    url: "/api/ai/disconnect",
  });
  assert.equal(signedOut.json().state, "signed_out");
  assert.equal(await credentials.read("openai"), undefined);
  assert.equal(store.getProfile().revision, initialRevision);
});
