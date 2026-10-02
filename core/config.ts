import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
if (existsSync(".env")) loadEnvFile(".env");

export const config = {
  dataDir: resolve(process.env.JH_DATA_DIR || ".local-data"),
  host: process.env.JH_HOST || "127.0.0.1",
  port: Number(process.env.JH_PORT || 3000),
  origin: process.env.ORIGIN || null,
  model: process.env.JH_CODEX_MODEL || "gpt-5.6-sol",
  reasoning: process.env.JH_CODEX_REASONING_EFFORT || "high",
  codexHome: process.env.JH_CODEX_HOME || null,
  codexCommand: process.env.JH_CODEX_BIN || "codex",
  xToken: process.env.JH_X_BEARER_TOKEN || "",
  web3Token: process.env.JH_WEB3_API_TOKEN || "",
};
