import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "ununemploy-design-"));
mkdirSync(join(directory, "resume/output/pdf"), { recursive: true });
writeFileSync(
  join(directory, "resume/output/pdf/john-goh-rengwu-resume.tex"),
  readFileSync(resolve("core/latex/starter.tex"), "utf8").replace(
    "Edit your resume here.",
    "Example Candidate\\par\nSoftware Engineer\\par\nBuild clear and accessible tools with React and TypeScript.",
  ),
);
process.env.JH_DATA_DIR = directory;
process.env.JH_PROFILE_SEED = resolve("tests/fixtures/profile.json");
process.env.JH_TEST_SERVER = "1";
const store = await import("../core/db/index.ts");
store.putSetting("app", {
  ...store.getSettings(),
  scheduleEnabled: false,
  aiEnabled: false,
});
for (const source of store.listSources())
  store.saveSource({ ...source, enabled: false });
const source = store.addSource({
  name: "Example careers",
  type: "ashby",
  identifier: "example",
  enabled: false,
  requestLimit: 1,
});
for (const [index, title] of [
  "Product Engineer",
  "Senior Frontend Engineer",
  "Software Engineer, Developer Experience",
  "Design Engineer",
  "Platform Engineer",
].entries()) {
  store.ingestJob(source, {
    sourceItemId: String(index),
    title,
    company: ["Northstar", "Fieldwork", "Meridian", "Forma", "Acme"][index],
    location: "Kuala Lumpur, Malaysia",
    arrangement: "Remote",
    employmentType: "FullTime",
    salary: "",
    url: `https://example.com/jobs/${index}`,
    description:
      "Build thoughtful developer tools with React and TypeScript. Work with a small engineering team to improve accessibility, performance and the everyday experience of our customers.\n\nWhat you’ll do\n• Design and build clear, useful interfaces.\n• Take features from early sketches through to production.\n• Collaborate with engineers and designers.\n\nWhat we’re looking for\nExperience building web applications with JavaScript or TypeScript, a considered approach to product design, and clear written communication.",
    descriptionQuality: "full",
    publishedAt: store.now(),
    kind: "opening",
  });
}
const { app } = await import("../server/index.ts");
const origin = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  colorScheme: "dark",
});
page.setDefaultTimeout(15000);
const evidence = resolve("docs/wiki/evidence/2026-10-16-cursor-redesign");
mkdirSync(evidence, { recursive: true });
const errors: string[] = [],
  external: string[] = [],
  checks: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (
    url.origin === origin ||
    url.protocol === "blob:" ||
    url.protocol === "data:"
  )
    return route.continue();
  external.push(url.origin);
  return route.abort();
});
const shot = (name: string) =>
  page.screenshot({ path: join(evidence, `${name}.png`) });
const nav = (name: string) =>
  page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
const noOverflow = async () =>
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    page.viewportSize()!.width,
  );
const mode = (value: string) =>
  page.waitForFunction(
    (v) => document.documentElement.dataset.mode === v,
    value,
  );
