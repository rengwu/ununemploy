import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { compileLatex } from "./compile.ts";
import {
  findTectonic,
  latexCacheDirectory,
  latexRuntimeDirectory,
  latexSandboxExecutable,
  latexExecutableName,
} from "./runtime.ts";

// Pinned official release archives, shared with the Docker image's version.
// https://github.com/tectonic-typesetting/tectonic/releases/tag/tectonic%400.15.0
const releases: Record<string, { target: string; sha256: string }> = {
  "win32-x64": {
    target: "x86_64-pc-windows-msvc",
    sha256: "1d6bb76f049c8a3774f6e9d66e4b04e1a8c3dcb37527b6b41b7e894328e7bf29",
  },
  "darwin-arm64": {
    target: "aarch64-apple-darwin",
    sha256: "24bd46566fa30d41101848405e9cbc4645edb92d8f857c9d21262174fb70cd33",
  },
  "darwin-x64": {
    target: "x86_64-apple-darwin",
    sha256: "dd42576eaa4c0df58c243dd78b7b864d9deb405ffdfcdadd1b79a31faceab747",
  },
  "linux-arm64": {
    target: "aarch64-unknown-linux-musl",
    sha256: "1f59f9fb8eb65e8ba18658fc9016767e7d3e12488ded8b8fffa34254e51ce42c",
  },
  "linux-x64": {
    target: "x86_64-unknown-linux-musl",
    sha256: "dfb82876f2986862996e564fa507a9e576e0c1e3bee63c2c1bd677c2543e6407",
  },
};

export function tectonicRelease(
  platform = process.platform,
  arch = process.arch,
) {
  const release = releases[`${platform}-${arch}`];
  if (!release)
    throw new Error(
      "Built-in LaTeX requires Windows x64 or macOS/Linux arm64/x64. Use the Docker image on other platforms.",
    );
  return {
    url: `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.15.0/tectonic-0.15.0-${release.target}.${platform === "win32" ? "zip" : "tar.gz"}`,
    sha256: release.sha256,
  };
}

export function verifyArchive(bytes: Buffer, expected: string) {
  if (createHash("sha256").update(bytes).digest("hex") !== expected)
    throw new Error(
      "Tectonic download checksum mismatch. The compiler was not installed.",
    );
}

async function run(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 180000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `LaTeX setup command failed (${signal || code}): ${command}`,
          ),
        );
    });
  });
}

export async function installTectonic() {
  const release = tectonicRelease();
  const binDir = join(latexRuntimeDirectory(), "bin");
  await mkdir(binDir, { recursive: true });
  // Extract beside the destination so publication is an atomic rename.
  const staging = await mkdtemp(join(binDir, ".install-"));
  try {
    console.log("Downloading the built-in LaTeX compiler…");
    const response = await fetch(release.url, {
      signal: AbortSignal.timeout(300000),
    });
    if (!response.ok)
      throw new Error(`Tectonic download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    verifyArchive(bytes, release.sha256);
    const name = latexExecutableName("tectonic");
    const binary = join(staging, name);
    if (process.platform === "win32") {
      const zip = await JSZip.loadAsync(bytes);
      const entry = zip.file("tectonic.exe");
      if (!entry)
        throw new Error("Tectonic archive is missing its executable.");
      await writeFile(binary, await entry.async("nodebuffer"));
    } else {
      const archive = join(staging, "tectonic.tar.gz");
      await writeFile(archive, bytes);
      await run("tar", ["-xzf", archive, "-C", staging, "tectonic"], staging);
    }
    await chmod(binary, 0o755);
    await run(binary, ["--version"], staging);
    await rename(binary, join(binDir, name));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function setupLatex() {
  tectonicRelease(); // Reject unsupported hosts before changing anything.
  let bin = findTectonic();
  if (!bin) {
    if (process.env.JH_TECTONIC_BIN)
      throw new Error(
        "JH_TECTONIC_BIN does not point to an executable. Correct or remove the override and retry.",
      );
    await installTectonic();
    bin = findTectonic();
  }
  if (!bin) throw new Error("The installed LaTeX compiler could not be found.");
  if (process.platform === "win32" && !existsSync(latexSandboxExecutable())) {
    if (process.env.JH_LATEX_SANDBOX)
      throw new Error(
        "JH_LATEX_SANDBOX does not exist. Correct the override and retry.",
      );
    const destination = latexSandboxExecutable();
    await mkdir(dirname(destination), { recursive: true });
    await run(
      "go",
      ["build", "-trimpath", "-o", destination, "./cmd/texsandbox"],
      fileURLToPath(new URL("../../desktop", import.meta.url)),
    );
  }
  if (process.platform === "linux" && !existsSync(latexSandboxExecutable())) {
    if (process.env.JH_LATEX_SANDBOX)
      throw new Error(
        "JH_LATEX_SANDBOX does not exist. Correct or remove the override and retry.",
      );
    const destination = latexSandboxExecutable();
    await mkdir(dirname(destination), { recursive: true });
    const staging = await mkdtemp(join(dirname(destination), ".sandbox-"));
    try {
      await run(
        "gcc",
        [
          "-O2",
          "-Wall",
          "-Wextra",
          fileURLToPath(
            new URL("../../deploy/latex/sandbox.c", import.meta.url),
          ),
          "-o",
          join(staging, "sandbox"),
        ],
        staging,
      );
      await rename(join(staging, "sandbox"), destination);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
  const starter = await readFile(
    new URL("./starter.tex", import.meta.url),
    "utf8",
  );
  const sources = [10, 11, 12].map((size) =>
    starter.replace("[11pt,a4paper]", `[${size}pt,a4paper]`),
  );
  try {
    for (const source of sources) await compileLatex(source);
    console.log("LaTeX compiler ready (offline).");
    return;
  } catch (error) {
    // Package setup cannot repair a sandbox failure; never bypass it.
    if (error instanceof Error && /sandbox/i.test(error.message)) throw error;
  }
  const cache = latexCacheDirectory();
  await mkdir(cache, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), "ununemploy-tex-setup-"));
  try {
    if (process.platform === "win32") {
      await mkdir(join(work, "AppData/Local"), { recursive: true });
      await mkdir(join(work, "AppData/Roaming"), { recursive: true });
    }
    console.log("Preparing LaTeX packages for offline compilation…");
    // Only this repository's generic fixture is compiled with network access.
    // Never pass profile facts, saved CVs, database paths or credentials here.
    for (const source of sources) {
      await writeFile(join(work, "starter.tex"), source);
      await run(bin, ["--untrusted", "starter.tex"], work, {
        PATH: process.env.PATH,
        HOME: work,
        TECTONIC_CACHE_DIR: cache,
        XDG_CACHE_HOME: cache,
        TECTONIC_UNTRUSTED_MODE: "1",
        ...(process.platform === "win32"
          ? {
              SystemRoot: process.env.SystemRoot,
              WINDIR: process.env.WINDIR,
              TEMP: work,
              TMP: work,
              USERPROFILE: work,
              LOCALAPPDATA: work,
              APPDATA: work,
            }
          : {}),
      });
    }
    for (const source of sources) await compileLatex(source);
    console.log("LaTeX compiler ready (offline).");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
