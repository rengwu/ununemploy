import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { discoverySources } from "../core/source-catalog.ts";
const name = "ununemploy-smoke";
const volume = `ununemploy-smoke-${Date.now()}`;
mkdirSync(resolve(".local-data/verification"), { recursive: true });
const docker = (args: string[]) =>
  execFileSync("docker", args, { encoding: "utf8", timeout: 120000 });
const base = "http://127.0.0.1:5308";
async function ready() {
  for (let i = 0; i < 45; i++) {
    try {
      const r = await fetch(base + "/api/health");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Container did not become healthy.");
}
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal(r.status, 200, await (r.ok ? Promise.resolve("") : r.text()));
  return r.json();
}
try {
  docker(["volume", "create", volume]);
  docker([
    "run",
    "-d",
    "--name",
    name,
    "--platform",
    "linux/amd64",
    "-p",
    "127.0.0.1:5308:3000",
    "-v",
    `${volume}:/config`,
    "-e",
    "JH_SCHEDULE_ENABLED=false",
    "ununemploy:local",
  ]);
  await ready();
  const bootstrap = await api("/bootstrap");
  const context = await api("/master");
  assert.equal(bootstrap.sources.length, discoverySources.length + 6);
  assert.equal(bootstrap.settings.scheduleEnabled, false);
  const connection = await api("/ai/check", "POST");
  assert.equal(connection.state, "signed_out");
  assert.match(
    docker(["exec", "-u", "99:100", name, "codex", "--version"]),
    /0\.154\.0/,
  );
  const index = await fetch(base);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /ununemploy/);
  await api("/settings", "PUT", { ...bootstrap.settings, aiEnabled: false });
  const job = await api("/jobs", "POST", {
    title: "Container persistence check",
    company: "Test fixture",
    url: "https://example.com/container-test",
    description:
      "Product engineer building web and native experiences with TypeScript, React, and coding agent harnesses.",
    location: "Remote",
  });
  await api(`/jobs/${job.id}`, "PATCH", {
    status: "saved",
    notes: "Persist across restart",
  });
  const queued = (await api("/bootstrap")).tasks[0];
  assert.equal(queued.kind, "cover_letter");
  const fixture = {
    name: "Example Candidate",
    location: "Malaysia",
    contacts: [],
    company: "Test fixture",
    role: "Product Engineer",
    salutation: "Dear hiring team,",
    paragraphs: [
      "I build product interfaces and developer tools.",
      "My experience connects interface design with engineering delivery.",
      "I would welcome a conversation about this role.",
    ],
    closing: "Best regards,",
  };
  const seedCode = `const s=await import('./core/db/index.ts');const letter=s.saveCoverLetter({jobId:${JSON.stringify(job.id)},kind:'generated',document:${JSON.stringify(fixture)},template:s.getCoverLetterTemplate(),profileRevision:s.getProfile().revision,reviewNotes:[],evidence:null,parentId:null});console.log(JSON.stringify(letter));s.db.close();`;
  const letter = JSON.parse(
    docker([
      "exec",
      "-u",
      "99:100",
      name,
      "node",
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      seedCode,
    ]),
  );
  const letterExport = await fetch(base + "/api/cover-letters/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      document: letter.document,
      format: "pdf",
    }),
  });
  assert.equal(letterExport.status, 200);
  assert.equal(
    Buffer.from(await letterExport.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  const seen = await api(`/jobs/${job.id}/seen`, "POST", {});
  const master = await api("/master", "PUT", {
    profile: context.profile,
    template: context.template,
    expectedRevision: context.profile.revision,
  });
  const response = await fetch(base + "/api/cv/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile: master.profile,
      template: context.template,
      format: "pdf",
    }),
  });
  assert.equal(response.status, 200, response.ok ? "" : await response.text());
  const pdf = Buffer.from(await response.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  writeFileSync(resolve(".local-data/verification/container-master.pdf"), pdf);
  docker(["restart", name]);
  await ready();
  const restored = await api("/bootstrap");
  const restoredContext = await api("/master");
  assert.equal(restored.counts.total, 1);
  const restoredJob = await api(`/jobs/${job.id}`);
  assert.equal(restoredJob.notes, "Persist across restart");
  assert.equal(restoredJob.status, "saved");
  assert.equal(restoredJob.seenAt, seen.seenAt);
  assert.equal(restoredContext.profile.revision, master.profile.revision);
  assert.equal(restored.tasks.length, 1);
  assert.equal(restored.tasks[0].state, "queued");
  assert.equal(restored.tasks[0].kind, "cover_letter");
  assert.equal(restoredJob.coverLetterId, letter.id);
  assert.deepEqual(
    (await api(`/cover-letters?jobId=${job.id}`))[0].document,
    fixture,
  );
  const backupPath = docker([
    "exec",
    "-u",
    "99:100",
    name,
    "/app/node_modules/.bin/tsx",
    "scripts/backup.ts",
  ]).trim();
  assert.match(backupPath, /\/config\/backups\/.+\.db/);
  assert.equal(
    docker([
      "exec",
      name,
      "stat",
      "-c",
      "%u:%g",
      "/config/job-hunter.db",
    ]).trim(),
    "99:100",
  );
  console.log(
    JSON.stringify({
      success: true,
      platform: "linux/amd64",
      sources: restored.sources.length,
      persistedJobs: restored.counts.total,
      profileRevision: restoredContext.profile.revision,
      pdfBytes: pdf.length,
      backup: true,
      ownership: "99:100",
    }),
  );
} catch (error) {
  try {
    console.error(docker(["logs", "--tail", "80", name]));
  } catch {}
  throw error;
} finally {
  try {
    docker(["rm", "-f", name]);
    docker(["volume", "rm", volume]);
  } catch {}
}
