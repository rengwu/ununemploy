import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "../config.ts";
import { db, lease, release } from "../db/index.ts";

type Credential = {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  [key: string]: unknown;
};
type Options = { signal?: AbortSignal };
const directory = join(config.dataDir, "pi-auth");
const path = join(directory, "credentials.json");
export async function authLock<T>(
  fn: (guard: () => void) => Promise<T>,
  options: Options = {},
): Promise<T> {
  const owner = randomUUID();
  const deadline = Date.now() + 130000;
  while (!lease("pi-auth", owner, 180000)) {
    options.signal?.throwIfAborted();
    if (Date.now() > deadline)
      throw new Error("ChatGPT credentials are busy. Retry shortly.");
    await delay(100, undefined, { signal: options.signal });
  }
  let lost = false;
  const heartbeat = setInterval(() => {
    try {
      if (!lease("pi-auth", owner, 180000)) lost = true;
    } catch {
      lost = true;
    }
  }, 10000);
  const guard = () => {
    const lock = db
      .prepare("SELECT owner,expires_at FROM leases WHERE name='pi-auth'")
      .get();
    if (lost || lock?.owner !== owner || Number(lock?.expires_at) <= Date.now())
      throw new Error(
        "ChatGPT credential lock was interrupted. Check connection before retrying.",
      );
  };
  try {
    options.signal?.throwIfAborted();
    const result = await fn(guard);
    if (lost)
      throw new Error(
        "ChatGPT credential lock was interrupted. Check connection before retrying.",
      );
    return result;
  } finally {
    clearInterval(heartbeat);
    release("pi-auth", owner);
  }
}
export const credentials = {
  async read(
    id: string,
    options: Options = {},
  ): Promise<Credential | undefined> {
    options.signal?.throwIfAborted();
    if (id !== "openai") return undefined;
    try {
      const value = JSON.parse(await readFile(path, "utf8"));
      if (
        value.type !== "oauth" ||
        typeof value.access !== "string" ||
        typeof value.refresh !== "string" ||
        !Number.isFinite(value.expires)
      )
        throw new Error("Invalid ChatGPT connection. Sign in again.");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error(
        "Cannot read the saved ChatGPT connection. Sign in again.",
      );
    }
  },
  async list(options: Options = {}) {
    return (await this.read("openai", options))
      ? [{ providerId: "openai", type: "oauth" as const }]
      : [];
  },
  async modify(
    id: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options: Options = {},
  ) {
    if (id !== "openai")
      throw new Error("Only ChatGPT subscription credentials are supported.");
    return authLock(async (guard) => {
      const current = await this.read(id);
      const next = await fn(current);
      if (!next) return current;
      if (next.type !== "oauth")
        throw new Error("A ChatGPT subscription connection is required.");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(next), {
          mode: 0o600,
          flag: "wx",
        });
        // Persist refresh results even if its initiating request was cancelled.
        guard();
        await rename(temporary, path);
      } finally {
        await rm(temporary, { force: true });
      }
      return next;
    }, options);
  },
  async delete(id: string, options: Options = {}) {
    if (id === "openai")
      await authLock(async (guard) => {
        guard();
        await rm(path, { force: true });
      }, options);
  },
};
export async function hostId() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, "host-id");
  try {
    await writeFile(file, randomUUID(), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return (await readFile(file, "utf8")).trim();
}
