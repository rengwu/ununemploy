import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  writeWindowsPackageManifest,
  windowsPackageManifest,
} from "../core/desktop/windows-package.ts";

const exec = promisify(execFile);
const psQuote = (value: string) => "'" + value.replaceAll("'", "''") + "'";

test(
  "Windows installer validates complete packages before replacing application files",
  { skip: process.platform !== "win32", timeout: 120000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "ununemploy-installer-"));
    const source = join(root, "package");
    const destination = join(root, "installed");
    const localData = join(root, "local");
    const personal = join(localData, "ununemploy/job-hunter.db");
    const env = { ...process.env, LOCALAPPDATA: localData };
    const installer = join(source, "install.ps1");
    async function file(name: string, content: string) {
      const path = join(source, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
    async function run(...args: string[]) {
      return exec(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          installer,
          "-Destination",
          destination,
          "-NoShortcut",
          ...args,
        ],
        { env, windowsHide: true },
      );
    }
    async function unchanged() {
      assert.equal(await readFile(personal, "utf8"), "synthetic personal data");
      assert.equal(
        await readFile(join(destination, "ununemploy.exe"), "utf8"),
        "fixture ununemploy.exe",
      );
      assert.deepEqual(
        (await readdir(root)).filter((name) =>
          /\.(installing|previous)-/.test(name),
        ),
        [],
      );
    }
    try {
      await mkdir(source);
      for (const script of ["install.ps1", "package.ps1"])
        await cp(resolve("deploy/windows", script), join(source, script));
      for (const name of [
        "ununemploy.exe",
        "resources/bin/node.exe",
        "resources/bin/tectonic.exe",
        "resources/bin/ununemploy-tex-sandbox.exe",
        "resources/app/core/ai/pi-sdk.ts",
        "resources/app/package.json",
        "resources/app/package-lock.json",
        "resources/app/dist/index.html",
        "resources/app/server/index.ts",
        "resources/app/worker/index.ts",
        "resources/app/scripts/desktop-service.ts",
        "resources/app/scripts/desktop-bootstrap.mjs",
        "resources/app/node_modules/fixture.js",
        "resources/tex-cache/fixture",
        "resources/browsers/fixture.exe",
        "resources/app/node_modules/snow ☃/fixture.js",
      ])
        await file(name, `fixture ${name}`);
      await file(
        "resources/build.json",
        JSON.stringify({ platform: "win32", arch: "x64" }),
      );
      await mkdir(dirname(personal), { recursive: true });
      await writeFile(personal, "synthetic personal data");
      await writeWindowsPackageManifest(source);

      await t.test(
        "check reports actual installed WebView2 without creating a destination",
        async () => {
          assert.match(
            (await run("-Check")).stdout,
            /Package checksums verified. WebView2 \d/,
          );
          await assert.rejects(readFile(join(destination, "ununemploy.exe")), {
            code: "ENOENT",
          });
        },
      );
      await t.test(
        "install and replacement retain separate data and repair an older package",
        async () => {
          await run();
          await rm(join(destination, windowsPackageManifest)); // earlier local package format
          await writeFile(
            join(destination, "resources/bin/node.exe"),
            "broken old runtime",
          );
          await writeFile(
            join(destination, "obsolete.txt"),
            "old application file",
          );
          await run();
          await assert.rejects(readFile(join(destination, "obsolete.txt")), {
            code: "ENOENT",
          });
          assert.equal(
            await readFile(join(destination, "resources/bin/node.exe"), "utf8"),
            "fixture resources/bin/node.exe",
          );
          assert.equal(
            await readFile(
              join(destination, "resources/app/node_modules/snow ☃/fixture.js"),
              "utf8",
            ),
            "fixture resources/app/node_modules/snow ☃/fixture.js",
          );
          await unchanged();
        },
      );
      await t.test(
        "running applications are detected through DOS short-path aliases",
        async (t) => {
          const alias = (
            await exec(
              "powershell.exe",
              [
                "-NoProfile",
                "-Command",
                `(New-Object -ComObject Scripting.FileSystemObject).GetFolder(${psQuote(destination)}).ShortPath`,
              ],
              { windowsHide: true },
            )
          ).stdout.trim();
          if (alias.toLowerCase() === destination.toLowerCase()) {
            t.skip("This filesystem does not provide DOS short names");
            return;
          }
          const executable = join(destination, "ununemploy.exe");
          await cp(process.execPath, executable);
          const running = spawn(
            executable,
            ["-e", "setInterval(()=>{},1000)"],
            { windowsHide: true, stdio: "ignore" },
          );
          const exited = new Promise<void>((yes) =>
            running.once("exit", () => yes()),
          );
          try {
            await assert.rejects(
              exec(
                "powershell.exe",
                [
                  "-NoProfile",
                  "-ExecutionPolicy",
                  "Bypass",
                  "-File",
                  installer,
                  "-Destination",
                  alias,
                  "-NoShortcut",
                ],
                { env, windowsHide: true },
              ),
              /Quit ununemploy before installing/,
            );
            await assert.rejects(
              exec(
                "powershell.exe",
                [
                  "-NoProfile",
                  "-ExecutionPolicy",
                  "Bypass",
                  "-File",
                  resolve("deploy/windows/setup-uninstall-check.ps1"),
                  "-Destination",
                  alias,
                ],
                { env, windowsHide: true },
              ),
              (error: unknown) =>
                !!error &&
                typeof error === "object" &&
                "code" in error &&
                error.code === 2,
            );
          } finally {
            running.kill("SIGKILL");
            await exited;
            await writeFile(executable, "fixture ununemploy.exe");
          }
          await unchanged();
        },
      );
      await t.test(
        "same-size runtime corruption rejects the update before replacement",
        async () => {
          const path = "resources/bin/node.exe";
          const original = await readFile(join(source, path));
          await file(path, "x".repeat(original.length));
          await assert.rejects(
            run(),
            /Package checksum mismatch: resources\/bin\/node.exe/,
          );
          await unchanged();
          await writeFile(join(source, path), original);
        },
      );
      await t.test(
        "missing dependencies and unlisted files reject the update",
        async () => {
          const path = "resources/app/node_modules/fixture.js";
          await rm(join(source, path));
          await assert.rejects(
            run(),
            /Incomplete package: missing resources\/app\/node_modules\/fixture.js/,
          );
          await file(path, `fixture ${path}`);
          await file(
            "unexpected-private-record.txt",
            "synthetic private fixture",
          );
          await assert.rejects(run(), /files outside its checksum inventory/);
          await rm(join(source, "unexpected-private-record.txt"));
          await unchanged();
        },
      );
      await t.test(
        "missing inventory, duplicate names and traversal entries are rejected",
        async () => {
          const inventoryPath = join(source, windowsPackageManifest);
          const original = await readFile(inventoryPath, "utf8");
          await rm(inventoryPath);
          await assert.rejects(run(), /checksum inventory is missing/);
          const manifest = JSON.parse(original);
          manifest.files.push(manifest.files[0]);
          await writeFile(inventoryPath, JSON.stringify(manifest));
          await assert.rejects(run(), /Invalid or duplicate path/);
          manifest.files.at(-1).path = "../outside.txt";
          await writeFile(inventoryPath, JSON.stringify(manifest));
          await assert.rejects(run(), /Invalid or duplicate path/);
          await writeFile(inventoryPath, original);
          await unchanged();
        },
      );
      await t.test(
        "source and destination junctions cannot redirect replacement or deletion",
        async () => {
          const outside = join(root, "outside");
          await mkdir(outside);
          const sentinel = join(outside, "sentinel.txt");
          await writeFile(sentinel, "retain me");
          const link = join(source, "linked");
          await symlink(outside, link, "junction");
          await assert.rejects(
            writeWindowsPackageManifest(source),
            /cannot contain links/,
          );
          await assert.rejects(run(), /cannot contain links or junctions/);
          await rm(link);
          const targetLink = join(root, "redirected");
          await symlink(destination, targetLink, "junction");
          await assert.rejects(
            exec(
              "powershell.exe",
              [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                installer,
                "-Destination",
                targetLink,
                "-NoShortcut",
              ],
              { env, windowsHide: true },
            ),
            /cannot use links or junctions/,
          );
          await rm(targetLink);
          assert.equal(await readFile(sentinel, "utf8"), "retain me");
          await unchanged();
        },
      );
      await t.test(
        "missing WebView2 is reported with an actionable prerequisite error",
        async () => {
          // Simulate only registry absence; do not uninstall or edit the host runtime.
          const script = `. ${psQuote(join(source, "package.ps1"))}; function Get-WebView2Version { return $null }; Assert-WindowsPrerequisites`;
          await assert.rejects(
            exec("powershell.exe", ["-NoProfile", "-Command", script], {
              windowsHide: true,
            }),
            /Microsoft Edge WebView2 Runtime is required/,
          );
        },
      );
      await t.test(
        "failed publication restores the previous application and removes staging",
        async () => {
          // Inject one publication failure; both real directory moves (retirement and
          // rollback) and cleanup still run. This is fault injection, not an observed
          // OS failure on the successful publication path.
          await writeFile(
            join(destination, "retained-old-file.txt"),
            "old package sentinel",
          );
          const original = await readFile(installer, "utf8");
          const failing = original.replace(
            "[IO.Directory]::Move($stagingPath, $destinationPath)",
            "throw 'synthetic publication failure'",
          );
          assert.notEqual(failing, original);
          await writeFile(installer, failing);
          await writeWindowsPackageManifest(source);
          await assert.rejects(run(), /synthetic publication failure/);
          assert.equal(
            await readFile(join(destination, "retained-old-file.txt"), "utf8"),
            "old package sentinel",
          );
          await unchanged();
          await writeFile(installer, original);
          await writeWindowsPackageManifest(source);
        },
      );
      await t.test(
        "a locked old application rejects replacement without partially moving files",
        async () => {
          const script = `$ErrorActionPreference='Stop'; $stream=[IO.File]::Open(${psQuote(join(destination, "ununemploy.exe"))},[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read); try { & ${psQuote(installer)} -Destination ${psQuote(destination)} -NoShortcut } finally { $stream.Dispose() }`;
          await assert.rejects(
            exec(
              "powershell.exe",
              ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
              { env, windowsHide: true },
            ),
            /Access to the path[\s\S]*is denied/,
          );
          assert.equal(
            await readFile(join(destination, "retained-old-file.txt"), "utf8"),
            "old package sentinel",
          );
          assert.equal(
            await readFile(join(destination, "resources/bin/node.exe"), "utf8"),
            "fixture resources/bin/node.exe",
          );
          await unchanged();
        },
      );
      await t.test(
        "setup cancellation restores the previous package and commit retires it",
        async () => {
          const state = join(root, "install-state.json");
          async function finish(mode: string, target = destination) {
            return exec(
              "powershell.exe",
              [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                resolve("deploy/windows/setup-transaction.ps1"),
                "-Mode",
                mode,
                "-Package",
                source,
                "-Destination",
                target,
                "-StateFile",
                state,
              ],
              { env, windowsHide: true },
            );
          }
          await run("-TransactionFile", state);
          await assert.rejects(
            readFile(join(destination, "retained-old-file.txt")),
            { code: "ENOENT" },
          );
          await finish("Rollback");
          assert.equal(
            await readFile(join(destination, "retained-old-file.txt"), "utf8"),
            "old package sentinel",
          );
          await unchanged();
          await run("-TransactionFile", state);
          await finish("Commit");
          await unchanged();
          const fresh = join(root, "new-installation");
          await exec(
            "powershell.exe",
            [
              "-NoProfile",
              "-ExecutionPolicy",
              "Bypass",
              "-File",
              installer,
              "-Destination",
              fresh,
              "-NoShortcut",
              "-TransactionFile",
              state,
            ],
            { env, windowsHide: true },
          );
          await finish("Rollback", fresh);
          await assert.rejects(readFile(join(fresh, "ununemploy.exe")), {
            code: "ENOENT",
          });
          await unchanged();
        },
      );
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
