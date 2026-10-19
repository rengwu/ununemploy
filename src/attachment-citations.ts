import type { Root, RootContent } from "mdast";
import type { AssistantAttachment } from "../core/assistant/attachment-types.ts";

// Resolve at render time so older replies benefit without rewriting history.
export function attachmentCitations(attachments: AssistantAttachment[]) {
  const files = new Map(attachments.map((file) => [file.id, file]));
  return () => (tree: Root) => {
    function visit(parent: { children: RootContent[] }) {
      parent.children = parent.children.flatMap((node): RootContent[] => {
        if (node.type === "link" || node.type === "linkReference")
          return [node];
        if (node.type !== "text") {
          if ("children" in node) visit(node as { children: RootContent[] });
          return [node];
        }
        const result: RootContent[] = [];
        let start = 0;
        for (const match of node.value.matchAll(/\[attachment:([\w-]+)\]/g)) {
          result.push({
            type: "text",
            value: node.value.slice(start, match.index),
          });
          const file = files.get(match[1]);
          result.push(
            file
              ? {
                  type: "link",
                  url: `/api/assistant/attachments/${encodeURIComponent(file.id)}/content`,
                  children: [{ type: "text", value: file.name }],
                }
              : { type: "text", value: "Attachment unavailable" },
          );
          start = match.index + match[0].length;
        }
        result.push({ type: "text", value: node.value.slice(start) });
        return result;
      });
    }
    visit(tree);
  };
}
