import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  db,
  getProfile,
  transaction,
  setting,
  putSetting,
} from "../db/index.ts";
import { config } from "../config.ts";
import { fromProfile } from "../cv/render.ts";
import type {
  LatexContext,
  LatexDiagnostic,
  LatexDocument,
  LatexVersion,
} from "./types.ts";

export const sourceHash = (source: string) =>
  createHash("sha256").update(source).digest("hex");
const fields =
  "version, source_hash AS hash, created_at AS createdAt, restored_from AS restoredFrom";
export function escapeTex(value: string) {
  const replacements: Record<string, string> = {
    "\\": "\\textbackslash{}",
    "{": "\\{",
    "}": "\\}",
    "&": "\\&",
    "%": "\\%",
    $: "\\$",
    "#": "\\#",
    _: "\\_",
    "~": "\\textasciitilde{}",
    "^": "\\textasciicircum{}",
  };
  return value.replace(/[\\{}&%$#_~^]/g, (c) => replacements[c]);
}
function initialSource() {
  // Import the user's existing local document once, never overwrite subsequent edits.
  const local = join(
    config.dataDir,
    "resume/output/pdf/john-goh-rengwu-resume.tex",
  );
  if (existsSync(local)) return readFileSync(local, "utf8");
  const cv = fromProfile(getProfile());
  const e = escapeTex;
  const bullets = (items: string[]) =>
    `\\begin{details}\n${items.map((x) => `\\item ${e(x)}`).join("\n")}\n\\end{details}`;
  const body = [
    `\\begin{document}\n{\\Large\\bfseries ${e(cv.name)}}\\par\n${e([cv.location, ...cv.contacts.map((c) => c.label)].join(" | "))}\\par`,
    `\\section{Summary}\n${e(cv.summary)}`,
    `\\section{Experience}\n\\begin{entries}\n${cv.experience.map((x) => `\\role{${e(x.employer)}}{${e(x.location)}}{${e(x.title)}}{${e(x.dates)}}\n${bullets(x.bullets)}`).join("\n")}\n\\end{entries}`,
    `\\section{Projects}\n\\begin{entries}\n${cv.projects.map((x) => `\\item \\textbf{${e(x.name)}}: ${e(x.summary)}\n${bullets([...x.bullets, ...(x.attribution ? [x.attribution] : [])])}`).join("\n")}\n\\end{entries}`,
    `\\section{Skills}\n${e(cv.skills.join(", "))}`,
    `\\section{Education}\n${cv.education.map((x) => `${e(x.institution)}\\hfill ${e(x.dates)}\\par\n${e(x.qualification)}\\par`).join("\n")}`,
    `\\section{Awards}\n${bullets(cv.awards.map((x) => `${x.name}: ${x.result}, ${x.year}`))}\n\\end{document}\n`,
  ].join("\n\n");
  return (
    readFileSync(new URL("./starter.tex", import.meta.url), "utf8").split(
      "\\begin{document}",
    )[0] + body
  );
}
export function ensureLatex() {
  if (db.prepare("SELECT version FROM latex_versions LIMIT 1").get()) return;
  const source = initialSource();
  transaction(() => {
    if (!db.prepare("SELECT version FROM latex_versions LIMIT 1").get())
      db.prepare(
        "INSERT INTO latex_versions (source, source_hash, created_at) VALUES (?,?,?)",
      ).run(source, sourceHash(source), new Date().toISOString());
  });
}
export function latexVersion(version?: number): LatexDocument {
  ensureLatex();
  const row = version
    ? db
        .prepare(`SELECT ${fields}, source FROM latex_versions WHERE version=?`)
        .get(version)
    : db
        .prepare(
          `SELECT ${fields}, source FROM latex_versions ORDER BY version DESC LIMIT 1`,
        )
        .get();
  if (!row) throw new Error("LaTeX version not found.");
  return row as LatexDocument;
}
export function latexContext(): LatexContext {
  const current = latexVersion();
  const versions = db
    .prepare(`SELECT ${fields} FROM latex_versions ORDER BY version DESC`)
    .all() as LatexVersion[];
  const previewHash = latexBuild(current.hash)
    ? current.hash
    : setting<string | null>("latexLastBuild", null);
  return {
    current,
    versions,
    previewHash,
    diagnostics: previewHash ? latexBuild(previewHash)?.diagnostics || [] : [],
  };
}
export function saveLatex(
  source: string,
  expectedVersion: number,
  restoredFrom?: number,
) {
  ensureLatex();
  return transaction(() => {
    const current = latexVersion();
    if (current.version !== expectedVersion)
      throw new Error(
        "The LaTeX document changed in another window. Download your .tex copy, then reload before saving.",
      );
    if (restoredFrom) latexVersion(restoredFrom);
    if (current.source === source && !restoredFrom) return current;
    const result = db
      .prepare(
        "INSERT INTO latex_versions (source, source_hash, created_at, restored_from) VALUES (?,?,?,?)",
      )
      .run(
        source,
        sourceHash(source),
        new Date().toISOString(),
        restoredFrom || null,
      );
    return latexVersion(Number(result.lastInsertRowid));
  });
}
export function latexBuild(hash: string) {
  const row = db
    .prepare("SELECT pdf, diagnostics FROM latex_builds WHERE source_hash=?")
    .get(hash) as { pdf: Uint8Array; diagnostics: string } | undefined;
  return row
    ? {
        pdf: Buffer.from(row.pdf),
        diagnostics: JSON.parse(row.diagnostics) as LatexDiagnostic[],
      }
    : null;
}
export function saveLatexBuild(
  source: string,
  pdf: Buffer,
  diagnostics: LatexDiagnostic[],
) {
  const hash = sourceHash(source);
  transaction(() => {
    db.prepare("INSERT OR REPLACE INTO latex_builds VALUES (?,?,?,?)").run(
      hash,
      pdf,
      JSON.stringify(diagnostics),
      new Date().toISOString(),
    );
    putSetting("latexLastBuild", hash);
    // Saved versions keep their PDFs. Bound transient previews from unsaved edits.
    db.prepare(
      `DELETE FROM latex_builds WHERE source_hash NOT IN (SELECT source_hash FROM latex_versions)
      AND source_hash NOT IN (SELECT source_hash FROM latex_builds ORDER BY created_at DESC LIMIT 8)`,
    ).run();
  });
  return { hash, diagnostics };
}
