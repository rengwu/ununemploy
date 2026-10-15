import JSZip from "jszip";
import { createHash, randomUUID } from "node:crypto";
import * as store from "../db/index.ts";
import {
  ensureLatex,
  latexVersion,
  latexBuild,
  sourceHash,
} from "../latex/store.ts";
import { MAX_ZIP_BYTES, MAX_UNPACKED_BYTES } from "./limits.ts";
export { MAX_ZIP_BYTES, MAX_UNPACKED_BYTES } from "./limits.ts";
import { MATCH_VERSION } from "../matching.ts";
import {
  backupDataSchema,
  jobSchema,
  manifestSchema,
  type BackupData,
} from "./schema.ts";

const hash = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const names = new Set(["manifest.json", "data.json", "cv.tex", "cv.pdf"]);
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
const summary = (data: BackupData) => ({
  jobs: data.jobs.length,
  savedJobs: data.jobs.filter(
    (j) => j.status === "saved" || j.status === "applied",
  ).length,
  coverLetters: data.coverLetters.length,
});

function latestDocuments(table: "cover_letter_versions") {
  return store.db
    .prepare(
      `SELECT document FROM (
    SELECT document, ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY version DESC) AS rank FROM ${table}
  ) WHERE rank=1`,
    )
    .all()
    .map((row) => ({ ...JSON.parse(String(row.document)), parentId: null }));
}

function snapshot() {
  ensureLatex();
  store.db.exec("BEGIN");
  try {
    const latex = latexVersion();
    const jobs = store.db
      .prepare("SELECT document, canonical_url FROM jobs ORDER BY id")
      .all()
      .map((row) => ({
        ...jobSchema.parse(JSON.parse(String(row.document))),
        canonicalUrl: String(row.canonical_url),
      }));
    const data = backupDataSchema.parse({
      profile: store.getProfile(),
      jobs,
      observations: jobs.map((job) => ({
        jobId: job.id,
        items: store.jobObservations(job.id),
      })),
      coverLetters: latestDocuments("cover_letter_versions"),
      assessments: store.db
        .prepare(
          "SELECT job_id, document FROM jev_assessments WHERE state='completed' AND document IS NOT NULL",
        )
        .all()
        .map((row) => ({
          jobId: row.job_id,
          document: JSON.parse(String(row.document)),
        })),
      latex: { version: latex.version, createdAt: latex.createdAt },
    });
    const result = {
      data,
      source: latex.source,
      pdf: latexBuild(latex.hash)?.pdf,
    };
    store.db.exec("COMMIT");
    return result;
  } catch (error) {
    store.db.exec("ROLLBACK");
    throw error;
  }
}
export async function exportBackup() {
  const { data, source, pdf } = snapshot();
  const files: Record<string, Buffer> = {
    "data.json": json(data),
    "cv.tex": Buffer.from(source),
  };
  if (pdf) files["cv.pdf"] = pdf;
  const createdAt = store.now();
  files["manifest.json"] = json({
    format: "ununemploy-personal-backup",
    version: 1,
    createdAt,
    files: Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [
        name,
        { bytes: bytes.length, sha256: hash(bytes) },
      ]),
    ),
  });
  if (
    Object.values(files).reduce((n, b) => n + b.length, 0) > MAX_UNPACKED_BYTES
  )
    throw new Error(
      "The backup exceeds the 512 MiB uncompressed limit. Use a database backup instead.",
    );
  const zip = new JSZip();
  for (const [name, bytes] of Object.entries(files)) zip.file(name, bytes);
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  if (buffer.length > MAX_ZIP_BYTES)
    throw new Error(
      "The backup exceeds the 128 MiB ZIP limit. Use a database backup instead.",
    );
  return {
    buffer,
    filename: `ununemploy-${createdAt.replace(/[:.]/g, "-")}.zip`,
  };
}

