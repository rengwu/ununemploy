import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function buildInfo(): { version: string; revision?: string } {
  try {
    const info = JSON.parse(readFileSync(resolve("../build.json"), "utf8"));
    if (typeof info.version === "string")
      return { version: info.version, revision: info.revision };
  } catch {
    /* Source and server deployments use the package version. */
  }
  const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  return { version: pkg.version };
}
