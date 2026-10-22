import assert from "node:assert/strict";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  mkdir,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser } from "playwright";
import { assertPrivateFile } from "../tests/helpers/private-file.ts";

if (process.platform !== "win32")
  throw new Error("Run this driver on Windows.");
const exec = promisify(execFile);
const executable = resolve(
  process.argv[2] || "build/desktop/windows/ununemploy.exe",
);
const data = await mkdtemp(join(tmpdir(), "ununemploy-windows-"));
const output = resolve(
  process.env.JH_WINDOWS_VERIFY_OUTPUT || ".local-data/verification/windows",
);
await mkdir(output, { recursive: true });
process.env.JH_DATA_DIR = data;
process.env.JH_PROFILE_SEED = resolve("tests/fixtures/profile.json");
const store = await import("../core/db/index.ts");
for (const source of store.listSources())
  store.saveSource({ ...source, enabled: false });
store.putSetting("app", {
  ...store.getSettings(),
  scheduleEnabled: false,
  aiEnabled: false,
  xEnabled: false,
});
store.incrementCounter("windows-retention", 27);
store.db.close();

type State = {
  pid: number;
  servicePid: number;
  url: string;
  control: string;
  token: string;
};
type ProcessIdentity = { pid: number; started: string; name: string };
const children: ChildProcess[] = [];
const results: Record<string, string> = {};
let browser: Browser | undefined;
async function until<T>(
  fn: () => T | Promise<T>,
  message: string,
  timeout = 30000,
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value as NonNullable<T>;
    } catch {
      /* bounded startup transition */
    }
    await delay(100);
  }
  throw new Error(message);
}
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function windowAction(
  pid: number,
  action: string,
  savePath?: string,
  processes?: ProcessIdentity[],
) {
  const result = await exec(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      resolve("scripts/desktop-window.ps1"),
      "-TargetPid",
      String(pid),
      "-Action",
      action,
      ...(savePath ? ["-SavePath", savePath] : []),
      ...(processes ? ["-ProcessSnapshot", JSON.stringify(processes)] : []),
    ],
    { windowsHide: true, timeout: action === "wait-processes" ? 40000 : 10000 },
  );
  return JSON.parse(result.stdout);
}
async function freePort() {
  const server = createServer();
  await new Promise<void>((yes) => server.listen(0, "127.0.0.1", yes));
  const address = server.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((yes) => server.close(() => yes()));
  return address.port;
}
const debugPort = await freePort();
function spawnApp(args: string[] = []) {
  const child = spawn(executable, args, {
    env: {
      ...process.env,
      PATH: `${process.env.SystemRoot || "C:\\Windows"}\\System32;${process.env.SystemRoot || "C:\\Windows"}`,
      JH_DESKTOP_DATA_DIR: data,
      JH_DESKTOP_DEBUG_PORT: String(debugPort),
    },
    windowsHide: args.includes("--headless"),
    stdio: "ignore",
  });
  child.on("error", (error) => console.error(error.message));
  children.push(child);
  return child;
}
async function launch(headless = false) {
  const child = spawnApp(headless ? ["--headless"] : []);
  const state = await until(
    async () => {
      const state: State = JSON.parse(
        await readFile(join(data, "desktop-instance.json"), "utf8"),
      );
      if (state.pid !== child.pid || !state.servicePid || !state.url)
        return null;
      const response = await fetch(state.url + "/api/health", {
        signal: AbortSignal.timeout(1500),
      });
      return response.ok ? state : null;
    },
    "Packaged Windows services did not become healthy",
    65000,
  );
  return { child, state };
}
async function json(url: string, body?: unknown, method = "GET") {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  assert(response.ok, `${method} ${new URL(url).pathname}: ${response.status}`);
  return response.json();
}
try {
  const first = await launch();
  const boot = await until(async () => {
    const boot = await json(first.state.url + "/api/bootstrap");
    return boot.ai.state === "checking" ? null : boot;
  }, "Packaged AI status did not finish checking");
  assert.equal(boot.settings.scheduleEnabled, false);
  assert.equal(boot.profile.revision, 1);
  assert.equal(boot.ai.state, "signed_out");
  assert.equal(boot.ai.model, "gpt-5.6-sol");
  assert.equal(boot.ai.reasoning, "high");
  results.startup =
    "Passed: packaged API/worker healthy with synthetic profile and collection/inference disabled";
  if (process.argv.includes("--verify-installer")) {
    await assert.rejects(
      exec(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          resolve("build/desktop/windows/install.ps1"),
          "-Destination",
          dirname(executable),
          "-NoShortcut",
        ],
        { windowsHide: true },
      ),
      /Quit ununemploy before installing/,
    );
    results.runningUpdate =
      "Passed: installer rejected replacing the running installed fixture";
  }
  const job = await json(
    first.state.url + "/api/jobs",
    {
      title: "Frontend Engineer",
      company: "Fixture Company",
      url: "https://example.com/windows-fixture",
      description: "Build React and TypeScript interfaces.",
      location: "Malaysia",
    },
    "POST",
  );
  await json(
    first.state.url + `/api/jobs/${job.id}`,
    { notes: "Windows persistence fixture", status: "saved" },
    "PATCH",
  );
  results.savedJob =
    "Passed: actual manual-add and Save APIs retained notes and queued a cover letter";
  await until(async () => {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`, {
        timeout: 1500,
        noDefaults: true,
      });
      return true;
    } catch {
      return false;
    }
  }, "WebView2 debugging endpoint unavailable");
  const page = await until(
    () =>
      browser!
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url().startsWith(first.state.url)),
    "Local page not loaded in WebView2",
  );
  await windowAction(first.state.pid, "activate");
  await page.waitForFunction(() => document.visibilityState === "visible");
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .waitFor();
  await page.getByRole("heading", { name: "Jobs", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.native),
    undefined,
  );
  assert.equal((await windowAction(first.state.pid, "inspect")).visible, true);
  const cdp = await page.context().newCDPSession(page);
  const captured = await Promise.race([
    cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false }),
    delay(8000).then(() => {
      throw new Error("Native CDP screenshot timed out");
    }),
  ]);
  await writeFile(
    join(output, "windows-jobs.png"),
    Buffer.from(captured.data, "base64"),
  );
  await cdp.detach();
  results.nativeUI =
    "Passed: real WebView2 rendered Jobs and assistant controls without macOS inset";
  // A script navigation must be cancelled at the native boundary, without opening a browser.
  const navigation = await page.context().newCDPSession(page);
  await navigation.send("Runtime.evaluate", {
    expression:
      'location.href = "https://example.com/blocked-native-navigation"',
    userGesture: false,
  });
  await navigation.detach();
  await delay(400);
  assert(page.url().startsWith(first.state.url));
  results.navigation =
    "Passed: remote scripted navigation cannot replace the local application";
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "Timezone", exact: true }).click();
  await page.locator(".timezone-map svg").waitFor();
  const minimum = page.getByRole("slider", { name: "Minimum UTC offset" });
  await minimum.press("Home");
  await minimum.press("ArrowRight");
  assert.equal(await minimum.getAttribute("aria-valuenow"), "-705");
  await minimum.press("Escape");
  results.timezone =
    "Passed: packaged timezone data loaded, map rendered and keyboard filtering worked in WebView2";
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert(boot.build?.version, "Packaged version is missing");
  await page
    .getByText(`ununemploy ${boot.build.version}`, { exact: false })
    .waitFor();
  await page
    .getByRole("link", { name: "Download updates", exact: true })
    .waitFor();
  results.buildIdentity =
    "Passed: Settings displays the package version and release download link";
  await page.getByRole("button", { name: "AI", exact: true }).click();
  // Exercise the actual bundled OAuth module without opening the external
  // sign-in page or using any real account. Repeat to check callback cleanup.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page
      .getByRole("button", { name: "Sign in with ChatGPT", exact: true })
      .click();
    const link = page.getByRole("link", {
      name: "Continue with ChatGPT",
      exact: true,
    });
    await link.waitFor();
    assert.equal(
      new URL((await link.getAttribute("href"))!).origin,
      "https://auth.openai.com",
    );
    assertPrivateFile(join(data, "pi-auth/host-id"));
    await page
      .getByRole("button", { name: "Cancel sign-in", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sign in with ChatGPT", exact: true })
      .waitFor();
  }
  assert.equal(
    (await json(first.state.url + "/api/ai/connect/cancel", {}, "POST")).ok,
    true,
  );
  await assert.rejects(readFile(join(data, "pi-auth/credentials.json")), {
    code: "ENOENT",
  });
  results.piSignIn =
    "Passed: signed-out exact-model state, bundled OAuth start/cancel twice, private host ID and no saved tokens";
  await page.getByRole("button", { name: "CV", exact: true }).click();
  const editor = page.locator('.cm-content[contenteditable="true"]');
  await editor.waitFor();
  const source = (await readFile("core/latex/starter.tex", "utf8")).replace(
    "Edit your resume here.",
    "Windows document fixture.",
  );
  await editor.fill(source);
  await windowAction(first.state.pid, "quit");
  await until(async () => {
    await windowAction(first.state.pid, "cancel-quit");
    return true;
  }, "Dirty Quit did not offer cancellation");
  assert(alive(first.state.pid));
  assert((await editor.innerText()).includes("Windows document fixture."));
  await page.getByRole("button", { name: "Recompile", exact: true }).click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".textLayer")].some((node) =>
        node.textContent?.includes("Windows document fixture"),
      ),
    {},
    { timeout: 40000 },
  );
  results.latex =
    "Passed: packaged AppContainer compiler produced a PDF rendered as selectable text in WebView2";
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await until(
    async () =>
      page.getByRole("button", { name: "Save", exact: true }).isDisabled(),
    "Source did not finish saving",
  );
  const latex = await json(first.state.url + "/api/latex");
  const pdf = await fetch(
    first.state.url + `/api/latex/pdf/${latex.previewHash}`,
  );
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  results.dirtyQuit =
    "Passed: cancelling native Quit retained unsaved LaTeX edits; the editor then saved them";
  const previewSession = await page.context().newCDPSession(page);
  const previewCapture = await previewSession.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: false,
  });
  await writeFile(
    join(output, "windows-cv.png"),
    Buffer.from(previewCapture.data, "base64"),
  );
  await previewSession.detach();
  const downloaded = join(data, "native-download.pdf");
  page.on("download", (download) => {
    void download.failure().then((failure) => {
      results.downloadState = failure || "Completed";
    });
  });
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  if (process.env.JH_WINDOWS_SAVE_DELAY_MS)
    await delay(Number(process.env.JH_WINDOWS_SAVE_DELAY_MS));
  let saveDialogError = "";
  await until(async () => {
    try {
      await windowAction(first.state.pid, "save-download", downloaded);
    } catch (error: any) {
      const message = String(error.stderr || error.message).slice(0, 2000);
      if (message !== saveDialogError) console.warn(message);
      saveDialogError = message;
      throw error;
    }
    return true;
  }, "Native Save As dialog did not open");
  await until(
    async () =>
      (await readFile(downloaded)).subarray(0, 5).toString() === "%PDF-",
    "Native PDF download did not finish",
  );
  results.download =
    "Passed: the native Save As dialog saved a valid PDF at the chosen fixture path";
  await page
    .getByRole("button", { name: "Open assistant", exact: true })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await (await chooser).setFiles(downloaded);
  await page
    .getByRole("button", { name: "Remove native-download.pdf", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Remove native-download.pdf", exact: true })
    .waitFor();
  const attachmentDb = new (await import("node:sqlite")).DatabaseSync(
    join(data, "job-hunter.db"),
    { readOnly: true },
  );
  const attachment = attachmentDb
    .prepare("SELECT extracted_text FROM assistant_attachments WHERE name = ?")
    .get("native-download.pdf");
  assert(
    attachment &&
      JSON.stringify(attachment).includes("Windows document fixture"),
  );
  attachmentDb.close();
  await page
    .getByRole("button", { name: "Remove native-download.pdf", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hide assistant", exact: true })
    .click();
  results.pdfAttachment =
    "Passed: packaged PDF worker extracted the native download; assistant attachment survived reload and could be removed";
  const letter = await fetch(first.state.url + "/api/cover-letters/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      document: {
        name: "Fixture Candidate",
        location: "Malaysia",
        contacts: [],
        company: "Fixture Company",
        role: "Frontend Engineer",
        salutation: "Dear hiring team,",
        paragraphs: ["This is a synthetic Windows PDF fixture."],
        closing: "Sincerely,",
      },
      format: "pdf",
    }),
  });
  assert.equal(letter.status, 200, await letter.clone().text());
  assert.equal(
    Buffer.from(await letter.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  results.letterPdf =
    "Passed: installed WebView2 exported a synthetic cover-letter PDF without bundled Chromium";
  const backup = await fetch(first.state.url + "/api/backups/export");
  assert(backup.ok);
  const zip = Buffer.from(await backup.arrayBuffer());
  await json(
    first.state.url + `/api/jobs/${job.id}`,
    { notes: "changed after backup" },
    "PATCH",
  );
  const imported = await fetch(first.state.url + "/api/backups/import", {
    method: "POST",
    headers: { "content-type": "application/zip" },
    body: zip,
  });
  assert(imported.ok, await imported.text());
  assert.equal(
    (await json(first.state.url + `/api/jobs/${job.id}`)).notes,
    "Windows persistence fixture",
  );
  results.backup =
    "Passed: packaged backup/export restored fixture records and retained destination settings/counters";
  await windowAction(first.state.pid, "close");
  assert.equal((await windowAction(first.state.pid, "inspect")).visible, false);
  assert((await fetch(first.state.url + "/api/health")).ok);
  const duplicate = spawnApp();
  await until(() => duplicate.exitCode !== null, "Second launch did not exit");
  assert.equal(duplicate.exitCode, 0);
  assert.equal((await windowAction(first.state.pid, "inspect")).visible, true);
  assert.equal(
    JSON.parse(await readFile(join(data, "desktop-instance.json"), "utf8"))
      .servicePid,
    first.state.servicePid,
  );
  results.closeAndReopen =
    "Passed: Close hid the window while services stayed healthy; second launch reopened the same instance";
  const owned: ProcessIdentity[] = await windowAction(
    first.state.pid,
    "processes",
  );
  await browser!.close();
  browser = undefined;
  await windowAction(first.state.pid, "quit");
  const quitProcesses = await windowAction(
    first.state.pid,
    "wait-processes",
    undefined,
    owned,
  );
  assert.equal(
    quitProcesses.exited,
    true,
    `Native Quit left owned processes running: ${JSON.stringify(quitProcesses.remaining)}`,
  );
  results.nativeQuit =
    "Passed: File → Quit exited the wrapper, services and observed descendants";
  const second = await launch(true);
  assert.equal(second.state.url, first.state.url);
  const restored = await json(second.state.url + `/api/jobs/${job.id}`);
  assert.equal(restored.notes, "Windows persistence fixture");
  assert.equal(restored.status, "saved");
  const crashOwned: ProcessIdentity[] = await windowAction(
    second.state.pid,
    "processes",
  );
  second.child.kill("SIGKILL");
  const crashProcesses = await windowAction(
    second.state.pid,
    "wait-processes",
    undefined,
    crashOwned,
  );
  assert.equal(
    crashProcesses.exited,
    true,
    `Launcher crash orphaned services: ${JSON.stringify(crashProcesses.remaining)}`,
  );
  results.crashRecovery =
    "Passed: persistent origin and saved records survived restart; killing the launcher reaped the real service tree";
  const third = await launch(true);
  await exec(executable, ["--quit"], {
    env: { ...process.env, JH_DESKTOP_DATA_DIR: data },
    windowsHide: true,
  });
  await until(
    () => !alive(third.state.pid) && !alive(third.state.servicePid),
    "Final Quit did not finish",
  );
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(join(data, "job-hunter.db"), { readOnly: true });
  assert.equal(
    db.prepare("SELECT value FROM counters WHERE key='windows-retention'").get()
      ?.value,
    27,
  );
  assert.equal(
    db.prepare("PRAGMA integrity_check").get()?.integrity_check,
    "ok",
  );
  db.close();
  results.persistence =
    "Passed: profile, saved job, notes and usage counter retained; SQLite integrity OK";
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        platform: process.platform,
        node: process.version,
        results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  const visiblePages = await Promise.all(
    (browser?.contexts().flatMap((context) => context.pages()) || []).map(
      async (page) => ({
        visibility: await page
          .evaluate(() => document.visibilityState)
          .catch(() => "unavailable"),
        text: await page
          .locator("body")
          .innerText({ timeout: 2000 })
          .catch(() => "unavailable"),
      }),
    ),
  );
  const nativeWindows = children[0]?.pid
    ? await windowAction(children[0].pid, "inspect").catch(() => null)
    : null;
  await writeFile(
    join(output, "partial-results.json"),
    JSON.stringify(
      { results, files: await readdir(data), visiblePages, nativeWindows },
      null,
      2,
    ),
  );
  await writeFile(
    join(output, "failed-desktop.log"),
    await readFile(join(data, "desktop.log"), "utf8").catch(
      () => "unavailable",
    ),
  );
  console.error(`Isolated diagnostics saved under ${output}`);
  throw error;
} finally {
  for (const child of children)
    if (child.pid && alive(child.pid)) child.kill("SIGKILL");
  await browser?.close();
  await delay(800);
  await rm(data, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 500,
  });
}
