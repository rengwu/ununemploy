import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getProfile, getTemplate } from "../core/db/index.ts";
import { fromProfile } from "../core/cv/render.ts";
import { exportPdf, exportDocx } from "../core/cv/export.ts";
import { config } from "../core/config.ts";
const directory = join(config.dataDir, "verification");
await mkdir(directory, { recursive: true });
const tailored = JSON.parse(
  await readFile(join(directory, "generated-cv.json"), "utf8"),
);
for (const [name, document, template] of [
  ["master", fromProfile(getProfile()), getTemplate()],
  ["tailored", tailored.document, getTemplate()],
] as const) {
  await writeFile(
    join(directory, `${name}.pdf`),
    await exportPdf(document, template),
  );
  await writeFile(join(directory, `${name}.docx`), await exportDocx(document));
  console.log(`Exported ${name} PDF and DOCX.`);
}
