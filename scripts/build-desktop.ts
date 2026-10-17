import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBundleLinks } from "../core/desktop/package.ts";

if (process.platform === "win32") {
  await import("./build-desktop-windows.ts");
  process.exit(0);
}
if (process.platform !== "darwin")
  throw new Error("The desktop build currently targets macOS.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "build/desktop/ununemploy.app");
const staging = join(root, "build/desktop/ununemploy-staging.app");
const resources = join(staging, "Contents/Resources");
const app = join(resources, "app");
const run = async (
  command: string,
  args: string[],
  cwd = root,
  env = process.env,
) => {
  await new Promise<void>((yes, no) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.once("error", no);
    child.once("exit", (code) =>
      code === 0 ? yes() : no(new Error(`${command} failed (${code})`)),
    );
  });
};
await rm(staging, { recursive: true, force: true });
await mkdir(join(staging, "Contents/MacOS"), { recursive: true });
await mkdir(join(resources, "bin"), { recursive: true });
await mkdir(app, { recursive: true });
await run("npm", ["run", "build"]);
// Explicit allowlist: no .env, databases, candidate evidence or user configuration.
for (const name of [
  "core",
  "server",
  "worker",
  "dist",
  "data/geography",
  "package.json",
  "package-lock.json",
])
  await cp(join(root, name), join(app, name), {
    recursive: true,
    verbatimSymlinks: true,
  });
await mkdir(join(app, "scripts"));
await cp(
  join(root, "scripts/desktop-service.ts"),
  join(app, "scripts/desktop-service.ts"),
);
await run(
  "npm",
  ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
  app,
);
let codexVersion: string;
if (process.argv.includes("--reuse-runtimes")) {
  const previousResources = join(output, "Contents/Resources");
  const previousBuild = JSON.parse(
    await readFile(join(previousResources, "build.json"), "utf8"),
  );
  if (
    previousBuild.arch !== process.arch ||
    previousBuild.node !== process.version
  )
    throw new Error(
      "Runtime cache does not match this Node version and architecture.",
    );
  codexVersion = previousBuild.codex;
  for (const name of ["bin", "codex", "tex-cache", "browsers"])
    await cp(join(previousResources, name), join(resources, name), {
      recursive: true,
      verbatimSymlinks: true,
    });
} else {
  await cp(process.execPath, join(resources, "bin/node"));
  const codexEntry = realpathSync(
    execFileSync("/usr/bin/which", ["codex"], { encoding: "utf8" }).trim(),
  );
  const codexRoot = dirname(dirname(codexEntry));
  codexVersion = JSON.parse(
    await readFile(join(codexRoot, "package.json"), "utf8"),
  ).version;
  const target =
    process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  const vendor = join(
    codexRoot,
    `node_modules/@openai/codex-darwin-${process.arch}/vendor/${target}`,
  );
  if (!existsSync(join(vendor, "bin/codex")))
    throw new Error(
      "Install the official @openai/codex npm package for this Mac before building.",
    );
  await cp(vendor, join(resources, "codex"), {
    recursive: true,
    verbatimSymlinks: true,
  });
  await cp(join(codexRoot, "README.md"), join(resources, "codex/README.md"));

  // Pin/checksum the portable compiler; a Homebrew binary can depend on external dylibs.
  process.env.JH_DATA_DIR = join(resources, "compiler-setup");
  process.env.JH_LATEX_CACHE = join(resources, "tex-cache");
  delete process.env.JH_TECTONIC_BIN;
  const { installTectonic, setupLatex } =
    await import("../core/latex/setup.ts");
  await installTectonic();
  await rename(
    join(process.env.JH_DATA_DIR, "latex-runtime/bin/tectonic"),
    join(resources, "bin/tectonic"),
  );
  process.env.JH_TECTONIC_BIN = join(resources, "bin/tectonic");
  await setupLatex();
  await rm(join(resources, "compiler-setup"), { recursive: true, force: true });
  await run(
    process.execPath,
    ["node_modules/playwright/cli.js", "install", "chromium", "--only-shell"],
    app,
    { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(resources, "browsers") },
  );
}
await run(
  "go",
  [
    "build",
    "-trimpath",
    "-ldflags=-s -w",
    "-o",
    join(staging, "Contents/MacOS/ununemploy"),
    ".",
  ],
  join(root, "desktop"),
);
await writeFile(
  join(staging, "Contents/Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>ununemploy</string>
<key>CFBundleDisplayName</key><string>ununemploy</string>
<key>CFBundleIdentifier</key><string>local.ununemploy.desktop</string>
<key>CFBundleExecutable</key><string>ununemploy</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>\n`,
);
const hash = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
await writeFile(
  join(resources, "build.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      revision: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      node: process.version,
      codex: codexVersion,
      hashes: {
        node: await hash(join(resources, "bin/node")),
        codex: await hash(join(resources, "codex/bin/codex")),
        tectonic: await hash(join(resources, "bin/tectonic")),
        wrapper: await hash(join(staging, "Contents/MacOS/ununemploy")),
      },
    },
    null,
    2,
  ) + "\n",
);
// Local ad-hoc signature, not a notarized distributable release.
await checkBundleLinks(staging);
await run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", staging]);
await rm(output, { recursive: true, force: true });
await rename(staging, output);
console.log(`Built ${output}`);
