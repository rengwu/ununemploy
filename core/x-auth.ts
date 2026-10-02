import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
const path = join(config.dataDir, "secrets", "x.json");
export function xToken(): string {
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf8")).token || "";
    } catch {
      return "";
    }
  }
  return config.xToken;
}
export function setXToken(token: string) {
  mkdirSync(join(config.dataDir, "secrets"), { recursive: true, mode: 0o700 });
  const temp = path + ".tmp";
  writeFileSync(temp, JSON.stringify({ token }), { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
}