async function readEntry(
  file: JSZip.JSZipObject,
  limit: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const stream = file.nodeStream();
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        stream.pause();
        reject(new Error("The ZIP exceeds its allowed uncompressed size."));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks, size)));
    stream.resume();
  });
}
function unique(values: (string | null)[], label: string) {
  if (new Set(values).size !== values.length)
    throw new Error(`Duplicate ${label} in backup.`);
}
function validateRelations(data: BackupData) {
  unique(
    data.jobs.map((j) => j.id),
    "job IDs",
  );
  unique(
    data.jobs.map((j) => store.canonicalUrl(j.canonicalUrl)),
    "job URLs",
  );
  const jobs = new Set(data.jobs.map((j) => j.id));
  for (const [label, entries] of Object.entries({
    observations: data.observations,
    letters: data.coverLetters,
    assessments: data.assessments,
  })) {
    unique(
      entries.map((e) => e.jobId),
      label,
    );
    for (const entry of entries)
      if (entry.jobId !== null && !jobs.has(entry.jobId))
        throw new Error(`A ${label} record refers to a missing job.`);
  }
  unique(
    data.coverLetters.map((d) => d.id),
    "letter IDs",
  );
  if (data.observations.length !== data.jobs.length)
    throw new Error("The backup is missing job listing evidence.");
}

// Our small, fixed-entry format never needs ZIP64. Bound directory parsing before
// the ZIP library allocates objects, and reject duplicates before it merges names.
function validateDirectory(buffer: Buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const invalid = () => new Error("This is not a readable ZIP backup.");
  if (end < 0 || end + 22 > buffer.length) throw invalid();
  if (
    end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length ||
    buffer.readUInt16LE(end + 4) !== 0 ||
    buffer.readUInt16LE(end + 6) !== 0
  )
    throw invalid();
  const count = buffer.readUInt16LE(end + 10);
  const size = buffer.readUInt32LE(end + 12);
  let offset = buffer.readUInt32LE(end + 16);
  if (
    count < 3 ||
    count > 4 ||
    buffer.readUInt16LE(end + 8) !== count ||
    offset + size !== end
  )
    throw invalid();
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50)
      throw invalid();
    const length = buffer.readUInt16LE(offset + 28);
    const next =
      offset +
      46 +
      length +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
    if (next > end) throw invalid();
    const name = buffer
      .subarray(offset + 46, offset + 46 + length)
      .toString("utf8");
    if (!names.has(name) || seen.has(name))
      throw new Error("The ZIP contains unexpected or duplicate files.");
    seen.add(name);
    offset = next;
  }
  if (offset !== end) throw invalid();
}

export async function readBackup(buffer: Buffer) {
  if (!buffer.length || buffer.length > MAX_ZIP_BYTES)
    throw new Error("Choose a ZIP backup no larger than 128 MiB.");
  validateDirectory(buffer);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("This is not a readable ZIP backup.");
  }
  for (const file of Object.values(zip.files)) {
    const permissions = Number(file.unixPermissions || 0) & 0o170000;
    if (
      !names.has(file.name) ||
      file.unsafeOriginalName !== file.name ||
      file.dir ||
      (permissions && permissions !== 0o100000)
    )
      throw new Error("The ZIP contains an unexpected file or unsafe path.");
  }
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry)
    throw new Error("This ZIP is not an ununemploy personal backup.");
  let manifest: ReturnType<typeof manifestSchema.parse>;
  try {
    manifest = manifestSchema.parse(
      JSON.parse((await readEntry(manifestEntry, 16384)).toString("utf8")),
    );
  } catch {
    throw new Error(
      "The backup manifest is invalid or uses an unsupported version.",
    );
  }
  if (
    !manifest.files["data.json"] ||
    !manifest.files["cv.tex"] ||
    Object.keys(manifest.files).some(
      (n) => !names.has(n) || n === "manifest.json",
    ) ||
    Object.keys(zip.files).length !== Object.keys(manifest.files).length + 1
  )
    throw new Error("The backup file list is incomplete or invalid.");
  let remaining = MAX_UNPACKED_BYTES - 16384;
  const files: Record<string, Buffer> = {};
  for (const [name, spec] of Object.entries(manifest.files)) {
    const entry = zip.file(name);
    const maximum = name === "cv.tex" ? 2 * 1024 * 1024 : remaining;
    if (!entry || spec.bytes > remaining || spec.bytes > maximum)
      throw new Error("The backup is incomplete or exceeds its size limit.");
    const bytes = await readEntry(entry, spec.bytes);
    remaining -= bytes.length;
    if (bytes.length !== spec.bytes || hash(bytes) !== spec.sha256)
      throw new Error(`The backup file ${name} is damaged.`);
    files[name] = bytes;
  }
  let data: BackupData;
  try {
    data = backupDataSchema.parse(
      JSON.parse(files["data.json"].toString("utf8")),
    );
  } catch {
    throw new Error("The backup contains invalid personal records.");
  }
  validateRelations(data);
  const source = new TextDecoder("utf-8", { fatal: true }).decode(
    files["cv.tex"],
  );
  if (!source.length) throw new Error("The backup has no LaTeX source.");
  if (files["cv.pdf"] && files["cv.pdf"].subarray(0, 5).toString() !== "%PDF-")
    throw new Error("The backup PDF is invalid.");
  return { data, source, pdf: files["cv.pdf"], createdAt: manifest.createdAt };
}

