import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-assistant-ui-"));
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = "";
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const assistant = await import("../core/assistant/service.ts");
const latex = await import("../core/latex/store.ts");
const { app } = await import("../server/index.ts");
store.putSetting("app", {
  ...store.getSettings(),
  scheduleEnabled: false,
  aiEnabled: false,
});
const source = store.addSource({
  name: "Assistant UI fixture",
  type: "ashby",
  identifier: "assistant-ui",
  enabled: false,
  requestLimit: 1,
});
const job = store.ingestJob(source, {
  sourceItemId: "one",
  title: "Frontend Engineer",
  company: "Example",
  location: "Kuala Lumpur, Malaysia",
  arrangement: "Remote",
  employmentType: "FullTime",
  salary: "",
  url: "https://example.com/frontend",
  description: "Build React and TypeScript applications.",
  publishedAt: store.now(),
  kind: "opening",
}).job;
const origin = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [],
  external: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (
    !r.url().startsWith(origin) &&
    !r.url().startsWith("blob:") &&
    !r.url().startsWith("data:")
  )
    external.push(r.url());
});
const output = resolve(".local-data/verification");
mkdirSync(output, { recursive: true });
const pane = page.getByRole("dialog", { name: "Assistant", exact: true });
const composer = page.getByRole("textbox", {
  name: "Message assistant",
  exact: true,
});
const call = (name: string, input = {}) => ({
  name,
  argumentsJson: JSON.stringify(input),
});
const step = (...calls: ReturnType<typeof call>[]) => ({
  reply: "",
  done: false,
  calls,
});
const done = (reply: string) => ({ reply, done: true, calls: [] });
const edit = (path: string, value: unknown, quote: string) => ({
  op: "set",
  path,
  valueJson: JSON.stringify(value),
  evidenceQuote: quote,
});
const completeTurn = async (steps: unknown[]) => {
  let i = 0;
  await assistant.processAssistantTurn({
    check: async () => ({ state: "ready", message: "" }),
    infer: async () => ({ result: steps[i++], usage: null }),
  });
  assert.equal(
    assistant.assistantState().turn?.state,
    "complete",
    assistant.assistantState().turn?.error || "No reply",
  );
};
const send = async (text: string) => {
  await composer.fill(text);
  await pane.getByRole("button", { name: "Send", exact: true }).click();
  await pane.getByText("Waiting for Codex…", { exact: true }).waitFor();
};
const show = async () => {
  if (!(await pane.isVisible()))
    await page
      .getByRole("button", { name: "Open assistant", exact: true })
      .click();
  await composer.waitFor();
  await page.waitForFunction(() => {
    const el = document.getElementById("app-assistant");
    return !!el && Math.abs(el.getBoundingClientRect().right - innerWidth) < 1;
  });
};
const hide = async () => {
  await page
    .getByRole("button", { name: "Hide assistant", exact: true })
    .click();
  await pane.waitFor({ state: "hidden" });
};
try {
  await page.goto(origin);
  await composer.waitFor();
  await page.waitForFunction(
    () =>
      Math.abs(
        document.getElementById("app-assistant")!.getBoundingClientRect()
          .right - innerWidth,
      ) < 1,
  );
  assert.match(page.url(), /#profile$/);
  await pane
    .getByText("What name would you like to use?", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".profile-chat-pane").count(), 0);
  const openBounds = await page.locator("main").boundingBox();
  await page.screenshot({
    path: join(output, "assistant-onboarding.png"),
    fullPage: true,
  });
  await composer.fill("Unsent draft stays with me");
  await hide();
  assert.deepEqual(await page.locator("main").boundingBox(), openBounds);
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await show();
  assert.equal(await composer.inputValue(), "Unsent draft stays with me");
  await page.reload();
  await composer.waitFor();
  assert.equal(await composer.inputValue(), "Unsent draft stays with me");
  const text =
    "My name is Maya. I live in Kuala Lumpur, Malaysia. I want software engineer roles, remote work. I build desktop tools; my project chartr is an old Go workspace.";
  await send(text);
  await completeTurn([
    step(call("read_profile")),
    step(
      call("edit_profile", {
        expectedRevision: store.getProfile().revision,
        edits: [
          edit("/basics/name", "Maya", "My name is Maya."),
          edit(
            "/basics/location",
            "Kuala Lumpur, Malaysia",
            "Kuala Lumpur, Malaysia",
          ),
          edit(
            "/basics/summary",
            "Software developer building desktop tools and workspaces.",
            "I build desktop tools",
          ),
          edit(
            "/preferences/roleFamilies",
            ["software engineer"],
            "software engineer roles",
          ),
          edit("/preferences/workArrangements", ["remote"], "remote work"),
          edit(
            "/projects/-",
            {
              id: "chartr",
              name: "chartr",
              url: "https://chartr.dev",
              summary: "Old Go workspace.",
              bullets: [],
              technologies: ["Go"],
              sources: [],
            },
            "my project chartr is an old Go workspace.",
          ),
        ],
      }),
    ),
    done("Your profile is ready for discovery."),
  ]);
  await pane
    .getByText("Your profile is ready for discovery.", { exact: true })
    .waitFor();
  await hide();
  await page.getByRole("button", { name: "User profile", exact: true }).click();
  await page
    .locator(".profile-facts-scroll")
    .getByText("Maya", { exact: false })
    .first()
    .waitFor();
  const initial = latex.latexVersion();
  latex.saveLatex(
    "\\documentclass{article}\n\\begin{document}\n\\section*{Maya}\n\\textbf{chartr}: Old Go workspace.\n\\end{document}\n",
    initial.version,
  );
  await page.getByRole("button", { name: "CV", exact: true }).click();
  const editor = page.locator('.cm-content[contenteditable="true"]');
  await editor.waitFor();
  await page
    .getByRole("button", { name: "Download PDF", exact: true })
    .waitFor();
  await show();
  await send(
    "Update chartr in my profile and LaTeX CV: Native Rust and GPUI workspace.",
  );
  assert.equal(assistant.assistantState().turn?.context.document, "latex");
  const latexBase = latex.latexVersion();
  await hide();
  await completeTurn([
    step(call("read_profile"), call("read_document", { kind: "latex" })),
    step(
      call("edit_profile", {
        expectedRevision: store.getProfile().revision,
        edits: [
          edit(
            "/projects/0/summary",
            "Native Rust and GPUI workspace.",
            "Native Rust and GPUI workspace.",
          ),
        ],
      }),
      call("edit_latex", {
        expectedVersion: latexBase.version,
        replacements: [
          {
            find: "Old Go workspace.",
            replace: "Native Rust and GPUI workspace.",
          },
        ],
      }),
      call("preview_latex"),
    ),
    done("Updated chartr in the profile and LaTeX CV."),
  ]);
  await page.waitForFunction(() =>
    document
      .querySelector(".cm-content")
      ?.textContent?.includes("Native Rust and GPUI"),
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".textLayer")].some((el) =>
      el.textContent?.includes("Native Rust"),
    ),
  );
  await show();
  await pane
    .getByText("Updated chartr in the profile and LaTeX CV.", { exact: true })
    .waitFor();
  await page.screenshot({
    path: join(output, "assistant-cv-desktop.png"),
    fullPage: true,
  });
  await hide();
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await show();
  await page.screenshot({
    path: join(output, "assistant-cv-dark.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await pane.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Open assistant", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.getByRole("button", { name: "Light mode", exact: true }).click();
  await show();
  await send("Show me the React TypeScript job in Malaysia.");
  await completeTurn([
    step(
      call("search_jobs", {
        terms: ["React", "TypeScript"],
        locations: ["Malaysia"],
      }),
    ),
    done(
      `[Frontend Engineer](#jobs?job=${job.id}) matches the requested technologies and location.`,
    ),
  ]);
  await pane
    .getByRole("link", { name: "Frontend Engineer", exact: true })
    .click();
  await pane.waitFor({ state: "hidden" });
  await page
    .getByRole("heading", { name: "Frontend Engineer", exact: true })
    .waitFor();
  assert.match(page.url(), new RegExp(`job=${job.id}`));
  await page.request.patch(`${origin}/api/jobs/${job.id}`, {
    data: { status: "saved" },
  });
  const another = store.ingestJob(source, {
    sourceItemId: "two",
    title: "Another Engineer",
    company: "Other Example",
    location: "Malaysia",
    arrangement: "Remote",
    employmentType: "FullTime",
    salary: "",
    url: "https://example.com/another",
    description: "TypeScript development.",
    publishedAt: store.now(),
    kind: "opening",
  }).job;
  await page.request.patch(`${origin}/api/jobs/${another.id}`, {
    data: { status: "saved" },
  });
  const letterDocument = {
    name: "Maya",
    location: "Malaysia",
    contacts: [],
    company: job.company,
    role: job.title,
    salutation: "Dear team,",
    paragraphs: ["Old cover letter paragraph."],
    closing: "Regards,",
  };
  const letter = store.saveCoverLetter({
    jobId: job.id,
    kind: "edited",
    document: letterDocument,
    template: store.getCoverLetterTemplate(),
    profileRevision: store.getProfile().revision,
    parentId: null,
    reviewNotes: [],
    evidence: null,
  });
  await page.evaluate((id) => {
    location.hash = `saved?job=${id}&tab=cover-letter`;
  }, job.id);
  await editor.waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector(".cm-content")
      ?.textContent?.includes("Old cover letter paragraph"),
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Cover letters", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "Cover letter", exact: true })
      .count(),
    0,
  );
  await editor.click();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+End" : "Control+End",
  );
  await page.keyboard.insertText("\n");
  await page.getByText("Unsaved changes", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Another Engineer", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Discard unsaved changes?" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  assert.ok(
    (await editor.textContent())?.includes("Old cover letter paragraph"),
  );
  // Same-page deep links also respect the global dirty guard.
  await page.evaluate((id) => {
    location.hash = `saved?job=${id}`;
  }, another.id);
  await page
    .getByRole("dialog", { name: "Discard unsaved changes?" })
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Another Engineer", exact: true })
    .waitFor();
  await page.evaluate((id) => {
    location.hash = `saved?job=${id}&tab=cover-letter`;
  }, job.id);
  await editor.waitFor();
  await show();
  await send("Rewrite this cover letter in a more direct voice.");
  assert.equal(
    assistant.assistantState().turn?.context.document,
    "cover_letter",
  );
  await hide();
  await completeTurn([
    step(call("read_document", { kind: "cover_letter", jobId: job.id })),
    step(
      call("edit_document", {
        kind: "cover_letter",
        jobId: job.id,
        expectedId: letter.id,
        documentJson: JSON.stringify({
          ...letterDocument,
          paragraphs: ["I build practical software for product teams."],
        }),
      }),
    ),
    done("Rewrote the saved cover letter."),
  ]);
  await page.waitForFunction(() =>
    document
      .querySelector(".cm-content")
      ?.textContent?.includes("I build practical software"),
  );
  await page
    .frameLocator('iframe[title="Cover letter preview"]')
    .getByText("I build practical software for product teams.", { exact: true })
    .waitFor();
  await page.locator(".embedded-letter").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "saved-letter-desktop.png") });
  await page.goto(`${origin}/#letters?job=${job.id}`);
  await editor.waitFor();
  await page.waitForFunction(() => location.hash.startsWith("#saved?"));
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByRole("tab", { name: "Match", selected: true }).waitFor();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page.getByRole("tab", { name: "Notes", selected: true }).waitFor();
  await page.getByRole("tab", { name: "Cover letter", exact: true }).click();
  await editor.waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("tab", { name: "Cover letter", selected: true })
    .waitFor();
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= innerWidth,
  );
  await page.locator(".embedded-letter").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "saved-letter-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    location.hash = "cv?view=html";
  });
  await editor.waitFor();
  await page.waitForFunction(() =>
    document.querySelector(".cm-content")?.textContent?.includes('"basics"'),
  );
  await show();
  await send("Make CV headings navy in the HTML presentation.");
  assert.equal(assistant.assistantState().turn?.context.document, "html_cv");
  const master = store.listCvVersions(null)[0];
  await hide();
  await completeTurn([
    step(call("read_document", { kind: "html_cv" })),
    step(
      call("edit_document", {
        kind: "html_cv",
        expectedId: master.id,
        css: store.getTemplate().css + "\nh1 { color: navy; }",
      }),
    ),
    done("Updated the CV heading style."),
  ]);
  await page.waitForFunction(() =>
    [...document.querySelectorAll("iframe")].some((el) =>
      el.srcdoc.includes("color: navy"),
    ),
  );
  await show();
  await send("Stop this request.");
  assert.equal(
    await pane
      .getByRole("button", { name: "New chat", exact: true })
      .isDisabled(),
    true,
  );
  await pane.getByRole("button", { name: "Stop", exact: true }).click();
  await pane
    .getByText("Stopped. No changes were saved.", { exact: true })
    .waitFor();
  await hide();
  await page.getByRole("button", { name: "CV", exact: true }).click();
  await editor.waitFor();
  await show();
  await send("Change Native Rust to Local Rust in the CV.");
  await hide();
  const beforeConcurrent = latex.latexVersion();
  const unsaved = beforeConcurrent.source.replace(
    "Maya",
    "Maya unsaved local draft",
  );
  await editor.fill(unsaved);
  await completeTurn([
    step(call("read_document", { kind: "latex" })),
    step(
      call("edit_latex", {
        expectedVersion: beforeConcurrent.version,
        replacements: [{ find: "Native Rust", replace: "Local Rust" }],
      }),
    ),
    done("Saved the requested CV wording."),
  ]);
  await page.getByText(/assistant saved a newer CV/).waitFor();
  assert.match(await editor.innerText(), /unsaved local draft/);
  assert.ok(!(await editor.innerText()).includes("Local Rust"));
  // Reload intentionally discards the synthetic unsaved draft after verifying retention.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await editor.waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await show();
  assert.ok(
    await page
      .locator(".app-frame")
      .evaluate((el) => (el as HTMLElement).inert),
  );
  assert.equal(Math.round((await pane.boundingBox())!.width), 390);
  await composer.fill("Mobile draft");
  await page.screenshot({
    path: join(output, "assistant-mobile.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await pane.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .locator(".app-frame")
      .evaluate((el) => (el as HTMLElement).inert),
    false,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await show();
  assert.equal(await composer.inputValue(), "Mobile draft");
  const profileBeforeReset = store.getProfile();
  const latexBeforeReset = latex.latexVersion();
  await pane.getByRole("button", { name: "New chat", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".profile-message").length === 1,
  );
  assert.equal(await composer.inputValue(), "");
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") ===
      "Message assistant",
  );
  assert.equal(assistant.assistantState().turn, null);
  assert.equal(assistant.assistantState().focus, null);
  assert.deepEqual(store.getProfile(), profileBeforeReset);
  assert.deepEqual(latex.latexVersion(), latexBeforeReset);
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("jh-assistant-draft")),
    null,
  );
  await page.screenshot({
    path: join(output, "assistant-new-chat-mobile.png"),
  });
  await page.reload();
  await composer.waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".profile-message").length === 1,
  );
  assert.equal(await composer.inputValue(), "");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await show();
  await send("A fresh conversation.");
  await completeTurn([done("Fresh conversation reply.")]);
  await pane.getByText("Fresh conversation reply.", { exact: true }).waitFor();
  await pane.getByRole("button", { name: "New chat", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".profile-message").length === 1,
  );
  await page.screenshot({
    path: join(output, "assistant-new-chat-desktop.png"),
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "Assistant overlay, unchanged page layout, onboarding, cross-page/reload drafts, profile + actual LaTeX/PDF updates, job deep links, cancellation, unsaved-edit preservation, New chat reset and reload, keyboard focus and desktop/mobile themes passed.",
  );
} finally {
  await browser.close();
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
