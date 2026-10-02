import Handlebars from "handlebars";
import sanitizeHtml from "sanitize-html";
import type {
  CvDocument,
  CoverLetterDocument,
  Profile,
  Template,
} from "../types.ts";

export function fromProfile(p: Profile): CvDocument {
  const dates = (e: {
    start: { display: string | null };
    end: { display: string | null };
    isCurrent?: boolean | null;
  }) =>
    [e.start.display, e.isCurrent ? "Present" : e.end.display]
      .filter(Boolean)
      .join(" – ");
  return {
    name: p.basics.name,
    headline: p.basics.headline,
    location: p.basics.location,
    summary: p.basics.summary,
    contacts: [
      ...(p.basics.email
        ? [{ label: p.basics.email, url: `mailto:${p.basics.email}` }]
        : []),
      ...(p.basics.phone ? [{ label: p.basics.phone }] : []),
      ...["website", "github", "linkedin"].flatMap((key) => {
        const url = p.basics[key];
        return typeof url === "string" && url
          ? [{ label: url.replace(/^https?:\/\//, "").replace(/\/$/, ""), url }]
          : [];
      }),
    ],
    experience: p.experience.map((e) => ({
      id: e.id,
      employer: e.employer,
      title: e.title || "",
      dates: dates(e),
      location: e.location || "",
      bullets: e.bullets.map((b) => b.text),
    })),
    projects: p.projects.map((e) => ({
      id: e.id,
      name: e.name,
      url: e.url,
      summary: e.summary,
      bullets: e.bullets,
      attribution: e.attribution,
    })),
    skills: [
      ...new Set([
        ...p.experience.flatMap((e) => e.technologies),
        ...p.projects.flatMap((e) => e.technologies),
      ]),
    ],
    education: p.education.map((e) => ({
      institution: e.institution,
      qualification: [e.qualification, e.specialization]
        .filter(Boolean)
        .join(" · "),
      dates: dates(e),
    })),
    awards: p.awards.map((a) => ({
      name: a.name,
      result: a.result,
      year: a.year,
    })),
  };
}
export function renderCv(
  document: CvDocument | CoverLetterDocument,
  template: Template,
): string {
  const render = Handlebars.compile(template.html, {
    strict: false,
    noEscape: false,
  });
  const html = sanitizeHtml(render(document), {
    allowedTags: [
      "header",
      "footer",
      "main",
      "section",
      "article",
      "div",
      "span",
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "a",
      "strong",
      "em",
      "b",
      "i",
      "br",
      "hr",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
    ],
    allowedAttributes: { "*": ["class", "style"], a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
  });
  const css = template.css.replace(/<\/?style[^>]*>/gi, "");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'"><title>${"paragraphs" in document ? "Cover letter" : "CV"}</title><style>${css}</style></head><body>${html}</body></html>`;
}
