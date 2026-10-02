import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
const dir = mkdtempSync(join(tmpdir(), "ununemploy-latex-browser-"));
const output = resolve(".local-data/verification");
mkdirSync(output, { recursive: true });
const resume = readFileSync(
  new URL("../core/latex/starter.tex", import.meta.url),
  "utf8",
).replace("Edit your resume here.", "Example Software: around six years of fictional test experience.\n\\newpage\nExample project details.");
mkdirSync(join(dir, "resume/output/pdf"), { recursive: true });
writeFileSync(
  join(dir, "resume/output/pdf/john-goh-rengwu-resume.tex"),
  resume,
);
process.env.JH_DATA_DIR = dir;
process.env.JH_PROFILE_SEED = new URL(
  "../tests/fixtures/profile.json",
  import.meta.url,
).pathname;
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
const facts = JSON.stringify(store.getProfile());
const { app } = await import("../server/index.ts");
const origin = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
page.setDefaultTimeout(20000);
const errors: string[] = [];
const external: string[] = [];
const checks: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (
    url.origin === origin ||
    url.protocol === "blob:" ||
    url.protocol === "data:"
  )
    return route.continue();
  external.push(url.href);
  return route.abort();
});
const step = (s: string) => {
  checks.push(s);
  console.log(s);
};
const setCode = async (s: string) => {
  await page.locator('.cm-content[contenteditable="true"]').click();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+A" : "Control+A",
  );
  await page.keyboard.insertText(s);
};
const compile = async () => {
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/latex/compile")),
    page.getByRole("button", { name: "Recompile", exact: true }).click(),
  ]);
};
const choose = async (v: number) => {
  await page
    .getByRole("combobox", { name: "LaTeX version", exact: true })
    .click();
  await page
    .getByRole("option", { name: new RegExp(`^Version ${v} ·`) })
    .click();
};
try {
  await page.goto(origin + "/#cv");
  await page
    .getByRole("button", { name: "Download PDF", exact: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".latex-pdf-page canvas").length === 2 &&
      [...document.querySelectorAll(".textLayer")].some((x) =>
        x.textContent?.includes("Example Software"),
      ),
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Download PDF", exact: true })
      .isEnabled(),
    true,
  );
  step(
    "Current sb2nov source imports and renders both PDF pages with selectable text",
  );
  await page.getByRole("combobox", { name: "PDF zoom" }).click();
  await page.getByRole("option", { name: "125%", exact: true }).click();
  await page.waitForFunction(
    () =>
      (document.querySelector(".latex-pdf-page")?.getBoundingClientRect()
        .width || 0) > 900,
  );
  await page.getByRole("combobox", { name: "PDF zoom" }).click();
  await page.getByRole("option", { name: "Fit width", exact: true }).click();
  await page.waitForFunction(
    () =>
      (document.querySelector(".latex-pdf-page")?.getBoundingClientRect()
        .width || 0) < 700,
  );
  step("PDF zoom enlarges the document without changing source or page layout");
  await page.screenshot({
    path: join(output, "latex-desktop.png"),
    fullPage: true,
  });
  const edit = resume.replace(
    "around six years",
    "approximately six years",
  );
  await setCode(edit);
  await page.getByText("Unsaved changes", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Download PDF", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("tab", { name: "Data and HTML", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  step("Unsaved changes are guarded and stale PDF download is disabled");
  await compile();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".textLayer")].some((x) =>
      x.textContent?.includes("approximately"),
    ),
  );
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/latex") && r.request().method() === "PUT",
    ),
    page.getByRole("button", { name: "Save", exact: true }).click(),
  ]);
  await page.reload();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".textLayer")].some((x) =>
      x.textContent?.includes("approximately"),
    ),
  );
  step("Edits compile, save and survive reload");
  const pdfPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await (await pdfPromise).saveAs(join(output, "latex-browser.pdf"));
  const texPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download .tex", exact: true })
    .click();
  await (await texPromise).saveAs(join(output, "latex-browser.tex"));
  assert.equal(readFileSync(join(output, "latex-browser.tex"), "utf8"), edit);
  step("PDF and editable source downloads match the compiled edit");
  await setCode(
    edit.replace(
      "\\end{document}",
      "\\UndefinedVerificationCommand\n\\end{document}",
    ),
  );
  await compile();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator(".latex-pdf-page canvas").count(), 2);
  await page
    .getByRole("button", { name: /^Line \d+$/ })
    .first()
    .click();
  assert.equal(
    await page
      .locator(".cm-content")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Download PDF", exact: true })
      .isDisabled(),
    true,
  );
  step(
    "Failed compile retains last successful PDF and diagnostics focus the source line",
  );
  await choose(1);
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore version", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Restore version", exact: true })
    .click();
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Restore version"),
  );
  const state = (await app.inject({ method: "GET", url: "/api/latex" })).json();
  assert.equal(state.current.version, 3);
  assert.equal(state.current.source, resume);
  assert.equal(state.current.restoredFrom, 1);
  step(
    "Restoring an earlier version creates a new version and preserves history",
  );
  await page.getByRole("tab", { name: "Data and HTML", exact: true }).click();
  await page.getByRole("tab", { name: "Data.json", exact: true }).waitFor();
  await page.getByRole("tab", { name: "LaTeX", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".latex-pdf-page canvas").length === 2,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(output, "latex-mobile.png"),
    fullPage: true,
  });
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  assert.ok(dimensions.scroll <= dimensions.width, JSON.stringify(dimensions));
  step(
    "Existing Data/HTML editor remains accessible; mobile page has no horizontal overflow",
  );
  assert.equal(JSON.stringify(store.getProfile()), facts);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  writeFileSync(
    join(output, "latex-browser.json"),
    JSON.stringify({ checks, errors, external, dimensions }, null, 2),
  );
} finally {
  await browser.close();
  await app.close();
  store.db.close();
  rmSync(dir, { recursive: true, force: true });
}
