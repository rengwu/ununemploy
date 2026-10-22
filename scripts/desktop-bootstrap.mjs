// Windows starts plain Node, waits for Job Object ownership, then loads tsx/app.
// No application imports or subprocesses may run before the parent's start line.
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
const input = createInterface({ input: process.stdin });
let started = false;
function stop() {
  if (process.listenerCount("SIGTERM")) process.emit("SIGTERM");
  else process.exit(0);
}
input.on("close", stop);
input.on("line", async (line) => {
  if (line === "stop") return stop();
  if (line !== "start" || started) return;
  started = true;
  try {
    if (
      existsSync(new URL("../runtime/desktop-service.mjs", import.meta.url))
    ) {
      await import("../runtime/desktop-service.mjs");
    } else {
      const { register } = await import("tsx/esm/api");
      register();
      await import("./desktop-service.ts");
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
});
