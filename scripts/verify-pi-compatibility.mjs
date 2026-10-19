// Isolated, opt-in ChatGPT compatibility check. Never reads Codex credentials or appdata.
// Prepare: npm install --prefix .local-data/pi-evaluation --ignore-scripts --save-exact @earendil-works/pi-ai@1.3.0
// Run: node scripts/verify-pi-compatibility.mjs [--connect]
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(".local-data/pi-evaluation");
const sdk = join(root, "node_modules/@earendil-works/pi-ai/dist");
const { createModels } = await import(
  pathToFileURL(join(sdk, "models.js")).href
);
const { openaiProvider } = await import(
  pathToFileURL(join(sdk, "providers/openai.js")).href
);
const { InMemoryCredentialStore } = await import(
  pathToFileURL(join(sdk, "auth/credential-store.js")).href
);
const { contentText } = await import(
  pathToFileURL(join(sdk, "utils/text.js")).href
);
const version = JSON.parse(
  await readFile(join(sdk, "../package.json"), "utf8"),
).version;
assert.equal(version, "1.3.0");
const authContext = {
  env: async () => undefined,
  fileExists: async () => false,
};
function create(store) {
  const models = createModels({ credentials: store, authContext });
  const provider = openaiProvider();
  // No environment-key or API-key path can be selected in this check.
  delete provider.auth.apiKey;
  models.setProvider(provider);
  return models;
}
const modelId = "gpt-5.6-sol";
const models = create(new InMemoryCredentialStore());
const model = models.getModel("openai", modelId);
assert.ok(model);
assert.equal(model.api, "openai-responses");
assert.equal(model.thinkingLevelMap.high, "high");
assert.equal(await models.checkAuth("openai"), undefined);
const schema = {
  type: "object",
  properties: { answer: { type: "string", enum: ["ok"] } },
  required: ["answer"],
  additionalProperties: false,
};
const checks = {
  packageVersion: version,
  model: modelId,
  reasoning: "high",
  catalogModelFound: true,
  ambientBillingDisabled: true,
};
await mkdir(root, { recursive: true });
const capture = async () => {
  const store = new InMemoryCredentialStore();
  await store.modify("openai", async () => ({
    type: "oauth",
    access: "synthetic-test-token",
    refresh: "synthetic-test-refresh",
    expires: Date.now() + 3600000,
  }));
  const fixture = create(store);
  let payload;
  let requests = 0;
  const fakeFetch = async (url, init) => {
    requests++;
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    payload = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        error: {
          message: "Synthetic usage limit",
          code: "subscription_sharing_usage_limit_exceeded",
        },
      }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
  };
  const result = await fixture.complete(
    model,
    {
      messages: [
        {
          role: "user",
          content: "Return the object with answer ok.",
          timestamp: Date.now(),
        },
      ],
    },
    options({ fetch: fakeFetch }),
  );
  assert.equal(requests, 1);
  assert.equal(result.stopReason, "error");
  assert.match(
    result.errorMessage,
    /subscription_sharing_usage_limit_exceeded/,
  );
  assert.equal(payload.model, modelId);
  assert.equal(payload.reasoning.effort, "high");
  assert.equal(payload.stream, true);
  assert.equal(payload.store, false);
  assert.deepEqual(payload.text.format.schema, schema);
  assert.ok(!payload.tools?.length);
  checks.requestContract = true;
  checks.usageLimitSurfaced = true;
};
function options(extra = {}) {
  return {
    reasoningEffort: "high",
    maxRetries: 0,
    timeoutMs: 240000,
    onPayload: (payload) => ({
      ...payload,
      text: {
        format: {
          type: "json_schema",
          name: "compatibility",
          strict: true,
          schema,
        },
      },
    }),
    ...extra,
  };
}
await capture();
await writeFile(
  join(root, "offline-results.json"),
  JSON.stringify(checks, null, 2) + "\n",
);
console.log(JSON.stringify(checks));
if (!process.argv.includes("--connect")) process.exit(0);
const privateDir = join(root, "private");
await mkdir(privateDir, { recursive: true, mode: 0o700 });
const credentialsPath = join(privateDir, "credentials.json");
class Store extends InMemoryCredentialStore {
  async modify(id, fn, opts) {
    return super.modify(
      id,
      async (current) => {
        const next = await fn(current);
        opts?.signal?.throwIfAborted();
        if (next) {
          assert.equal(next.type, "oauth");
          await writeFile(credentialsPath + ".tmp", JSON.stringify(next), {
            mode: 0o600,
          });
          await rename(credentialsPath + ".tmp", credentialsPath);
        }
        return next;
      },
      opts,
    );
  }
}
const store = new Store();
try {
  const saved = JSON.parse(await readFile(credentialsPath, "utf8"));
  await store.modify("openai", async () => saved);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const runtime = create(store);
const hostPath = join(privateDir, "host-id");
try {
  await writeFile(hostPath, randomUUID(), { flag: "wx", mode: 0o600 });
} catch (e) {
  if (e.code !== "EEXIST") throw e;
}
const hostId = (await readFile(hostPath, "utf8")).trim();
let phase = "authentication";
let authUrl = "",
  state = "Preparing sign-in",
  failure = "";
const abort = new AbortController();
const timer = setTimeout(() => abort.abort(), 15 * 60 * 1000);
const escape = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const server = createServer((req, res) => {
  if (req.url !== "/") {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  });
  res.end(
    `<!doctype html><title>ununemploy Pi compatibility</title><style>body{font:15px system-ui;max-width:620px;margin:70px auto;padding:24px;background:#191919;color:#ddd}a{color:#9cc7f5}p{line-height:1.6}</style><h1>ununemploy Pi compatibility</h1><p>${escape(state)}</p><p>This isolated check connects your ChatGPT subscription through pi-ai and makes one small synthetic request using gpt-5.6-sol with high reasoning. No job, profile or CV data is sent. Your existing Codex sign-in stays unchanged.</p>${authUrl ? `<p><a href="${escape(authUrl)}" target="_blank" rel="noopener noreferrer">Sign in with ChatGPT</a></p>` : ""}${failure ? `<p>${escape(failure)}</p>` : ""}<p>After signing in, return here and refresh to see the result.</p>`,
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const pageUrl = `http://127.0.0.1:${server.address().port}/`;
await writeFile(
  join(root, "connection.json"),
  JSON.stringify({ url: pageUrl, pid: process.pid }),
);
console.log("Compatibility page: " + pageUrl);
async function verify() {
  phase = "resolve credentials";
  const auth = await runtime.getAuth("openai");
  assert.ok(auth?.auth.apiKey);
  phase = "account model discovery";
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${auth.auth.apiKey}` },
    signal: abort.signal,
  });
  assert.equal(response.status, 200, "Account model discovery failed");
  const catalog = await response.json();
  assert.ok(
    catalog.models?.some((m) => m.slug === modelId),
    "Requested model is unavailable through this ChatGPT connection; no fallback used",
  );
  phase = "structured inference";
  const answer = await runtime.complete(
    model,
    {
      messages: [
        {
          role: "user",
          content: "Return a JSON object whose answer is exactly ok.",
          timestamp: Date.now(),
        },
      ],
    },
    options({ signal: abort.signal }),
  );
  assert.equal(answer.stopReason, "stop", "Inference did not complete");
  assert.deepEqual(JSON.parse(contentText(answer.content)), { answer: "ok" });
  const reloaded = new InMemoryCredentialStore();
  await reloaded.modify("openai", async () =>
    JSON.parse(await readFile(credentialsPath, "utf8")),
  );
  assert.equal((await create(reloaded).checkAuth("openai"))?.type, "oauth");
  if (process.platform !== "win32")
    assert.equal((await stat(credentialsPath)).mode & 0o777, 0o600);
  checks.authenticatedModelAvailable = true;
  checks.structuredInference = true;
  checks.persistedCredentialsReload = true;
  await writeFile(
    join(root, "live-results.json"),
    JSON.stringify(checks, null, 2) + "\n",
  );
  state = "Passed: exact model, structured response and credential reload.";
  authUrl = "";
  console.log(state);
}
try {
  if (!(await store.read("openai"))) {
    state = "Ready to connect";
    await runtime.login(
      "openai",
      "oauth",
      {
        signal: abort.signal,
        notify: (event) => {
          if (event.type === "auth_url") {
            assert.equal(new URL(event.url).hostname, "auth.openai.com");
            authUrl = event.url;
          }
        },
        prompt: (prompt) =>
          new Promise((_, reject) => {
            const signal = prompt.signal || abort.signal;
            if (signal.aborted) reject(new Error("Cancelled"));
            else
              signal.addEventListener(
                "abort",
                () => reject(new Error("Cancelled")),
                { once: true },
              );
          }),
      },
      { agentName: "ununemploy", getDeviceId: () => hostId },
    );
  }
  state = "Checking account model access and one synthetic response";
  authUrl = "";
  await verify();
} catch (error) {
  state = "Compatibility check paused";
  console.log(
    JSON.stringify({
      phase,
      errorType: error?.constructor?.name,
      code: error?.code,
      causeType: error?.cause?.constructor?.name,
      causeCode: error?.cause?.code,
      typeErrorMessage:
        error instanceof TypeError
          ? error.message.replace(
              /https?:\/\/\S+|Bearer \S+|[A-Za-z0-9_-]{60,}/g,
              "[redacted]",
            )
          : undefined,
      frames:
        error instanceof TypeError
          ? error.stack?.split("\n").slice(1, 4)
          : undefined,
    }),
  );
  authUrl = "";
  failure = abort.signal.aborted
    ? "The connection check timed out before completion. Start a new check to sign in again."
    : error instanceof assert.AssertionError
      ? error.message
      : "Sign-in or inference failed. The current app remains on Codex.";
  await writeFile(
    join(root, "live-results.json"),
    JSON.stringify({ ...checks, passed: false, message: failure }, null, 2) +
      "\n",
  );
  console.log(state + ": " + failure);
} finally {
  clearTimeout(timer);
  setTimeout(() => server.close(), 60000).unref();
}
process.on("SIGTERM", () => {
  abort.abort();
  server.close();
});
