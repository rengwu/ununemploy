import { randomUUID } from "node:crypto";
import { lease, release } from "../db/index.ts";

// Cross-process visibility for asynchronous writes spanning a database transaction.
export function personalDataActivity() {
  const owner = randomUUID();
  const name = `personal-data:${owner}`;
  lease(name, owner, 300000);
  const timer = setInterval(() => lease(name, owner, 300000), 30000);
  timer.unref();
  return () => {
    clearInterval(timer);
    release(name, owner);
  };
}
