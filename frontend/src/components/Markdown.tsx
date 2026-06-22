import { lazy, Suspense } from "react";

const MarkdownRenderer = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([
    import("react-markdown"),
    import("remark-gfm"),
  ]);

  return {
    default: function MarkdownRenderer({ children }: { children: string }) {
      return <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>;
    },
  };
});

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
      <Suspense fallback={<span>{children}</span>}>
        <MarkdownRenderer>{children}</MarkdownRenderer>
      </Suspense>
    </div>
  );
}
