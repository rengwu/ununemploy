export type AssistantAttachment = {
  id: string;
  name: string;
  mediaType: string;
  size: number;
  messageId: string | null;
};
export type InferenceImage = { name: string; mediaType: string; data: string };
export const attachmentAccept =
  ".pdf,.txt,.md,.csv,.json,.tex,.png,.jpg,.jpeg,.webp";
export const attachmentLimit = 10 * 1024 * 1024;
export const attachmentCountLimit = 5;
