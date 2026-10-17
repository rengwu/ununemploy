import { importDesktopData } from "../core/desktop/migrate.ts";
import { checkBundleLinks } from "../core/desktop/package.ts";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";

if (process.platform === "win32") {
  const installer = fileURLToPath(
    new URL("../build/desktop/windows/install.ps1", import.meta.url),
  );
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      installer,
      ...(process.env.JH_DESKTOP_APPLICATIONS
        ? ["-Destination", process.env.JH_DESKTOP_APPLICATIONS]
        : []),
    ],
    { stdio: "inherit", windowsHide: true },
  );
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const built = join(root, "build/desktop/ununemploy.app");
if (!existsSync(built)) throw new Error("Run npm run desktop:build first.");
const data =
  process.env.JH_DESKTOP_DATA_DIR ||
  join(homedir(), "Library/Application Support/ununemploy");
const applications =
  process.env.JH_DESKTOP_APPLICATIONS || join(homedir(), "Applications");
const envPath = join(root, ".env");
const envText = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
const env = parseEnv(envText);
const previous = resolve(root, env.JH_DATA_DIR || ".local-data");

await importDesktopData(previous, data);
await mkdir(data, { recursive: true, mode: 0o700 });
// Keep runtime-owned authentication and configured provider credentials local.
const retained = [
  "JH_CODEX_HOME",
  "CODEX_HOME",
  "JH_X_BEARER_TOKEN",
  "JH_WEB3_API_TOKEN",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "NO_PROXY",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
];
if (!existsSync(join(data, "desktop.env"))) {
  await writeFile(
    join(data, "desktop.env"),
    retained
      .filter((k) => env[k])
      .map((k) => `${k}=${JSON.stringify(env[k])}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
}
await mkdir(applications, { recursive: true });
const installed = join(applications, "ununemploy.app");
const stagingApp = join(applications, ".ununemploy-installing.app");
await rm(stagingApp, { recursive: true, force: true });
await cp(built, stagingApp, { recursive: true, verbatimSymlinks: true });
await checkBundleLinks(stagingApp);
const old = join(applications, ".ununemploy-previous.app");
await rm(old, { recursive: true, force: true });
if (existsSync(installed)) await rename(installed, old);
try {
  await rename(stagingApp, installed);
} catch (error) {
  if (existsSync(old)) await rename(old, installed);
  throw error;
}
await rm(old, { recursive: true, force: true });
// Future development launches use the same canonical database and budget counters.
if (!process.env.JH_DESKTOP_DATA_DIR && resolve(previous) !== resolve(data)) {
  const replacement = `JH_DATA_DIR=${JSON.stringify(data)}`;
  const text = /^JH_DATA_DIR=.*$/m.test(envText)
    ? envText.replace(/^JH_DATA_DIR=.*$/m, replacement)
    : envText.trimEnd() + "\n" + replacement + "\n";
  await writeFile(envPath + ".desktop-tmp", text, { mode: 0o600 });
  await rename(envPath + ".desktop-tmp", envPath);
}
console.log(
  `Installed ${installed}\nData: ${data}\nOriginal data remains at ${previous}`,
);
