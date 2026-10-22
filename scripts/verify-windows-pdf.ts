import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { exportPdf } from "../core/cv/export.ts";
import { fromProfile } from "../core/cv/render.ts";
import { defaultTemplate } from "../core/cv/template.ts";
import { defaultCoverLetterTemplate } from "../core/cover-letter/template.ts";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const exec = promisify(execFile);
process.env.JH_WINDOWS_PDF = resolve(
  process.argv[2] || "build/desktop/windows/ununemploy.exe",
);
const output = resolve(".local-data/verification/windows-pdf");
await mkdir(output, { recursive: true });
async function inspect(bytes: Buffer) {
  const task = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const pdf = await task.promise;
  const pages = pdf.numPages;
  let text = "";
  for (let n = 1; n <= pages; n++)
    text += (await (await pdf.getPage(n)).getTextContent()).items
      .map((i) => ("str" in i ? i.str : ""))
      .join(" ");
  await task.destroy();
  return { pages, text };
}
const profile = JSON.parse(
  await readFile("tests/fixtures/profile.json", "utf8"),
);
const cv = await exportPdf(fromProfile(profile), defaultTemplate);
await writeFile(join(output, "legacy-cv.pdf"), cv);
const cvText = await inspect(cv);
assert(cvText.text.includes(profile.basics.name));
const letter = {
  name: "Maya Chen",
  location: "Kuala Lumpur",
  contacts: [],
  company: "Fixture Company",
  role: "Analyst",
  salutation: "Dear hiring team,",
  closing: "Sincerely,",
  paragraphs: Array.from(
    { length: 18 },
    (_, i) =>
      `Paragraph ${i + 1}. Résumé 中文. ` +
      "Synthetic experience for PDF pagination verification. ".repeat(10),
  ),
};
const pdf = await exportPdf(letter, defaultCoverLetterTemplate);
await writeFile(join(output, "cover-letter.pdf"), pdf);
const text = await inspect(pdf);
assert(text.pages > 1);
for (const value of ["Paragraph 1.", "Paragraph 18.", "Résumé", "中文"])
  assert(text.text.includes(value), `Missing selectable text: ${value}`);
let requests = 0;
const server = createServer((_, reply) => {
  requests++;
  reply.end("External resource");
});
await new Promise<void>((yes) => server.listen(0, "127.0.0.1", yes));
const address = server.address();
assert(address && typeof address !== "string");
const remote = `http://127.0.0.1:${address.port}`;
const isolated = await mkdtemp(join(tmpdir(), "ununemploy-pdf-policy-"));
try {
  // Exercise the native boundary directly without relying on renderCv's CSP.
  await writeFile(
    join(isolated, "input.html"),
    `<!doctype html><html><head><style>@import url('${remote}/css'); p {background-image:url('${remote}/image')}</style></head><body><p>Original text</p><script>document.body.textContent='SCRIPT_RAN';fetch('${remote}/script')</script><img src='${remote}/img'><iframe src='${remote}/frame'></iframe></body></html>`,
  );
  await exec(process.env.JH_WINDOWS_PDF, ["--print-pdf", isolated], {
    windowsHide: true,
    timeout: 45000,
  });
  const isolatedText = await inspect(
    await readFile(join(isolated, "output.pdf")),
  );
  assert(isolatedText.text.includes("Original text"));
  assert(!isolatedText.text.includes("SCRIPT_RAN"));
  assert.equal(requests, 0);
} finally {
  await new Promise<void>((yes) => server.close(() => yes()));
  await rm(isolated, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 250,
  });
}
const results = {
  result: "Passed",
  legacyCvPages: cvText.pages,
  coverLetterPages: text.pages,
  unicodeSelectable: true,
  networkRequests: requests,
  scriptsBlocked: true,
};
await writeFile(
  join(output, "results.json"),
  JSON.stringify(results, null, 2) + "\n",
);
console.log(JSON.stringify(results));
