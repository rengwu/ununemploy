import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-attachment-ui-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = resolve("tests/fixtures/profile.json");
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
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", (route) =>
  new URL(route.request().url()).origin === origin
    ? route.continue()
    : route.abort(),
);
const evidence = resolve(".local-data/verification/assistant-attachments");
mkdirSync(evidence, { recursive: true });
try {
  await page.goto(origin + "/#jobs");
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Message assistant" });
  await input.waitFor();
  await page
    .getByRole("button", { name: "Attach files", exact: true })
    .waitFor();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic attachment notes"),
  });
  await page.getByRole("button", { name: "Remove notes.txt" }).waitFor();
  // Exercise an image-bearing paste event on the actual composer input.
  await input.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 160;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f7f7f7";
    ctx.fillRect(0, 0, 320, 160);
    ctx.fillStyle = "#111";
    ctx.font = "32px sans-serif";
    ctx.fillText("SCREENSHOT 42", 20, 90);
    const bytes = Uint8Array.from(
      atob(canvas.toDataURL("image/png").split(",")[1]),
      (c) => c.charCodeAt(0),
    );
    const data = new DataTransfer();
    data.items.add(
      new File([bytes], "screenshot [sample] & notes.png", {
        type: "image/png",
      }),
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  });
  await page
    .getByRole("button", { name: "Remove screenshot [sample] & notes.png" })
    .waitFor();
  await page.waitForFunction(() =>
    Array.from(
      document.querySelectorAll<HTMLImageElement>(".profile-composer img"),
    ).every((img) => img.complete && img.naturalWidth > 0),
  );
  await input.fill("Review these attachments.");
  await page.reload();
  await input.waitFor();
  await page.getByRole("button", { name: "Remove notes.txt" }).waitFor();
  await page
    .getByRole("button", { name: "Remove screenshot [sample] & notes.png" })
    .waitFor();
  assert.equal(await input.inputValue(), "Review these attachments.");
  assert.equal(
    await page.locator(".profile-composer .assistant-attachment").count(),
    2,
  );
  await page.getByRole("button", { name: "Remove notes.txt" }).click();
  await page
    .getByRole("button", { name: "Remove notes.txt" })
    .waitFor({ state: "detached" });
  await input.fill("");
  await page.route(
    "**/api/assistant/messages",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic send interruption" }),
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByText("Synthetic send interruption", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Remove screenshot [sample] & notes.png" })
    .waitFor();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForFunction(() =>
    document.body.textContent?.includes("Waiting for the model"),
  );
  const turn = service.assistantState().turn;
  assert.equal(turn?.state, "queued");
  assert.equal(
    service.assistantState().messages.find((m) => m.id === turn?.userMessageId)
      ?.attachments.length,
    1,
  );
  const file = service
    .assistantState()
    .messages.find((m) => m.id === turn?.userMessageId)!.attachments[0];
  await service.processAssistantTurn({
    check: async () => ({ state: "ready", message: "" }),
    infer: async (_prompt, _schema, options) => {
      assert.equal(options?.images?.length, 1);
      return {
        result: {
          done: true,
          reply: `The screenshot is attached.\n\n[attachment:${file.id}]\n\n[attachment:missing-file]\n\nLiteral: \`[attachment:${file.id}]\`\n\nNo changes saved.\n\nNo changes saved.`,
          calls: [],
        },
        usage: {},
      };
    },
  });
  await page
    .getByText("The screenshot is attached.", { exact: true })
    .waitFor();
  const citation = page
    .locator(".profile-message-assistant .profile-markdown")
    .getByRole("link", { name: file.name, exact: true });
  await citation.waitFor();
  assert.equal(
    await citation.getAttribute("href"),
    `/api/assistant/attachments/${file.id}/content`,
  );
  const download = await page.request.get(
    origin + (await citation.getAttribute("href")),
  );
  assert.equal(download.status(), 200);
  assert.equal(download.headers()["content-type"], "image/png");
  assert.ok((await download.body()).length > 100);
  await page.getByText("Attachment unavailable", { exact: true }).waitFor();
  assert.equal(
    await page.locator(".profile-message-assistant code").last().innerText(),
    `[attachment:${file.id}]`,
  );
  assert.equal(
    await page.getByText("No changes saved.", { exact: true }).count(),
    1,
  );
  await page.reload();
  await citation.waitFor();
  assert.equal(await citation.count(), 1);
  await page.screenshot({ path: join(evidence, "desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await input.focus();
  await page.waitForFunction(
    () =>
      document.getElementById("app-assistant")?.getAttribute("aria-modal") ===
      "true",
  );
  await page.screenshot({ path: join(evidence, "mobile.png") });
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await page
    .getByText("The screenshot is attached.", { exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    store.db.prepare("SELECT count(*) AS n FROM assistant_attachments").get()!
      .n,
    0,
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    join(evidence, "results.json"),
    JSON.stringify(
      {
        passed: true,
        picker: true,
        pastedImage: true,
        draftReload: true,
        remove: true,
        imageOnlySend: true,
        failedSendRetry: true,
        history: true,
        attachmentCitation: true,
        citationDownload: true,
        citationReload: true,
        filenameEscaping: true,
        unknownCitation: true,
        literalCodePreserved: true,
        duplicateFooter: true,
        newChat: true,
        mobile: true,
        consoleErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log("Attachment UI checks passed.");
} finally {
  await browser.close();
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
