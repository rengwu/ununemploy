import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const workerData = await new Promise((resolve) =>
  process.once("message", resolve),
);
process.once("disconnect", () => process.exit(0));
try {
  const task = getDocument({
    data: new Uint8Array(workerData),
    isEvalSupported: false,
    useSystemFonts: false,
    useWorkerFetch: false,
    disableFontFace: true,
  });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > 80) throw new Error("PDFs must have at most 80 pages.");
    let text = "";
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      text +=
        `\n[Page ${index}]\n` +
        content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("");
      if (text.length > 100000)
        throw new Error(
          "PDF text exceeds 100,000 characters. Attach a smaller document.",
        );
    }
    if (!text.replace(/\[Page \d+\]/g, "").trim())
      throw new Error(
        "This PDF has no extractable text. Attach screenshots of its pages instead.",
      );
    process.send({ text });
  } finally {
    await task.destroy();
  }
} catch (error) {
  process.send({
    error: error instanceof Error ? error.message : "Could not read PDF.",
  });
}
