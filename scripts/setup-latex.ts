import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
// Load app configuration, including .env, without opening the database.
import "../core/config.ts";
const cache = resolve(
  process.env.JH_LATEX_CACHE ||
    (process.platform === "darwin"
      ? join(homedir(), "Library/Caches/TectonicProject.Tectonic")
      : "/opt/ununemploy-tex-cache"),
);
const work = await mkdtemp(join(tmpdir(), "ununemploy-tex-setup-"));
try {
  await mkdir(cache, { recursive: true });
  const starter = await readFile(
    new URL("../core/latex/starter.tex", import.meta.url),
    "utf8",
  );
  // Only the repository's generic, trusted package fixture is compiled online.
  // No candidate profile, resume, database, or credentials are supplied.
  for (const size of [10, 11, 12]) {
    await writeFile(
      join(work, "starter.tex"),
      starter.replace("[11pt,a4paper]", `[${size}pt,a4paper]`),
    );
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(
        process.env.JH_TECTONIC_BIN || "tectonic",
        ["--untrusted", "starter.tex"],
        {
          cwd: work,
          stdio: "inherit",
          env: {
            PATH: process.env.PATH,
            HOME: work,
          TECTONIC_CACHE_DIR: cache,
          XDG_CACHE_HOME: cache,
            TECTONIC_UNTRUSTED_MODE: "1",
          },
        },
      );
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0
          ? resolvePromise()
          : reject(new Error(`LaTeX setup failed (${code}).`)),
      );
    });
  }
  console.log(`LaTeX packages ready in ${cache}`);
} finally {
  await rm(work, { recursive: true, force: true });
}
