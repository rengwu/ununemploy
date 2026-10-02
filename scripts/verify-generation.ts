import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  listJobs,
  getProfile,
  getCoverLetterTemplate,
  now,
} from "../core/db/index.ts";
import { config } from "../core/config.ts";
import { infer } from "../core/ai/codex.ts";
import {
  generationPrompt,
  outputSchema,
  validateGeneration,
} from "../core/ai/generate.ts";
import type { Task } from "../core/types.ts";

const job = listJobs().find(
  (j) =>
    j.company === "Linear" && j.title === "Senior / Staff Product Engineer, AI",
);
if (!job) throw new Error("Scan the starter boards first.");
const profile = getProfile();
const template = getCoverLetterTemplate();
const task: Task = {
  id: randomUUID(),
  jobId: job.id,
  kind: "cover_letter",
  state: "running",
  createdAt: now(),
  updatedAt: now(),
  error: null,
  attempts: 1,
  input: { job, profile, template },
  resultId: null,
};
const result = await infer(generationPrompt(task), outputSchema());
const directory = join(config.dataDir, "verification");
await mkdir(directory, { recursive: true });
await writeFile(
  join(directory, "raw-generation.json"),
  JSON.stringify(result, null, 2),
);
const checked = validateGeneration(result.result, profile, job);
await writeFile(
  join(directory, "generated-cover-letter.json"),
  JSON.stringify(
    {
      ...checked,
      template,
      job: { title: job.title, company: job.company },
      usage: result.usage,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    success: true,
    job: job.title,
    company: job.company,
    paragraphs: checked.document.paragraphs.length,
    usage: result.usage,
  }),
);
