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

const path = join(config.dataDir, "secrets", "web3.json");
export function web3Token(): string {
  if (existsSync(path)) {
    try {
      const value = JSON.parse(readFileSync(path, "utf8")).token;
      return typeof value === "string" ? value : "";
    } catch {
      return "";
    }
  }
  return config.web3Token;
}
export function setWeb3Token(token: string) {
  mkdirSync(join(config.dataDir, "secrets"), { recursive: true, mode: 0o700 });
  const temp = path + ".tmp";
  writeFileSync(temp, JSON.stringify({ token }), { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
}