export async function importBackup(buffer: Buffer) {
  const { data, source, pdf } = await readBackup(buffer);
  return store.transaction(() => {
    // BEGIN IMMEDIATE makes this check and replacement indivisible across API/worker processes.
    const active = store.db
      .prepare(
        `SELECT name FROM leases WHERE expires_at>=? AND
      (name IN ('scan','profile-chat','codex-inference','jev','vuejobs-details') OR name LIKE 'personal-data:%') LIMIT 1`,
      )
      .get(Date.now());
    if (active)
      throw new Error(
        "A scan or edit is still running. Wait for it to finish, then import again.",
      );
    const revision =
      Math.max(store.getProfile().revision, data.profile.revision) + 1;
    const latexCurrent = store.db
      .prepare("SELECT MAX(version) AS version FROM latex_versions")
      .get();
    const latexRevision =
      Math.max(Number(latexCurrent?.version || 0), data.latex.version) + 1;
    for (const table of [
      "assistant_steps",
      "profile_turns",
      "profile_changes",
      "profile_messages",
      "profile_versions",
      "tasks",
      "cover_letter_versions",
      "cv_versions",
      "jev_assessments",
      "source_items",
      "source_item_versions",
      "imported_observations",
      "jobs",
      "latex_builds",
      "latex_versions",
    ])
      store.db.exec(`DELETE FROM ${table}`);
    const originalRevision = data.profile.revision;
    data.profile.revision = revision;
    store.db
      .prepare("INSERT INTO profile_versions VALUES (?,?,?)")
      .run(revision, JSON.stringify(data.profile), store.now());
    const insertJob = store.db.prepare("INSERT INTO jobs VALUES (?,?,?,?,?,?)");
    for (const { canonicalUrl, ...job } of data.jobs) {
      if (job.matchProfileRevision === originalRevision)
        job.matchProfileRevision = revision;
      insertJob.run(
        job.id,
        store.canonicalUrl(canonicalUrl),
        JSON.stringify(job),
        job.status,
        job.firstSeenAt,
        store.now(),
      );
    }
    const insertEvidence = store.db.prepare(
      "INSERT INTO imported_observations VALUES (?,?)",
    );
    for (const row of data.observations)
      insertEvidence.run(row.jobId, JSON.stringify(row.items));
    for (const [table, documents] of [
      ["cover_letter_versions", data.coverLetters],
    ] as const) {
      const insert = store.db.prepare(
        `INSERT INTO ${table} VALUES (?,?,?,?,?)`,
      );
      for (const doc of documents) {
        // New identities invalidate other windows' stale document saves.
        doc.id = randomUUID();
        if (doc.profileRevision === originalRevision)
          doc.profileRevision = revision;
        insert.run(
          doc.id,
          doc.jobId,
          doc.version,
          JSON.stringify(doc),
          doc.createdAt,
        );
      }
    }
    for (const row of data.assessments)
      store.db
        .prepare("INSERT INTO jev_assessments VALUES (?,?,?,?,?,?,?)")
        .run(
          row.jobId,
          row.document.fingerprint,
          "completed",
          JSON.stringify(row.document),
          null,
          row.document.assessedAt,
          0,
        );
    const sourceDigest = sourceHash(source);
    store.db
      .prepare(
        "INSERT INTO latex_versions (version,source,source_hash,created_at) VALUES (?,?,?,?)",
      )
      .run(latexRevision, source, sourceDigest, data.latex.createdAt);
    if (pdf)
      store.db
        .prepare("INSERT INTO latex_builds VALUES (?,?,?,?)")
        .run(sourceDigest, pdf, "[]", store.now());
    store.putSetting("latexLastBuild", pdf ? sourceDigest : null);
    store.putSetting("assistantFocus", null);
    store.putSetting("matchingVersion", {
      version: MATCH_VERSION,
      profileRevision: revision,
    });
    store.db
      .prepare("UPDATE data_revisions SET version=version+1 WHERE name='jobs'")
      .run();
    return summary(data);
  });
}
