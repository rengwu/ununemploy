import {
  accessSync,
  constants,
  existsSync,
  realpathSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";

export function latexRuntimeDirectory() {
  return resolve(process.env.JH_DATA_DIR || ".local-data", "latex-runtime");
}

function executable(path: string): string | undefined {
  try {
    if (!statSync(path).isFile()) return undefined;
    accessSync(path, constants.X_OK);
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

export function findTectonic(): string | undefined {
  // An explicit override must never silently fall back to another compiler.
  if (process.env.JH_TECTONIC_BIN)
    return executable(process.env.JH_TECTONIC_BIN);
  const candidates = [
    join(latexRuntimeDirectory(), "bin/tectonic"),
    ...(process.env.PATH || "")
      .split(delimiter)
      .filter(Boolean)
      .map((p) => join(p, "tectonic")),
    ...(process.platform === "darwin"
      ? ["/opt/homebrew/bin/tectonic", "/usr/local/bin/tectonic"]
      : ["/usr/local/bin/tectonic", "/usr/bin/tectonic"]),
  ];
  for (const candidate of candidates) {
    const bin = executable(candidate);
    if (bin) return bin;
  }
}

export function latexCacheDirectory() {
  if (process.env.JH_LATEX_CACHE) return resolve(process.env.JH_LATEX_CACHE);
  const existing =
    process.platform === "darwin"
      ? join(homedir(), "Library/Caches/TectonicProject.Tectonic")
      : "/opt/ununemploy-tex-cache";
  return existsSync(existing)
    ? existing
    : join(latexRuntimeDirectory(), "cache");
}

export function latexSandboxExecutable() {
  return (
    process.env.JH_LATEX_SANDBOX ||
    (existsSync("/usr/local/bin/ununemploy-tex-sandbox")
      ? "/usr/local/bin/ununemploy-tex-sandbox"
      : join(latexRuntimeDirectory(), "bin/ununemploy-tex-sandbox"))
  );
}
