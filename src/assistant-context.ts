import type { AssistantContext, Receipt } from "../core/assistant/types.ts";
export type { AssistantContext, Receipt };
export type AssistantUpdate = { turnId: string; receipts: Receipt[] };
export function openAssistant() {
  window.dispatchEvent(new Event("jh-assistant-open"));
}
export function onAssistantUpdate(listener: (update: AssistantUpdate) => void) {
  const handler = (event: Event) =>
    listener((event as CustomEvent<AssistantUpdate>).detail);
  window.addEventListener("jh-assistant-updated", handler);
  return () => window.removeEventListener("jh-assistant-updated", handler);
}
export function contextLabel(context: AssistantContext) {
  if (context.document)
    return {
      latex: "LaTeX CV",
      html_cv: "CV data and HTML",
      cover_letter: "Selected cover letter",
      legacy_cv: "Saved resume",
    }[context.document];
  return {
    jobs: "Jobs",
    saved: "Saved jobs",
    profile: "User profile",
    cv: "CV",
    letters: "Cover letters",
    sources: "Sources",
    settings: "Settings",
  }[context.page];
}
