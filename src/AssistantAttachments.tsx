import { useAuiState, type AttachmentAdapter } from "@assistant-ui/react";
import { XIcon } from "@phosphor-icons/react";
import { Button } from "./ui.tsx";
import { api, jsonBody } from "./api.ts";
import {
  attachmentAccept,
  attachmentLimit,
  type AssistantAttachment,
} from "../core/assistant/attachment-types.ts";

export function attachmentAdapter(
  onError: (message: string) => void,
): AttachmentAdapter {
  return {
    accept: attachmentAccept,
    async add({ file }) {
      try {
        if (file.size > attachmentLimit)
          throw new Error("Each attachment must be at most 10 MB.");
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(new Error("Could not read this file."));
          reader.readAsDataURL(file);
        });
        const item = await api<AssistantAttachment>("/assistant/attachments", {
          method: "POST",
          body: jsonBody({ name: file.name, data }),
        });
        return {
          id: item.id,
          type: item.mediaType.startsWith("image/") ? "image" : "document",
          name: item.name,
          contentType: item.mediaType,
          file,
          status: { type: "requires-action", reason: "composer-send" },
        };
      } catch (error) {
        onError(
          error instanceof Error ? error.message : "Could not attach file.",
        );
        throw error;
      }
    },
    async remove(item) {
      await api(`/assistant/attachments/${item.id}`, {
        method: "DELETE",
      }).catch(() =>
        onError(
          "The draft file could not be removed from storage. It will expire automatically.",
        ),
      );
    },
    async send(item) {
      return { ...item, status: { type: "complete" }, content: [] };
    },
  };
}
export function AttachmentList({
  items,
}: {
  items: Pick<AssistantAttachment, "id" | "name" | "mediaType">[];
}) {
  return (
    <div className="assistant-attachments">
      {items.map((item) => (
        <a
          key={item.id}
          href={`/api/assistant/attachments/${item.id}/content`}
          target="_blank"
          rel="noreferrer"
          download={item.name}
        >
          {item.mediaType.startsWith("image/") && (
            <img src={`/api/assistant/attachments/${item.id}/content`} alt="" />
          )}
          <span>{item.name}</span>
        </a>
      ))}
    </div>
  );
}
export function ComposerAttachments({
  remove,
}: {
  remove: (id: string) => void;
}) {
  const items = useAuiState((s) => s.composer.attachments);
  return (
    <div className="assistant-attachments">
      {items.map((item) => (
        <div key={item.id} className="assistant-attachment">
          {item.status.type === "running" ? (
            <span role="status">Attaching {item.name}…</span>
          ) : (
            <>
              {item.contentType?.startsWith("image/") && (
                <img
                  src={`/api/assistant/attachments/${item.id}/content`}
                  alt=""
                />
              )}
              <span>
                {item.name}
                {item.status.type === "incomplete" ? " · Failed" : ""}
              </span>
            </>
          )}
          <Button
            variant="ghost"
            shape="square"
            icon={XIcon}
            aria-label={`Remove ${item.name}`}
            onClick={() => remove(item.id)}
          />
        </div>
      ))}
    </div>
  );
}
