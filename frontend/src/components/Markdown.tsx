import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Render a markdown string as formatted content.
 *
 * Wraps react-markdown with GitHub-flavoured markdown (tables, task lists,
 * strikethrough, autolinks). Output is scoped under `.md` so styling stays
 * local — see the `.md` block in console.css. react-markdown sanitises by
 * default (no raw HTML is rendered), so untrusted bodies are safe to display.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
