// Opt-in real subscription check with synthetic data, against source or a built app.
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
const credentialPath = process.env.JH_PI_VERIFY_CREDENTIALS;
if (!credentialPath)
  throw new Error(
    "Set JH_PI_VERIFY_CREDENTIALS to an app-owned Pi credential file for this explicit live check.",
  );
const source = readFileSync(credentialPath, "utf8");
const credential = JSON.parse(source);
// Avoid duplicating a rotating credential across stores; this bounded check needs a fresh token.
assert.ok(
  credential.expires > Date.now() + 900000,
  "Reconnect first: the token expires too soon for an isolated check.",
);
const directory = mkdtempSync(join(tmpdir(), "ununemploy-pi-live-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = "";
const root = resolve(process.env.JH_PI_VERIFY_APP || ".");
const load = (path: string) => import(pathToFileURL(join(root, path)).href);
const store = await load("core/db/index.ts");
const { credentials } = await load("core/ai/pi-credentials.ts");
const { checkAi, models } = await load("core/ai/pi.ts");
const service = await load("core/assistant/service.ts");
const files = await load("core/assistant/attachments.ts");
const browser = await chromium.launch();
const evidence = resolve(".local-data/verification/pi-runtime");
mkdirSync(evidence, { recursive: true });
try {
  // Prove the packaged OAuth flow can start/cancel without another user login.
  const cancel = new AbortController();
  let authStarted = false;
  await assert.rejects(
    models.login(
      "openai",
      "oauth",
      {
        signal: cancel.signal,
        notify: (event: { type: string; url?: string }) => {
          if (event.type === "auth_url") {
            assert.equal(new URL(event.url!).hostname, "auth.openai.com");
            authStarted = true;
            cancel.abort();
          }
        },
        prompt: async () => {
          throw new Error("Cancelled fixture login");
        },
      },
      { agentName: "ununemploy", getDeviceId: () => randomUUID() },
    ),
  );
  assert.ok(authStarted);
  await credentials.modify("openai", async () => credential);
  assert.equal((await checkAi()).state, "ready");
  const page = await browser.newPage({ viewport: { width: 500, height: 250 } });
  await page.setContent(
    '<body style="background:white;color:black;font:42px Arial;display:grid;place-items:center;height:90vh">SCREENSHOT 42</body>',
  );
  const image = await files.storeAttachment(
    "screenshot.png",
    await page.screenshot(),
  );
  await page.setContent(
    "<body>Synthetic candidate evidence: My name is Maya Chen. My project uses Rust.</body>",
  );
  const pdf = await files.storeAttachment("candidate.pdf", await page.pdf());
  const id = randomUUID();
  service.startAssistant();
  service.enqueueAssistantMessage(
    "Read both attachments. Update my profile name from the PDF and tell me the exact two tokens written on the screenshot. Do not edit the CV or any other fields.",
    id,
    { page: "profile", dirty: false },
    [image.id, pdf.id],
  );
  const originalComplete = models.complete.bind(models);
  const deadline = AbortSignal.timeout(10 * 60 * 1000);
  models.complete = async (...args: unknown[]) => {
    const options = (args[2] || {}) as { signal?: AbortSignal };
    args[2] = {
      ...options,
      signal: AbortSignal.any([
        deadline,
        ...(options.signal ? [options.signal] : []),
      ]),
    };
    const answer = await originalComplete(...args);
    writeFileSync(
      join(evidence, "synthetic-response.json"),
      JSON.stringify(
        {
          stopReason: answer.stopReason,
          content: answer.content
            .filter((part: { type: string }) => part.type === "text")
            .map((part: { text: string; textSignature?: string }) => ({
              text: part.text,
              textSignature: part.textSignature,
            })),
        },
        null,
        2,
      ),
    );
    return answer;
  };
  await service.processAssistantTurn();
  const state = service.assistantState();
  assert.equal(
    state.turn.state,
    "complete",
    state.turn.error || "No completion",
  );
  assert.match(state.messages.at(-1).content, /SCREENSHOT/i);
  assert.match(state.messages.at(-1).content, /\b42\b/);
  assert.equal(store.getProfile().basics.name, "Maya Chen");
  assert.ok(
    state.turn.receipts.some((r: { kind: string }) => r.kind === "profile"),
  );
  const provenance = store.db
    .prepare("SELECT document FROM profile_changes")
    .all();
  assert.ok(
    provenance.some((p: { document: string }) =>
      p.document.includes("Maya Chen"),
    ),
  );
  const results = {
    passed: true,
    packaged: root !== resolve("."),
    model: "gpt-5.6-sol",
    reasoning: "high",
    oauthStartCancel: true,
    accountModel: true,
    pdfText: true,
    imageRead: true,
    profileAction: true,
    attributedEvidence: true,
    credentialReload: !!(await credentials.read("openai")),
  };
  writeFileSync(
    join(evidence, "live-results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
