import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const executable = resolve(
  process.argv[2] || "build/desktop/ununemploy.app/Contents/MacOS/ununemploy",
);
const directory = await mkdtemp(join(tmpdir(), "ununemploy-native-"));
process.env.JH_DATA_DIR = directory;
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
store.incrementCounter("desktop-retention", 27);
store.db.close();
const results: Record<string, unknown> = {};
const children: ChildProcess[] = [];
type State = { pid: number; servicePid: number; url: string };
async function until<T>(
  fn: () => T | Promise<T>,
  message: string,
  timeout = 20000,
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value as NonNullable<T>;
    } catch {
      /* startup/shutdown transition */
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
async function launch() {
  const child = spawn(executable, [], {
    env: {
      ...process.env,
      PATH: "/usr/bin:/bin",
      JH_DESKTOP_DATA_DIR: directory,
    },
    stdio: "ignore",
  });
  children.push(child);
  const state = await until(async () => {
    const state = JSON.parse(
      await readFile(join(directory, "desktop-instance.json"), "utf8"),
    ) as State;
    if (state.pid !== child.pid || !state.servicePid) return null;
    const r = await fetch(state.url + "/api/health", {
      signal: AbortSignal.timeout(1500),
    });
    return r.ok ? state : null;
  }, "Native app did not become healthy");
  return { child, state };
}
try {
  const first = await launch();
  results.startup = "Passed with PATH=/usr/bin:/bin";
  const bootstrap = await (
    await fetch(first.state.url + "/api/bootstrap")
  ).json();
  assert.equal(bootstrap.settings.scheduleEnabled, false);
  assert.equal(bootstrap.profile.revision, 1);
  results.fixtureIsolation =
    "Scanning and inference disabled; synthetic profile retained";
  const duplicate = spawn(executable, [], {
    env: { ...process.env, JH_DESKTOP_DATA_DIR: directory },
    stdio: "ignore",
  });
  children.push(duplicate);
  await until(
    () => duplicate.exitCode !== null,
    "Duplicate launch did not exit",
  );
  assert.equal(duplicate.exitCode, 0);
  assert.equal(
    JSON.parse(readFileSync(join(directory, "desktop-instance.json"), "utf8"))
      .servicePid,
    first.state.servicePid,
  );
  results.singleInstance =
    "Passed: second launch exits without another service";
  first.child.kill("SIGTERM");
  await until(
    () => !alive(-first.state.servicePid) && !alive(first.state.pid),
    "Quit left services running",
  );
  assert.equal(existsSync(join(directory, "desktop-instance.json")), false);
  results.quit = "Passed: wrapper/service exit and instance state removed";
  const second = await launch();
  assert.equal(second.state.url, first.state.url);
  results.relaunchOrigin = "Passed: same local origin reused";
  second.child.kill("SIGKILL");
  await until(
    () => !alive(-second.state.servicePid),
    "Force quit orphaned the service",
  );
  results.forceQuit = "Passed: parent pipe closes and service exits";
  const third = await launch();
  const response = await (
    await fetch(third.state.url + "/api/bootstrap")
  ).json();
  assert.equal(response.profile.revision, 1);
  assert.equal(response.settings.scheduleEnabled, false);
  results.crashRecovery =
    "Passed: stale instance state recovered and data retained";
  third.child.kill("SIGTERM");
  await until(
    () => !alive(-third.state.servicePid) && !alive(third.state.pid),
    "Final cleanup failed",
  );
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(join(directory, "job-hunter.db"), {
    readOnly: true,
  });
  assert.equal(
    db.prepare("SELECT value FROM counters WHERE key='desktop-retention'").get()
      ?.value,
    27,
  );
  assert.equal(
    db.prepare("PRAGMA integrity_check").get()?.integrity_check,
    "ok",
  );
  db.close();
  results.persistence =
    "Passed: counter and SQLite integrity preserved through restarts";
  await writeFile(
    ".local-data/verification/desktop-lifecycle.json",
    JSON.stringify(
      { checkedAt: new Date().toISOString(), executable, results },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  for (const child of children)
    if (child.pid && alive(child.pid)) child.kill("SIGTERM");
  await rm(directory, { recursive: true, force: true });
}
