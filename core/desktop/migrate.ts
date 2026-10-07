import { backup, DatabaseSync } from "node:sqlite";
import { cp, chmod, mkdir, readFile, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export async function assertDesktopStopped(directory: string) {
  const file = join(directory, "job-hunter.db");
  if (existsSync(file)) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      if (
        db
          .prepare("SELECT 1 FROM leases WHERE expires_at > ? LIMIT 1")
          .get(Date.now())
      )
        throw new Error(
          "Quit the running app and stop the development instance before installing.",
        );
    } finally {
      db.close();
    }
  }
  const instance = join(directory, "desktop-instance.json");
  if (existsSync(instance)) {
    const { pid } = JSON.parse(await readFile(instance, "utf8"));
    let running = false;
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        running = true;
      } catch {
        /* stale file */
      }
    }
    if (running)
      throw new Error("Quit ununemploy before installing the update.");
  }
}

export async function importDesktopData(previous: string, data: string) {
  await assertDesktopStopped(previous);
  await assertDesktopStopped(data);
  await mkdir(dirname(data), { recursive: true });
  if (
    resolve(previous) === resolve(data) ||
    existsSync(join(data, "job-hunter.db"))
  )
    return false;
  if (!existsSync(join(previous, "job-hunter.db"))) return false;
  if (existsSync(data))
    throw new Error(
      `The destination already exists without a database: ${data}. Choose an empty destination.`,
    );
  const staging = data + ".importing";
  await mkdir(staging, { mode: 0o700 });
  try {
    const db = new DatabaseSync(join(previous, "job-hunter.db"), {
      readOnly: true,
    });
    try {
      await backup(db, join(staging, "job-hunter.db"));
    } finally {
      db.close();
    }
    // Private assets stay in appdata; they are never included in the application bundle.
    for (const name of [
      "secrets",
      "resume",
      "cv-sources",
      "geography",
      "backups",
    ])
      if (existsSync(join(previous, name)))
        await cp(join(previous, name), join(staging, name), {
          recursive: true,
        });
    const check = new DatabaseSync(join(staging, "job-hunter.db"));
    try {
      if (
        check.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok"
      )
        throw new Error("Imported database integrity check failed.");
      check.exec("DELETE FROM leases");
    } finally {
      check.close();
    }
    await chmod(join(staging, "job-hunter.db"), 0o600);
    await rename(staging, data);
    return true;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
