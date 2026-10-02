import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
export function SafeMarkdown({
  text,
  onNavigate,
}: {
  text: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="profile-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
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
