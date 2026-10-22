import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

if (process.platform !== "win32")
  throw new Error("Build Windows setup on Windows.");
const root = resolve(".");
const packageRoot = join(root, "build/desktop/windows");
const output = join(root, "build/releases");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))
  throw new Error("Invalid package version");
const compiler = [
  process.env.ISCC,
  join(root, "build/tools/inno/ISCC.exe"),
  "C:/Program Files (x86)/Inno Setup 6/ISCC.exe",
  "C:/Program Files/Inno Setup 7/ISCC.exe",
].find((p) => p && existsSync(p));
if (!compiler)
  throw new Error("Install Inno Setup or set ISCC to its compiler path.");
await mkdir(output, { recursive: true });
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `$ErrorActionPreference = 'Stop'; . '${join(packageRoot, "package.ps1").replaceAll("'", "''")}'; Assert-Package '${packageRoot.replaceAll("'", "''")}'`,
  ],
  { stdio: "inherit", windowsHide: true },
);
execFileSync(
  compiler,
  [
    `/DAppVersion=${version}`,
    `/DPackageRoot=${packageRoot}`,
    `/DOutputRoot=${output}`,
    "deploy/windows/setup.iss",
  ],
  { stdio: "inherit", windowsHide: true },
);
const name = `ununemploy-${version}-windows-x64-setup.exe`;
const installer = await readFile(join(output, name));
const checksum = createHash("sha256").update(installer).digest("hex");
await writeFile(join(output, name + ".sha256"), `${checksum}  ${name}\n`);
let files = 0,
  bytes = 0;
async function measure(directory: string) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await measure(path);
    else {
      files++;
      bytes += (await stat(path)).size;
    }
  }
}
await measure(packageRoot);
const metadata = {
  ...JSON.parse(
    await readFile(join(packageRoot, "resources/build.json"), "utf8"),
  ),
  installer: name,
  sha256: checksum,
  downloadBytes: installer.length,
  unpackedBytes: bytes,
  files,
};
await writeFile(
  join(output, "windows-release.json"),
  JSON.stringify(metadata, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      installer: join(output, name),
      downloadMiB: +(installer.length / 1048576).toFixed(2),
      unpackedMiB: +(bytes / 1048576).toFixed(2),
      files,
    },
    null,
    2,
  ),
);
