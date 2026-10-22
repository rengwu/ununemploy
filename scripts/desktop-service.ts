// Private entry point owned by the native launcher, with an inherited loopback socket.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";
import { writeFileSync, renameSync } from "node:fs";

if (process.env.JH_DESKTOP !== "1" || !process.env.JH_DATA_DIR)
  throw new Error("Launch this service through the desktop application.");
const settings = join(process.env.JH_DATA_DIR, "desktop.env");
if (existsSync(settings)) loadEnvFile(settings);

// A closed parent pipe also handles force-quitting/crashing the Go wrapper.
process.stdin.resume();
if (process.platform !== "win32")
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
  if (process.platform === "win32") {
    const port = Number(process.env.JH_DESKTOP_PORT || 0);
    const listen = (port: number) => {
      app.server.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE" && port !== 0) listen(0);
        else reject(error);
      });
      app.server.listen({ host: "127.0.0.1", port }, () => resolve());
    };
    listen(port);
    return;
  }
  app.server.once("error", reject);
  app.server.listen({ fd: 3 }, () => {
    app.server.removeListener("error", reject);
    resolve();
  });
});
// Keep collection/model work in its existing separate process so it cannot block API reads.
const worker = spawn(
  process.execPath,
  existsSync("runtime/worker.mjs")
    ? ["runtime/worker.mjs"]
    : ["--import", "tsx", "worker/index.ts"],
  {
    env: process.env,
    windowsHide: true,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  },
);
if (process.platform === "win32") {
  const path = process.env.JH_DESKTOP_READY;
  const address = app.server.address();
  if (!path || !address || typeof address === "string")
    throw new Error("Missing desktop startup channel.");
  writeFileSync(
    path + ".tmp",
    JSON.stringify({
      pid: process.pid,
      url: `http://127.0.0.1:${address.port}`,
    }),
  );
  renameSync(path + ".tmp", path);
}
let stopping = false;
function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  if (worker.connected) worker.send({ type: "desktop-shutdown" });
  else worker.kill("SIGTERM");
  const timer = setTimeout(() => process.exit(code), 3000);
  timer.unref();
  void Promise.all([
    app.close(),
    new Promise<void>((resolve) =>
      worker.exitCode !== null
        ? resolve()
        : worker.once("exit", () => resolve()),
    ),
  ]).finally(() => process.exit(code));
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
