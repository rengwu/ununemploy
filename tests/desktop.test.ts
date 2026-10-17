import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertDesktopStopped,
  importDesktopData,
} from "../core/desktop/migrate.ts";

const root = mkdtempSync(join(tmpdir(), "ununemploy-desktop-import-"));
const { checkBundleLinks } = await import("../core/desktop/package.ts");
const { cp, mkdir, symlink, writeFile } = await import("node:fs/promises");
after(() => rmSync(root, { recursive: true, force: true }));
test("bundle copies preserve relative command links and reject checkout dependencies", async () => {
  const source = join(root, "app-source"),
    target = join(root, "app-copy");
  await mkdir(join(source, "bin"), { recursive: true });
  if (process.platform === "win32") {
    // Directory junctions need no Developer Mode/admin symlink privilege.
    await mkdir(join(source, "runtime"));
    await symlink(
      join(source, "runtime"),
      join(source, "bin/command"),
      "junction",
    );
    assert.equal(await checkBundleLinks(source), 1);
    await mkdir(target);
    await symlink(
      join(source, "runtime"),
      join(target, "bad-command"),
      "junction",
    );
    await assert.rejects(checkBundleLinks(target), /escapes its bundle/);
    return;
  }
  await writeFile(join(source, "runtime"), "fixture");
  await symlink("../runtime", join(source, "bin/command"));
  await cp(source, target, { recursive: true, verbatimSymlinks: true });
  assert.equal(await checkBundleLinks(target), 1);
  await symlink(join(source, "runtime"), join(target, "bad-command"));
  await assert.rejects(checkBundleLinks(target), /escapes its bundle/);
});
test("desktop migration snapshots WAL data and preserves private assets without overwriting", async () => {
  const source = join(root, "source"),
    target = join(root, "target");
  mkdirSync(join(source, "secrets"), { recursive: true });
  writeFileSync(
    join(source, "secrets/x.json"),
    '{"token":"synthetic-test-token"}',
    { mode: 0o600 },
  );
  const db = new DatabaseSync(join(source, "job-hunter.db"));
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE leases(name TEXT,expires_at INTEGER); CREATE TABLE facts(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO facts VALUES(1,'saved manual revision'); INSERT INTO leases VALUES('old',0)",
  );
  assert.equal(await importDesktopData(source, target), true);
  const imported = new DatabaseSync(join(target, "job-hunter.db"));
  assert.equal(
    imported.prepare("SELECT value FROM facts").get()?.value,
    "saved manual revision",
  );
  assert.equal(imported.prepare("SELECT count(*) n FROM leases").get()?.n, 0);
  assert.equal(db.prepare("SELECT count(*) n FROM leases").get()?.n, 1);
  assert.equal(
    readFileSync(join(source, "secrets/x.json"), "utf8"),
    readFileSync(join(target, "secrets/x.json"), "utf8"),
  );
  imported.exec("UPDATE facts SET value='new desktop revision'");
  assert.equal(await importDesktopData(source, target), false);
  assert.equal(
    imported.prepare("SELECT value FROM facts").get()?.value,
    "new desktop revision",
  );
  assert.equal(
    db.prepare("SELECT value FROM facts").get()?.value,
    "saved manual revision",
  );
  imported.close();
  db.close();
});
test("migration refuses active service leases and leaves the destination untouched", async () => {
  const source = join(root, "active"),
    target = join(root, "blocked");
  mkdirSync(source);
  const db = new DatabaseSync(join(source, "job-hunter.db"));
  db.exec("CREATE TABLE leases(name TEXT,expires_at INTEGER)");
  db.prepare("INSERT INTO leases VALUES('worker',?)").run(Date.now() + 60000);
  await assert.rejects(
    importDesktopData(source, target),
    /Quit the running app/,
  );
  assert.equal(existsSync(target), false);
  db.close();
});
test("an active desktop lock record blocks replacement even before database creation", async () => {
  const source = join(root, "starting");
  mkdirSync(source);
  writeFileSync(
    join(source, "desktop-instance.json"),
    JSON.stringify({ pid: process.pid }),
  );
  await assert.rejects(assertDesktopStopped(source), /Quit ununemploy/);
});
