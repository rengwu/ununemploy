// Fresh-install browser journey. Real upload/PDF extraction/actions/storage;
// simulated inference deliberately produces the reported empty-action response.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "ununemploy-onboarding-ui-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = "";
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
store.putSetting("app", {
  ...store.getSettings(),
  aiEnabled: false,
  scheduleEnabled: false,
});
const service = await import("../core/assistant/service.ts");
const { app } = await import("../server/index.ts");
const origin = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", (route) =>
  new URL(route.request().url()).origin === origin
    ? route.continue()
    : route.abort(),
);
const evidence = resolve(".local-data/verification/assistant-onboarding");
mkdirSync(evidence, { recursive: true });
const check = async () => ({ state: "ready", message: "" });
const call = (name: string, args = {}) => ({
  name,
  argumentsJson: JSON.stringify(args),
});

try {
  assert.equal(store.getProfile().basics.name, "");
  const fixture = await browser.newPage();
  await fixture.setContent(
    "<h1>Maya Chen</h1><p>Example Works - Support Analyst</p>",
  );
  const pdf = await fixture.pdf();
  await fixture.close();
  await page.goto(origin + "/#profile");
  const input = page.getByRole("textbox", { name: "Message assistant" });
  // Empty-profile navigation opens onboarding automatically.
  await input.waitFor();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: pdf });
  await page
    .getByRole("button", { name: "Remove resume.pdf", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByText("Waiting for the model…", { exact: true }).waitFor();
  await service.processAssistantTurn({
    check,
    infer: async (prompt) => {
      assert.match(prompt, /Maya Chen/);
      return {
        result: { done: true, reply: "Is this your résumé?", calls: [] },
        usage: null,
      };
    },
  });
  await page.getByText("Is this your résumé?", { exact: true }).waitFor();
  await input.fill("yeah that's my profile");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByText("Waiting for the model…", { exact: true }).waitFor();
  let round = 0;
  await service.processAssistantTurn({
    check,
    infer: async (prompt) => {
      assert.match(prompt, /Example Works - Support Analyst/);
      round++;
      if (round === 1)
        return { result: { done: false, reply: "", calls: [] }, usage: null };
      if (round === 2) {
        await page
          .getByText("Correcting the response…", { exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Retry message", exact: true })
            .count(),
          0,
        );
        return {
          result: { done: false, reply: "", calls: [call("read_profile")] },
          usage: null,
        };
      }
      if (round === 3)
        return {
          result: {
            done: false,
            reply: "",
            calls: [
              call("edit_profile", {
                expectedRevision: store.getProfile().revision,
                edits: [
                  {
                    op: "set",
                    path: "/basics/name",
                    valueJson: JSON.stringify("Maya Chen"),
                    evidenceQuote: "Maya Chen",
                  },
                ],
              }),
            ],
          },
          usage: null,
        };
      return {
        result: {
          done: true,
          reply:
            "I saved your name from your résumé. Which roles would you like to find?",
          calls: [],
        },
        usage: null,
      };
    },
  });
  assert.equal(service.assistantState().turn?.state, "complete");
  assert.equal(round, 4);
  await page
    .getByText(
      "I saved your name from your résumé. Which roles would you like to find?",
      { exact: true },
    )
    .waitFor();
  assert.equal(store.getProfile().basics.name, "Maya Chen");
  assert.equal(store.getProfile().revision, 2);
  await page.reload();
  await page
    .getByText(
      "I saved your name from your résumé. Which roles would you like to find?",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Retry message", exact: true })
      .count(),
    0,
  );
  await page.screenshot({ path: join(evidence, "desktop.png") });
  await page
    .getByRole("button", { name: "Hide assistant", exact: true })
    .click();
  await page
    .locator(".profile-facts-page")
    .getByText("Name: Maya Chen", { exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  writeFileSync(
    join(evidence, "results.json"),
    JSON.stringify(
      {
        passed: true,
        inference: "simulated",
        emptyProfile: true,
        pdfPickerAndExtraction: true,
        naturalConfirmationRetainsEvidence: true,
        automaticResponseRecovery: true,
        noUserRetry: true,
        savedProfileAndReceipt: true,
        reload: true,
        visibleProfile: true,
        consoleErrors: errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Fresh-install assistant onboarding browser checks passed (simulated inference).",
  );
} finally {
  await browser.close();
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
