import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const exec = promisify(execFile);
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const setup = resolve(
  `build/releases/ununemploy-${version}-windows-x64-setup.exe`,
);
const output = resolve(".local-data/verification/setup");
await mkdir(output, { recursive: true });
// Never overwrite an existing user's uninstall registration in a local test.
const key =
  "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{CF039767-4082-42CE-B1B4-A63F4F89DBF4}_is1";
const registered = await exec(
  "powershell.exe",
  ["-NoProfile", "-Command", `Test-Path -LiteralPath '${key}'`],
  { windowsHide: true },
);
assert.equal(
  registered.stdout.trim(),
  "False",
  "An installation is already registered. Run this check in a disposable Windows account.",
);
const root = await mkdtemp(join(tmpdir(), "ununemploy-setup-"));
const destination = join(root, "Installed App");
const personal = join(root, "local/ununemploy");
await mkdir(personal, { recursive: true });
await writeFile(
  join(personal, "retention-fixture.txt"),
  "Synthetic personal records must survive update and uninstall.\n",
);
const env = { ...process.env, LOCALAPPDATA: join(root, "local") };
const results: Record<string, unknown> = {};
const baseArgs = [
  "/VERYSILENT",
  "/SUPPRESSMSGBOXES",
  "/NORESTART",
  "/NOICONS",
  `/DIR=${destination}`,
];
const uninstaller = join(destination, "unins000.exe");
const rollbackOutput = resolve("build/verification/setup-rollback");
await mkdir(rollbackOutput, { recursive: true });
await exec(
  process.env.ISCC || resolve("build/tools/inno/ISCC.exe"),
  [
    `/DAppVersion=${version}`,
    `/DPackageRoot=${resolve("build/desktop/windows")}`,
    `/DOutputRoot=${rollbackOutput}`,
    "/DVerifyRollback",
    "deploy/windows/setup.iss",
  ],
  { windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024 },
);
const interruptedSetup = join(
  rollbackOutput,
  `ununemploy-${version}-windows-x64-setup.exe`,
);
let installed = false;
let database: Buffer | undefined;
async function retain() {
  assert.equal(
    await readFile(join(personal, "retention-fixture.txt"), "utf8"),
    "Synthetic personal records must survive update and uninstall.\n",
  );
  if (database)
    assert.deepEqual(await readFile(join(personal, "job-hunter.db")), database);
}
try {
  let started = Date.now();
  await exec(setup, [...baseArgs, `/LOG=${join(output, "install.log")}`], {
    env,
    windowsHide: true,
    timeout: 240000,
  });
  installed = true;
  const build = JSON.parse(
    await readFile(join(destination, "resources/build.json"), "utf8"),
  );
  assert.equal(build.version, version);
  assert.equal(build.packageFormat, 2);
  await retain();
  results.install = {
    result: "Passed",
    milliseconds: Date.now() - started,
    version,
  };
  const executable = join(destination, "ununemploy.exe");
  const freshEnv = {
    ...env,
    JH_DESKTOP_DATA_DIR: personal,
    PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`,
  };
  const fresh = spawn(executable, ["--headless"], {
    env: freshEnv,
    windowsHide: true,
    stdio: "ignore",
  });
  const exited = new Promise<void>((yes) => fresh.once("exit", () => yes()));
  try {
    let state: { url: string } | undefined;
    for (let attempt = 0; attempt < 300; attempt++) {
      state = await readFile(join(personal, "desktop-instance.json"), "utf8")
        .then(JSON.parse)
        .catch(() => undefined);
      if (
        state?.url &&
        (await fetch(state.url + "/api/health")
          .then((r) => r.ok)
          .catch(() => false))
      )
        break;
      await delay(100);
    }
    assert(state?.url, "Fresh installed services did not start");
    const profile = await fetch(state.url + "/api/profile").then((r) =>
      r.json(),
    );
    assert.equal(profile.profile.basics.name, "");
    assert.equal(profile.readiness.ready, false);
    let boot = await fetch(state.url + "/api/bootstrap").then((r) => r.json());
    for (
      let attempt = 0;
      boot.ai.state === "checking" && attempt < 200;
      attempt++
    ) {
      await delay(100);
      boot = await fetch(state.url + "/api/bootstrap").then((r) => r.json());
    }
    assert.equal(boot.counts.total, 0);
    assert.equal(boot.ai.state, "signed_out");
    await exec(executable, ["--quit"], { env: freshEnv, windowsHide: true });
    await Promise.race([
      exited,
      delay(10000).then(() => {
        throw new Error("Fresh instance did not quit");
      }),
    ]);
    database = await readFile(join(personal, "job-hunter.db"));
    results.firstRun = {
      result: "Passed",
      emptyProfile: true,
      noJobs: true,
      signedOut: true,
      noDeveloperTools: true,
    };
  } finally {
    if (fresh.exitCode === null) fresh.kill("SIGKILL");
    await exited;
  }
  await writeFile(
    join(destination, "obsolete-fixture.txt"),
    "Old application file",
  );
  await assert.rejects(
    exec(
      interruptedSetup,
      [...baseArgs, `/LOG=${join(output, "rollback.log")}`],
      { env, windowsHide: true, timeout: 120000 },
    ),
  );
  assert.match(
    await readFile(join(output, "rollback.log"), "utf8"),
    /Synthetic setup interruption/,
  );
  assert.equal(
    await readFile(join(destination, "obsolete-fixture.txt"), "utf8"),
    "Old application file",
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(join(destination, "resources/build.json"), "utf8"),
    ),
    build,
  );
  await retain();
  results.rollback = {
    result: "Passed",
    faultInjection: "Compiled setup interrupted after package publication",
    previousApplicationRestored: true,
    personalDataRetained: true,
  };
  started = Date.now();
  await exec(setup, [...baseArgs, `/LOG=${join(output, "update.log")}`], {
    env,
    windowsHide: true,
    timeout: 240000,
  });
  await assert.rejects(readFile(join(destination, "obsolete-fixture.txt")), {
    code: "ENOENT",
  });
  await retain();
  results.update = {
    result: "Passed",
    milliseconds: Date.now() - started,
    obsoleteFilesRemoved: true,
    personalDataRetained: true,
  };
  // The existing native driver exercises the installed executable with only
  // Windows directories on PATH and isolated synthetic application data.
  await new Promise<void>((yes, no) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/verify-desktop-windows.ts",
        join(destination, "ununemploy.exe"),
        "--verify-installer",
      ],
      {
        env: { ...env, JH_WINDOWS_VERIFY_OUTPUT: join(output, "native") },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.once("error", no);
    child.once("exit", (code) =>
      code === 0
        ? yes()
        : no(new Error(`Installed application verification failed (${code})`)),
    );
  });
  results.native = JSON.parse(
    await readFile(join(output, "native/results.json"), "utf8"),
  );
  await exec(
    uninstaller,
    [
      "/VERYSILENT",
      "/SUPPRESSMSGBOXES",
      "/NORESTART",
      `/LOG=${join(output, "uninstall.log")}`,
    ],
    { env, windowsHide: true, timeout: 120000 },
  );
  installed = false;
  for (let count = 0; count < 50; count++) {
    if (
      !(await readFile(join(destination, "ununemploy.exe")).catch(() => null))
    )
      break;
    await delay(100);
  }
  await assert.rejects(readFile(join(destination, "ununemploy.exe")), {
    code: "ENOENT",
  });
  await assert.rejects(readFile(join(destination, "resources/build.json")), {
    code: "ENOENT",
  });
  await retain();
  results.uninstall = { result: "Passed", personalDataRetained: true };
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        install: results.install,
        update: results.update,
        uninstall: results.uninstall,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await writeFile(
    join(output, "partial-results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  console.error(
    `Setup verification failed; isolated files retained at ${root}`,
  );
  throw error;
} finally {
  if (!installed)
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 500,
    });
}
