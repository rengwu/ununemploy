import { chromium } from "playwright";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ExternalHyperlink,
} from "docx";
import type { CvDocument, CoverLetterDocument, Template } from "../types.ts";
import { renderCv } from "./render.ts";

export async function exportPdf(
  document: CvDocument | CoverLetterDocument,
  template: Template,
): Promise<Buffer> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.JH_CHROMIUM_PATH || undefined,
    args: process.env.JH_CHROMIUM_PATH ? ["--no-sandbox"] : [],
  });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(renderCv(document, template), {
      waitUntil: "load",
      timeout: 20000,
    });
    return await page.pdf({
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
    });
  } finally {
    await browser.close();
  }
}
export async function exportDocx(cv: CvDocument): Promise<Buffer> {
  const p = (text: string, options: Record<string, unknown> = {}) =>
    new Paragraph({
      children: [new TextRun(text)],
      spacing: { after: 80 },
      ...options,
    });
  const heading = (text: string) =>
    p(text, {
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      spacing: { before: 220, after: 100 },
    });
  const bullet = (text: string, keepNext = false) =>
    p(text, {
      bullet: { level: 0 },
      spacing: { after: 50 },
      keepLines: true,
      keepNext,
    });
  const content: Paragraph[] = [
    p(cv.name, { heading: HeadingLevel.TITLE, spacing: { after: 100 } }),
    p(cv.headline, { spacing: { after: 80 } }),
    p([cv.location, ...cv.contacts.map((c) => c.label)].join(" · "), {
      spacing: { after: 180 },
    }),
    p(cv.summary, { spacing: { after: 180 } }),
    heading("Experience"),
  ];
  for (const e of cv.experience) {
    content.push(
      p(`${e.employer}${e.dates ? ` | ${e.dates}` : ""}`, {
        heading: HeadingLevel.HEADING_2,
        keepNext: true,
      }),
    );
    if (e.title || e.location)
      content.push(
        p([e.title, e.location].filter(Boolean).join(" · "), {
          keepNext: true,
        }),
      );
    content.push(
      ...e.bullets.map((text, i) => bullet(text, i < e.bullets.length - 1)),
    );
  }
  if (cv.projects.length) {
    content.push(heading("Projects"));
    for (const project of cv.projects) {
      content.push(
        new Paragraph({
          children: [
            new ExternalHyperlink({
              children: [
                new TextRun({
                  text: project.name,
                  bold: true,
                  color: "000000",
                }),
              ],
              link: project.url,
            }),
          ],
          keepNext: true,
          spacing: { before: 120, after: 60 },
        }),
        p(project.summary, {
          keepNext: !!project.bullets.length || !!project.attribution,
        }),
        ...project.bullets.map((text, i) =>
          bullet(text, i < project.bullets.length - 1 || !!project.attribution),
        ),
      );
      if (project.attribution) content.push(p(project.attribution));
    }
  }
  if (cv.skills.length)
    content.push(heading("Skills"), p(cv.skills.join(" · ")));
  if (cv.education.length) {
    content.push(heading("Education"));
    for (const e of cv.education)
      content.push(
        p(`${e.institution} | ${e.dates}`, {
          heading: HeadingLevel.HEADING_2,
          keepNext: true,
        }),
        p(e.qualification),
      );
  }
  if (cv.awards.length)
    content.push(
      heading("Awards"),
      ...cv.awards.map((a) => bullet(`${a.name} — ${a.result}, ${a.year}`)),
    );
  const doc = new Document({
    creator: cv.name,
    title: `${cv.name} CV`,
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 20, color: "17212B" },
          paragraph: { spacing: { line: 280 } },
        },
        title: {
          run: { font: "Arial", size: 44, bold: false, color: "000000" },
        },
        heading1: {
          run: { font: "Arial", size: 23, bold: true, color: "000000" },
        },
        heading2: {
          run: { font: "Arial", size: 21, bold: true, color: "000000" },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 907, right: 964, bottom: 907, left: 964 },
          },
        },
        children: content,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export async function exportCoverLetterDocx(
  letter: CoverLetterDocument,
): Promise<Buffer> {
  const p = (text: string, options: Record<string, unknown> = {}) =>
    new Paragraph({
      children: [new TextRun(text)],
      spacing: { after: 240 },
      widowControl: true,
      ...options,
    });
  return Packer.toBuffer(
    new Document({
      creator: letter.name,
      title: `${letter.name} Cover letter`,
      styles: {
        default: {
          document: {
            run: { font: "Arial", size: 22, color: "17212B" },
            paragraph: { spacing: { line: 330 } },
          },
          title: {
            run: { font: "Arial", size: 44, bold: true, color: "000000" },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
            },
          },
          children: [
            p(letter.name, {
              heading: HeadingLevel.TITLE,
              spacing: { after: 120 },
              keepNext: true,
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: [
                    letter.location,
                    ...letter.contacts.map((c) => c.label),
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  size: 18,
                  color: "46515E",
                }),
              ],
              spacing: { after: 440 },
              keepNext: true,
            }),
            p(letter.company, { spacing: { after: 80 }, keepNext: true }),
            new Paragraph({
              children: [new TextRun({ text: letter.role, bold: true })],
              spacing: { after: 360 },
              keepNext: true,
            }),
            p(letter.salutation, { keepNext: true }),
            ...letter.paragraphs.map((text) => p(text)),
            p(letter.closing, {
              spacing: { before: 120, after: 0 },
              keepNext: true,
            }),
            p(letter.name),
          ],
        },
      ],
    }),
  );
}
