import { profileReadiness } from "../profile/facts.ts";
import { randomUUID } from "node:crypto";
import * as store from "../db/index.ts";
import type { Job } from "../types.ts";
import { jevToken, setJevToken } from "./auth.ts";
import {
  applyJevAssessment,
  candidateFingerprint,
  buildJevRequest,
  jevFingerprint,
  parseJevResponse,
} from "./assessment.ts";
import type { JevAssessment, JevJob, JevSettings, JevStatus } from "./types.ts";

type Row = {
  job_id: string;
  fingerprint: string;
  state: JevJob["state"];
  document: string | null;
  error: string | null;
  updated_at: string;
  priority: number;
};
type Runtime = {
  state: string;
  message: string | null;
  retryAt: string | null;
  failures: number;
};
const idle: Runtime = {
  state: "ready",
  message: null,
  retryAt: null,
  failures: 0,
};
export const jevSettings = () =>
  store.setting<JevSettings>("jevSettings", { enabled: true, dailyLimit: 100 });
const dayKey = () => `jev:${store.now().slice(0, 10)}`;
const revision = () =>
  store.db
    .prepare("UPDATE data_revisions SET version=version+1 WHERE name='jobs'")
    .run();
export function jevStatus(): JevStatus {
  const settings = jevSettings(),
    configured = !!jevToken(),
    runtime = store.setting("jevRuntime", idle);
  const used = store.getCounter(`${dayKey()}:requests`);
  return {
    ...settings,
    configured,
    used,
    inputTokens: store.getCounter(`${dayKey()}:input`),
    outputTokens: store.getCounter(`${dayKey()}:output`),
    state: !configured
      ? "not_configured"
      : !settings.enabled
        ? "paused"
        : used >= settings.dailyLimit
          ? "daily_limit"
          : runtime.state,
    message: runtime.message,
    retryAt: runtime.retryAt,
  };
}
export function configureJev(token: string) {
  setJevToken(token); // Empty local token intentionally masks an environment key on removal.
  if (token)
    store.putSetting("jevSettings", { ...jevSettings(), enabled: true });
  store.putSetting("jevRuntime", idle);
  store.putSetting("jevCredentialRevision", randomUUID());
  revision();
  return jevStatus();
}
export function saveJevSettings(settings: JevSettings) {
  store.putSetting("jevSettings", settings);
  store.putSetting("jevCredentialRevision", randomUUID()); // In-flight work cannot commit after pause.
  revision();
  return jevStatus();
}
export function resumeJev() {
  store.putSetting("jevRuntime", idle);
  return jevStatus();
}
export function queueJev(jobId: string) {
  if (!jevToken() || !jevSettings().enabled)
    throw new Error("Configure and enable Jev in Settings first.");
  const job = store.getJob(jobId);
  if (!job) throw new Error("Job not found.");
  const fingerprint = jevFingerprint(job, store.getProfile());
  const previous = getRow(jobId);
  if (
    previous?.fingerprint === fingerprint &&
    ["completed", "running"].includes(previous.state)
  )
    return { state: previous.state };
  saveRow(jobId, fingerprint, "queued", null, null, 1);
  return { state: "queued" };
}
function getRow(id: string) {
  return store.db
    .prepare("SELECT * FROM jev_assessments WHERE job_id=?")
    .get(id) as Row | undefined;
}
function saveRow(
  id: string,
  fingerprint: string,
  state: Row["state"],
  document: JevAssessment | null,
  error: string | null,
  priority = 0,
) {
  store.db
    .prepare(
      `INSERT INTO jev_assessments VALUES (?,?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET fingerprint=excluded.fingerprint,state=excluded.state,document=excluded.document,error=excluded.error,updated_at=excluded.updated_at,priority=excluded.priority`,
    )
    .run(
      id,
      fingerprint,
      state,
      document ? JSON.stringify(document) : null,
      error,
      store.now(),
      priority,
    );
}
export function enrichJobs(jobs: Job[]): Job[] {
  if (!jevToken() || !jevSettings().enabled) return jobs;
  const profile = store.getProfile();
  const candidateHash = candidateFingerprint(profile);
  const rows = new Map(
    (store.db.prepare("SELECT * FROM jev_assessments").all() as Row[]).map(
      (r) => [r.job_id, r],
    ),
  );
  return jobs.map((job) => {
    const row = rows.get(job.id),
      current =
        row?.fingerprint === jevFingerprint(job, profile, candidateHash);
    const assessment =
      current && row.document
        ? (JSON.parse(row.document) as JevAssessment)
        : undefined;
    const enriched = assessment
      ? applyJevAssessment(job, assessment, profile)
      : job;
    return {
      ...enriched,
      jev: {
        state: current ? row.state : "pending",
        error: current ? row.error || undefined : undefined,
        assessment,
        sourceLocation: job.location,
        sourceArrangement: job.arrangement,
        originalScore: job.score,
      },
    };
  });
}
class JevError extends Error {
  constructor(
    message: string,
    readonly permanent = false,
    readonly delayMs = 0,
  ) {
    super(message);
  }
}
async function evaluate(
  token: string,
  input: ReturnType<typeof buildJevRequest>,
  fingerprint: string,
  fetcher: typeof fetch,
) {
  const response = await fetcher("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(45000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.request),
  });
  if (!response.ok) {
    // Never echo provider error bodies: they may contain request data or credentials.
    await response.body?.cancel();
    const permanent = [400, 401, 402, 403, 404, 422].includes(response.status);
    const retryAfter = response.headers.get("retry-after");
    const delay = retryAfter
      ? /^\d+$/.test(retryAfter)
        ? Number(retryAfter) * 1000
        : Date.parse(retryAfter) - Date.now()
      : 0;
    throw new JevError(
      [401, 403].includes(response.status)
        ? "Jev rejected the API key or account access. Replace the key or retry after restoring access."
        : response.status === 402
          ? "Jev account allowance is unavailable. Restore your balance, then retry."
          : `Jev request failed (HTTP ${response.status}).`,
      permanent,
      Number.isFinite(delay) ? Math.max(0, delay) : 0,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new JevError("Jev returned an empty response.", true);
  let length = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 2_000_000) {
      await reader.cancel();
      throw new JevError("Jev response exceeded the size limit.", true);
    }
    chunks.push(value);
  }
  try {
    return parseJevResponse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
      input,
      fingerprint,
    );
  } catch {
    throw new JevError(
      "Jev returned an invalid assessment. Existing matching is unchanged. Retry after checking API compatibility.",
      true,
    );
  }
}
export async function processJevJob(fetcher: typeof fetch = fetch) {
  if (!profileReadiness(store.getProfile()).ready) return;
  const owner = randomUUID();
  if (!store.lease("jev", owner, 90000)) return;
  try {
    const token = jevToken(),
      settings = jevSettings(),
      runtime = store.setting("jevRuntime", idle);
    if (
      !token ||
      !settings.enabled ||
      runtime.state === "blocked" ||
      (runtime.retryAt && Date.parse(runtime.retryAt) > Date.now()) ||
      store.getCounter(`${dayKey()}:requests`) >= settings.dailyLimit
    )
      return;
    const profile = store.getProfile();
    const candidateHash = candidateFingerprint(profile);
    const rows = store.db
      .prepare(
        `SELECT j.document AS job, a.* FROM jobs j LEFT JOIN jev_assessments a ON a.job_id=j.id
      WHERE j.status!='dismissed' AND json_extract(j.document,'$.availability')!='closed'
      ORDER BY COALESCE(a.priority,0) DESC, (j.status='saved') DESC, json_extract(j.document,'$.score') DESC, j.first_seen_at DESC`,
      )
      .all();
    let selected: { job: Job; fingerprint: string } | undefined;
    for (const row of rows) {
      const job = JSON.parse(row.job as string) as Job;
      const fingerprint = jevFingerprint(job, profile, candidateHash);
      if (
        row.fingerprint === fingerprint &&
        ["completed", "failed"].includes(row.state as string)
      )
        continue;
      if (
        row.state === "running" &&
        Date.now() - Date.parse(row.updated_at as string) < 90000
      )
        continue;
      selected = { job, fingerprint };
      break;
    }
    if (!selected) return;
    const { job, fingerprint } = selected;
    let input: ReturnType<typeof buildJevRequest>;
    try {
      input = buildJevRequest(job, profile);
    } catch (error) {
      saveRow(job.id, fingerprint, "failed", null, (error as Error).message);
      return;
    }
    const credentialRevision = store.setting<string>(
        "jevCredentialRevision",
        "initial",
      ),
      budgetDay = dayKey();
    store.transaction(() => {
      saveRow(job.id, fingerprint, "running", null, null);
      store.incrementCounter(`${budgetDay}:requests`, 1);
    });
    try {
      const assessment = await evaluate(token, input, fingerprint, fetcher);
      store.incrementCounter(
        `${budgetDay}:input`,
        assessment.usage.input_tokens,
      );
      store.incrementCounter(
        `${budgetDay}:output`,
        assessment.usage.output_tokens,
      );
      const latest = store.getJob(job.id);
      if (
        credentialRevision !==
          store.setting("jevCredentialRevision", "initial") ||
        token !== jevToken() ||
        !jevSettings().enabled ||
        !latest ||
        fingerprint !== jevFingerprint(latest, store.getProfile())
      ) {
        saveRow(job.id, fingerprint, "queued", null, null);
        return;
      }
      saveRow(job.id, fingerprint, "completed", assessment, null);
      store.putSetting("jevRuntime", idle);
    } catch (error) {
      if (
        credentialRevision !==
          store.setting("jevCredentialRevision", "initial") ||
        token !== jevToken()
      ) {
        saveRow(job.id, fingerprint, "queued", null, null);
        return;
      }
      const failure =
        error instanceof JevError
          ? error
          : new JevError(
              "Jev could not be reached. Retrying later; existing matching remains available.",
            );
      const failures = runtime.failures + 1;
      const delay = Math.max(
        failure.delayMs,
        Math.min(3600000, 60000 * 2 ** Math.min(failures - 1, 6)),
      );
      saveRow(job.id, fingerprint, "queued", null, failure.message, 1);
      store.putSetting("jevRuntime", {
        state: failure.permanent ? "blocked" : "retrying",
        message: failure.message,
        retryAt: failure.permanent
          ? null
          : new Date(Date.now() + delay).toISOString(),
        failures,
      });
    }
  } finally {
    store.release("jev", owner);
  }
}
