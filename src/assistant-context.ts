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
