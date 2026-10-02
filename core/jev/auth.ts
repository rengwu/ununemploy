import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { config } from "../config.ts";
const path = join(config.dataDir, "secrets", "jev.json");
export function jevToken(): string {
  if (!existsSync(path)) return process.env.JH_JEV_API_KEY || "";
  try {
    const token = JSON.parse(readFileSync(path, "utf8")).token;
    return typeof token === "string" ? token : "";
  } catch {
    return "";
  }
}
export function setJevToken(token: string) {
  mkdirSync(join(config.dataDir, "secrets"), { recursive: true, mode: 0o700 });
  writeFileSync(path + ".tmp", JSON.stringify({ token }), { mode: 0o600 });
  chmodSync(path + ".tmp", 0o600);
  renameSync(path + ".tmp", path);
}
