import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { attachmentCitations } from "./attachment-citations.ts";
import type { AssistantAttachment } from "../core/assistant/attachment-types.ts";
import { useMemo } from "react";
export function SafeMarkdown({
  text,
  onNavigate,
  attachments,
}: {
  text: string;
  onNavigate?: () => void;
  attachments?: AssistantAttachment[];
}) {
  const plugins = useMemo(
    () =>
      attachments ? [remarkGfm, attachmentCitations(attachments)] : [remarkGfm],
    [attachments],
  );
  return (
    <div className="profile-markdown">
      <Markdown
        remarkPlugins={plugins}
        skipHtml
        components={{
          img: () => null,
          a: ({ children, href }) =>
            href?.startsWith("#") ? (
              <a href={href} onClick={onNavigate}>
                {children}
              </a>
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
