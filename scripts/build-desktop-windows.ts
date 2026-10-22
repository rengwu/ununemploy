import { packageWindowsApp } from "./package-windows-app.ts";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBundleLinks } from "../core/desktop/package.ts";
import { writeWindowsPackageManifest } from "../core/desktop/windows-package.ts";

if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error("This build requires Windows x64.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "build/desktop/windows");
const staging = join(root, "build/desktop/windows-staging");
const previous = join(root, "build/desktop/windows-previous");
const resources = join(staging, "resources");
const app = join(resources, "app");
async function run(
  command: string,
  args: string[],
  cwd = root,
  env = process.env,
) {
  await new Promise<void>((yes, no) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", no);
    child.once("exit", (code) =>
      code === 0 ? yes() : no(new Error(`${command} failed (${code})`)),
    );
  });
}
async function remove(path: string) {
  if (!resolve(path).startsWith(join(root, "build/desktop") + sep))
    throw new Error("Invalid build destination");
  await rm(path, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
const hash = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
// Refuse a live package, including instances with fixture data.
const processes: string[] = JSON.parse(
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -Filter \"Name='ununemploy.exe'\" | Select-Object -ExpandProperty ExecutablePath)",
    ],
    { encoding: "utf8", windowsHide: true },
  ),
);
if (
  processes.some(
    (path) =>
      path &&
      resolve(path).toLowerCase() ===
        join(output, "ununemploy.exe").toLowerCase(),
  )
)
  throw new Error("Quit the built Windows application before rebuilding it.");
await remove(staging);
// Build only code/generic assets. The user data directory is outside this tree.
await run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]);
await run(process.execPath, ["node_modules/vite/bin/vite.js", "build"]);
await mkdir(join(resources, "bin"), { recursive: true });
await mkdir(app, { recursive: true });
await packageWindowsApp(app);
const lock = await readFile(join(root, "package-lock.json"), "utf8");
await writeFile(join(resources, "installed-lock.json"), lock);
await cp(process.execPath, join(resources, "bin/node.exe"));
await run("go", ["mod", "download"], join(root, "desktop"));
const notices = join(resources, "licenses");
await mkdir(notices, { recursive: true });
for (const [name, url] of [
  [
    "node.txt",
    `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`,
  ],
  [
    "tectonic.txt",
    "https://raw.githubusercontent.com/tectonic-typesetting/tectonic/tectonic%400.15.0/LICENSE",
  ],
]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok)
    throw new Error(`Could not fetch ${name} license (${response.status})`);
  await writeFile(join(notices, name), await response.text());
}
const moduleCache = execFileSync("go", ["env", "GOMODCACHE"], {
  encoding: "utf8",
  windowsHide: true,
}).trim();
for (const [name, module] of [
  ["go-webview2", "github.com/wailsapp/go-webview2@v1.0.23"],
  [
    "go-winloader",
    "github.com/jchv/go-winloader@v0.0.0-20210711035445-715c2860da7e",
  ],
  ["golang-x-sys", "golang.org/x/sys@v0.27.0"],
])
  await cp(
    join(
      moduleCache,
      module,
      name === "go-winloader" ? "LICENSE.md" : "LICENSE",
    ),
    join(notices, name + ".txt"),
  );
await run(
  "go",
  [
    "build",
    "-trimpath",
    "-ldflags=-s -w",
    "-o",
    join(resources, "bin/ununemploy-tex-sandbox.exe"),
    "./cmd/texsandbox",
  ],
  join(root, "desktop"),
);
// Retain generic setup downloads between interrupted builds.
const compilerSetup = join(root, "build/desktop/windows-compiler");
process.env.JH_DATA_DIR = compilerSetup;
process.env.JH_LATEX_CACHE = join(compilerSetup, "latex-runtime/cache");
process.env.JH_LATEX_SANDBOX = join(
  resources,
  "bin/ununemploy-tex-sandbox.exe",
);
delete process.env.JH_TECTONIC_BIN;
const { installTectonic, setupLatex } = await import("../core/latex/setup.ts");
if (!existsSync(join(compilerSetup, "latex-runtime/bin/tectonic.exe")))
  await installTectonic();
process.env.JH_TECTONIC_BIN = join(
  compilerSetup,
  "latex-runtime/bin/tectonic.exe",
);
await setupLatex();
await cp(process.env.JH_TECTONIC_BIN, join(resources, "bin/tectonic.exe"));
await cp(process.env.JH_LATEX_CACHE, join(resources, "tex-cache"), {
  recursive: true,
});
await run(
  "go",
  [
    "build",
    "-trimpath",
    "-ldflags=-H windowsgui -s -w",
    "-o",
    join(staging, "ununemploy.exe"),
    ".",
  ],
  join(root, "desktop"),
);
await checkBundleLinks(staging);
await writeFile(
  join(resources, "build.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      piAi: "1.3.0",
      version: JSON.parse(await readFile(join(root, "package.json"), "utf8"))
        .version,
      packageFormat: 2,
      revision: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
      }).trim(),
      stage: process.env.CI ? "ci-windows-build" : "local-windows-build",
      dirty: !!execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", windowsHide: true }).trim(),
      bundled: [
        "node",
        "pi-ai-openai",
        "isolated-latex",
        "webview2-pdf",
        "application",
      ],
      signing: "unsigned local build",
      webview2: "installed Evergreen Runtime required",
      hashes: {
        wrapper: await hash(join(staging, "ununemploy.exe")),
        node: await hash(process.execPath),
        application: await hash(join(app, "runtime/desktop-service.mjs")),
        tectonic: await hash(process.env.JH_TECTONIC_BIN),
        sandbox: await hash(process.env.JH_LATEX_SANDBOX),
      },
    },
    null,
    2,
  ) + "\n",
);
await cp(
  join(root, "deploy/windows/install.ps1"),
  join(staging, "install.ps1"),
);
await cp(
  join(root, "deploy/windows/package.ps1"),
  join(staging, "package.ps1"),
);
await writeWindowsPackageManifest(staging);
await remove(previous);
if (existsSync(output)) await rename(output, previous);
try {
  await rename(staging, output);
} catch (error) {
  if (existsSync(previous)) await rename(previous, output);
  throw error;
}
await remove(previous);
console.log(`Built ${join(output, "ununemploy.exe")}`);
