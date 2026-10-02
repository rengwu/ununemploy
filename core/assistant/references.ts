import { createHash } from "node:crypto";
import { parseDocument } from "htmlparser2";
import { textContent, removeElement, findAll } from "domutils";
import { isTag, Text } from "domhandler";
import { readUrl, type FetchContext } from "../http.ts";
export function mentionedUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>"'\])]+/g)].flatMap(([value]) => {
    try {
      const url = new URL(value.replace(/[.,;!?]+$/, ""));
      url.hash = "";
      return [url.href];
    } catch {
      return [];
    }
  });
}
export function referenceTarget(input: string, allowed: Set<string>) {
  const url = new URL(input);
  url.hash = "";
  if (!allowed.has(url.href))
    throw new Error(
      "Read only an exact public URL supplied by the user or recorded in the profile. Ask for the reference URL if missing.",
    );
  if (url.username || url.password)
    throw new Error("Reference URLs cannot contain credentials.");
  const repo =
    url.hostname === "github.com" &&
    url.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/?$/);
  return {
    original: url.href,
    request: repo
      ? `https://api.github.com/repos/${repo[1]}/${repo[2]}/readme`
      : url.href,
    repo: !!repo,
  };
}
export type Reference = {
  id: string;
  url: string;
  text: string;
  truncated: boolean;
  fetchedAt: string;
};
export async function readReference(
  url: string,
  allowed: Set<string>,
  budget: FetchContext,
  signal: AbortSignal,
): Promise<Reference> {
  const target = referenceTarget(url, allowed);
  const origin = new URL(target.request);
  const body = await readUrl(target.request, budget, {
    cache: false,
    maxBytes: 3 * 1024 * 1024,
    signal,
    ...(target.repo
      ? { headers: { Accept: "application/vnd.github.raw+json" } }
      : {}),
    allowRedirect: (next) =>
      next.hostname.replace(/^www\./, "") ===
      origin.hostname.replace(/^www\./, ""),
  });
  let text = body;
  if (!target.repo && /<(?:html|body|head|div|main)[\s>]/i.test(body)) {
    const document = parseDocument(body);
    for (const el of findAll(
      (node) =>
        isTag(node) &&
        [
          "script",
          "style",
          "noscript",
          "svg",
          "form",
          "nav",
          "footer",
        ].includes(node.name),
      document.children,
    ))
      removeElement(el);
    // Preserve separators so exact quotations remain readable in provenance.
    const blocks = findAll(
      (node) => isTag(node) && /^(p|h[1-6]|li|section|div|br)$/.test(node.name),
      document.children,
    );
    for (const el of blocks) if (isTag(el)) el.children.push(new Text("\n"));
    text = textContent(document)
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();
  }
  if (!text.trim())
    throw new Error(
      "The reference returned no readable text. Paste the relevant content instead.",
    );
  return {
    id: `reference:${createHash("sha256")
      .update(target.original + text)
      .digest("hex")
      .slice(0, 24)}`,
    url: target.original,
    text: text.slice(0, 24000),
    truncated: text.length > 24000,
    fetchedAt: new Date().toISOString(),
  };
}
