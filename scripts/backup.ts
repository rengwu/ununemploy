import { backup } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../core/config.ts";
import { db } from "../core/db/index.ts";
const directory = join(config.dataDir, "backups");
await mkdir(directory, { recursive: true });
const output = join(
  directory,
  `ununemploy-${new Date().toISOString().replace(/[:.]/g, "-")}.db`,
);
await backup(db, output);
console.log(output);