const choose = async (label: string, option: string) => {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};
try {
  await page.goto(origin + "/#jobs");
  await page.locator(".job-title").first().click();
  await page.locator(".description").waitFor();
  await mode("dark");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("jh-theme")),
    "system",
  );
  await shot("jobs-dark");
  await noOverflow();
  const bounds = await page.locator("main").boundingBox();
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Message assistant" })
    .fill("Help me compare these roles.");
  await page.waitForFunction(
    () =>
      document.getElementById("app-assistant")!.getBoundingClientRect().right <=
      innerWidth + 1,
  );
  assert.deepEqual(await page.locator("main").boundingBox(), bounds);
  await shot("assistant-dark");
  await page.keyboard.press("Escape");
  await page
    .getByRole("dialog", { name: "Assistant", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Open assistant", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  checks.push(
    "Assistant overlay does not resize content; Escape restores focus",
  );
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await choose("Work arrangement", "Remote");
  await page.getByRole("combobox", { name: "Location", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Search locations", exact: true })
    .fill("Kuala Lumpur");
  await page
    .getByRole("option", { name: "Kuala Lumpur, Malaysia", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Location", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear locations", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Search locations", exact: true })
    .fill("Malaysia");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  assert.match(
    await page
      .getByRole("combobox", { name: "Location", exact: true })
      .innerText(),
    /Malaysia/,
  );
  await shot("filters-dark");
  await page.reload();
  await page
    .getByRole("button", { name: "Filters · Active", exact: true })
    .click();
  assert.match(
    await page
      .getByRole("combobox", { name: "Location", exact: true })
      .innerText(),
    /Malaysia/,
  );
  await page
    .getByRole("button", { name: "Filters · Active", exact: true })
    .click();
  checks.push(
    "Location search, pointer and keyboard selection, clear, filter persistence and active indicator",
  );
  await page.getByRole("button", { name: "Add job", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add job", exact: true });
  await dialog.waitFor();
  await page
    .getByRole("textbox", { name: "Role", exact: true })
    .fill("Unsaved fixture role");
  await shot("dialog-dark");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Add job", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  checks.push("Dialog Escape cancellation and focus return");
  await nav("Settings");
  await page.getByRole("combobox", { name: "Theme", exact: true }).waitFor();
  await shot("settings-dark");
  await choose("Theme", "Light");
  await mode("light");
  await page.reload();
  await mode("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await mode("light");
  await shot("settings-light");
  await page.getByRole("button", { name: "Collection", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Scan interval (hours)" })
    .fill("12");
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Bearer token", exact: true })
    .waitFor();
  await shot("settings-connections-light");
  await page.getByRole("button", { name: "Collection", exact: true }).click();
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Scan interval (hours)" })
      .inputValue(),
    "12",
  );
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await page.getByText("Settings saved.", { exact: true }).waitFor();
  assert.equal(store.getSettings().scanIntervalHours, 12);
  await page.getByRole("button", { name: "General", exact: true }).click();
  await choose("Theme", "System");
  await mode("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await mode("light");
  checks.push(
    "System tracks OS changes; explicit choice survives reload and OS changes; Settings sections retain and save edits",
  );
  await nav("Jobs");
  await page.locator(".description").waitFor();
  await shot("jobs-light");
  await page
    .getByRole("textbox", { name: "Search jobs", exact: true })
    .fill("No fixture has this title");
  await page
    .getByText("No jobs match these filters.", { exact: true })
    .waitFor();
  await shot("jobs-empty-light");
  await page
    .getByRole("textbox", { name: "Search jobs", exact: true })
    .fill("");
  await page.locator(".job-title").first().waitFor();
  // Exercise loading, a failed response and recovery without touching live data.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/jobs?*", async (route) => {
    await gate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fixture job loading error" }),
    });
  });
  try {
    await page.reload();
    await page.getByText("Loading jobs…", { exact: true }).first().waitFor();
    await shot("jobs-loading-light");
  } finally {
    release();
  }
  await page.getByText("Fixture job loading error", { exact: true }).waitFor();
  await shot("jobs-error-light");
  await page.unroute("**/api/jobs?*");
  await page
    .getByRole("alert")
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  await page.locator(".job-title").first().waitFor();
  checks.push(
    "Loading and error states remain distinct from empty results; Retry recovers",
  );
  await nav("User profile");
  await page.locator(".profile-markdown").waitFor();
  await shot("profile-light");
  await nav("CV");
  await page.locator(".cm-content").waitFor();
  await page
    .locator(".latex-pdf-page canvas")
    .first()
    .waitFor({ timeout: 30000 });
  await shot("cv-light");
  await nav("Sources");
  await page.getByRole("button", { name: "Add source", exact: true }).waitFor();
  await shot("sources-light");
  await page.getByRole("button", { name: "Add source", exact: true }).click();
  await page.getByRole("dialog", { name: "Add source", exact: true }).waitFor();
  await shot("source-dialog-light");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  checks.push(
    "All main pages, empty results, source dialog and light/dark visuals",
  );
  await page
    .getByRole("button", { name: "Toggle navigation", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Toggle navigation", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow();
  await shot("sources-mobile");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("dialog", { name: "ununemploy", exact: true }).waitFor();
  await shot("navigation-mobile");
  await nav("Jobs");
  await page
    .getByRole("dialog", { name: "ununemploy", exact: true })
    .waitFor({ state: "hidden" });
  await page.locator(".job-title").first().waitFor();
  await shot("jobs-mobile");
  await page.locator(".job-title").first().click();
  await shot("detail-mobile");
  await noOverflow();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await nav("Settings");
  await shot("settings-mobile");
  await noOverflow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Message assistant" }).waitFor();
  assert.equal(
    await page
      .locator(".assistant-pane")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  await shot("assistant-mobile");
  await noOverflow();
  checks.push(
    "Desktop collapse; mobile navigation, jobs/detail, sources, settings and assistant; reduced motion",
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 720, height: 540 });
  await page.evaluate(() => {
    document.documentElement.dataset.native = "true";
  });
  const nativeMenu = await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .boundingBox();
  assert.ok(
    nativeMenu && nativeMenu.x >= 196,
    "Native navigation must be outside the passive drag region",
  );
  await noOverflow();
  await shot("native-header-minimum-browser");
  checks.push(
    "Native minimum-width navigation clears the traffic lights and passive drag region",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  writeFileSync(
    join(evidence, "checks.json"),
    JSON.stringify({ passed: true, checks, errors, external }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (error) {
  await shot("failure");
  throw error;
} finally {
  await browser.close();
  await app.close();
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
}
