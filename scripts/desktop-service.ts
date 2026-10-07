// Private entry point owned by the native launcher, with an inherited loopback socket.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";

if (process.env.JH_DESKTOP !== "1" || !process.env.JH_DATA_DIR)
  throw new Error("Launch this service through the desktop application.");
const settings = join(process.env.JH_DATA_DIR, "desktop.env");
if (existsSync(settings)) loadEnvFile(settings);

// A closed parent pipe also handles force-quitting/crashing the Go wrapper.
process.stdin.resume();
process.stdin.once("end", () => {
  try {
    process.kill(-process.pid, "SIGTERM");
  } catch {
    process.exit(0);
  }
});
const { app } = await import("../server/index.ts");
await app.ready();
await new Promise<void>((resolve, reject) => {
  app.server.once("error", reject);
  app.server.listen({ fd: 3 }, () => {
    app.server.removeListener("error", reject);
    resolve();
  });
});
// Keep collection/model work in its existing separate process so it cannot block API reads.
const worker = spawn(process.execPath, ["--import", "tsx", "worker/index.ts"], {
  env: process.env,
  stdio: ["ignore", "inherit", "inherit"],
});
let stopping = false;
function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  worker.kill("SIGTERM");
  const timer = setTimeout(() => process.exit(code), 3000);
  timer.unref();
  void app.close().finally(() => process.exit(code));
}
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => shutdown(0));
worker.once("error", (error) => {
  console.error("Worker could not start:", error.message);
  shutdown(1);
});
worker.once("exit", (code, signal) => {
  if (!stopping) {
    console.error(`Worker stopped unexpectedly (${signal || code}).`);
    shutdown(1);
  }
});
