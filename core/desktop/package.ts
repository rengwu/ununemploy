import { readdir, realpath } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export async function checkBundleLinks(bundle: string) {
  const root = await realpath(bundle);
  let count = 0;
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await realpath(path);
        const difference = relative(root, target);
        if (
          difference === ".." ||
          difference.startsWith(".." + sep) ||
          resolve(root, difference) !== target
        )
          throw new Error(
            `Application link escapes its bundle: ${relative(root, path)}`,
          );
        count++;
      } else if (entry.isDirectory()) await walk(path);
    }
  }
  await walk(root);
  return count;
}
