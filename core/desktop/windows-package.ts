import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

export const windowsPackageManifest = "resources/package-files.json";

// A checksum inventory detects incomplete copies and accidental changes. It is
// not a signature or a claim about who published this unsigned local package.
export async function writeWindowsPackageManifest(root: string) {
  const files: { path: string; size: number; sha256: string }[] = [];
  const paths: { path: string; name: string }[] = [];
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = relative(root, path).replaceAll("\\", "/");
      if (entry.isSymbolicLink())
        throw new Error(`Windows packages cannot contain links: ${name}`);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && name !== windowsPackageManifest) {
        paths.push({ path, name });
      } else if (!entry.isFile()) throw new Error(`Unsupported package entry: ${name}`);
    }
  }
  await walk(root);
  // Packages contain many small dependency/cache files. Bound concurrent reads
  // while streaming large runtimes instead of loading them all into memory.
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < paths.length) {
      const { path, name } = paths[next++];
      const digest = createHash("sha256");
      for await (const chunk of createReadStream(path)) digest.update(chunk);
      files.push({ path: name, size: (await lstat(path)).size, sha256: digest.digest("hex") });
    }
  }));
  files.sort((a, b) => a.path.localeCompare(b.path, "en"));
  await writeFile(join(root, windowsPackageManifest), JSON.stringify({ version: 1, files }, null, 2) + "\n");
  return files;
}
