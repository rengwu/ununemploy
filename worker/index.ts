import { recoverProfileTurns } from "../core/profile/chat.ts";
import { processAssistantTurn } from "../core/assistant/service.ts";
import { randomUUID } from "node:crypto";
import {
  getSettings,
  lease,
  now,
  putSetting,
  release,
  listTasks,
  saveTask,
  db,
} from "../core/db/index.ts";
import { scan } from "../core/scan.ts";
import {
  processCoverLetterTask,
  refreshAiStatus,
} from "../core/ai/generate.ts";
const owner = randomUUID();
let busy = false;
let initialized = false;
async function tick() {
  if (busy) return;
  if (!lease("worker", owner, 90000)) return;
  busy = true;
  putSetting("workerHeartbeat", now());
  try {
    if (!initialized) {
      recoverProfileTurns();
      for (const task of listTasks().filter((t) => t.state === "running")) {
        task.state = "paused";
        task.error =
          "Generation was interrupted by a restart. Retry to continue.";
        task.updatedAt = now();
        saveTask(task);
      }
      await refreshAiStatus();
      initialized = true;
    }
    if (await processAssistantTurn()) return;
    await processCoverLetterTask();
    if (getSettings().scheduleEnabled) await scan();
  } catch (error) {
    console.error(error);
  } finally {
    busy = false;
  }
}
const heartbeat = setInterval(() => {
  if (lease("worker", owner, 90000)) putSetting("workerHeartbeat", now());
}, 20000);
const timer = setInterval(() => void tick(), 15000);
// Chat should not wait for the maintenance interval. Work still uses the same
// serialized worker and runtime leases; active scans yield between sources.
const profileTimer = setInterval(() => {
  if (
    !busy &&
    db
      .prepare("SELECT id FROM profile_turns WHERE state='queued' LIMIT 1")
      .get()
  )
    void tick();
}, 1000);
void tick();
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    clearInterval(timer);
    clearInterval(profileTimer);
    clearInterval(heartbeat);
    release("worker", owner);
    process.exit(0);
  });
