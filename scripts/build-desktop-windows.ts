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
const npm =
  process.env.npm_execpath ||
  join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
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
await run(process.execPath, [npm, "run", "build"]);
await mkdir(join(resources, "bin"), { recursive: true });
await mkdir(app, { recursive: true });
for (const name of ["core", "server", "worker", "dist", "data/geography"]) {
  const destination = join(app, name);
  if (!resolve(destination).startsWith(app + sep))
    throw new Error("Invalid package path");
  await rm(destination, { recursive: true, force: true });
  await cp(join(root, name), destination, {
    recursive: true,
    verbatimSymlinks: true,
  });
}
for (const name of ["package.json", "package-lock.json"])
  await cp(join(root, name), join(app, name));
await mkdir(join(app, "scripts"), { recursive: true });
for (const name of ["desktop-service.ts", "desktop-bootstrap.mjs"])
  await cp(join(root, "scripts", name), join(app, "scripts", name));
const lock = await readFile(join(root, "package-lock.json"), "utf8");
const previousLock = await readFile(
  join(output, "resources/installed-lock.json"),
  "utf8",
).catch(() => "");
if (lock === previousLock && process.argv.includes("--reuse-runtimes")) {
  await cp(
    join(output, "resources/app/node_modules"),
    join(app, "node_modules"),
    { recursive: true, verbatimSymlinks: true },
  );
} else {
  await run(
    process.execPath,
    [npm, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
    app,
  );
}
await writeFile(join(resources, "installed-lock.json"), lock);
await cp(process.execPath, join(resources, "bin/node.exe"));
// Authentication stays in the official runtime's user credential store.
const codexSource = resolve(
  process.env.JH_DESKTOP_CODEX_SOURCE ||
    execFileSync("where.exe", ["codex.exe"], {
      encoding: "utf8",
      windowsHide: true,
    })
      .trim()
      .split(/\r?\n/)[0],
);
const codexVersion = execFileSync(codexSource, ["--version"], {
  encoding: "utf8",
  windowsHide: true,
}).trim();
if (!/^codex-cli /.test(codexVersion))
  throw new Error("Expected the official Codex CLI executable.");
await mkdir(join(resources, "codex/bin"), { recursive: true });
await cp(codexSource, join(resources, "codex/bin/codex.exe"));
await run(
  "go",
  [
    "build",
    "-trimpath",
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
  process.execPath,
  ["node_modules/playwright/cli.js", "install", "chromium", "--only-shell"],
  app,
  {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: join(root, "build/desktop/windows-browsers"),
  },
);
await cp(
  join(root, "build/desktop/windows-browsers"),
  join(resources, "browsers"),
  { recursive: true },
);
await remove(join(resources, "browsers/.links"));
await run(
  "go",
  [
    "build",
    "-trimpath",
    "-ldflags=-H windowsgui",
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
      codex: codexVersion,
      revision: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
      }).trim(),
      stage: "local-windows-build",
      bundled: [
        "node",
        "codex",
        "isolated-latex",
        "chromium-pdf",
        "application",
      ],
      signing: "unsigned local build",
      webview2: "installed Evergreen Runtime required",
      hashes: {
        wrapper: await hash(join(staging, "ununemploy.exe")),
        node: await hash(process.execPath),
        codex: await hash(codexSource),
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
await cp(join(root, "deploy/windows/package.ps1"), join(staging, "package.ps1"));
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
