import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

const components: Components = {
  pre: ({ children }) => (
    <pre className="scroll-slim my-3 overflow-x-auto rounded-xl border border-border/70 bg-background/80 p-3.5 text-[13px] leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    return (
      <code
        className={
          isBlock
            ? "block font-mono"
            : "rounded-md border border-border/60 bg-background/70 px-1.5 py-0.5 font-mono text-[0.85em]"
        }
      >
        {children}
      </code>
    );
  },
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => (
    <h2 className="mt-4 mb-2 text-lg font-semibold tracking-tight first:mt-0">{children}</h2>
  ),
  h2: ({ children }) => (
    <h3 className="mt-4 mb-2 text-base font-semibold tracking-tight first:mt-0">{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-3 mb-1.5 text-sm font-semibold tracking-tight first:mt-0">{children}</h4>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-primary/50 bg-primary/5 py-1.5 pr-3 pl-3.5 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="scroll-slim my-3 overflow-x-auto rounded-xl border border-border/70">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border/70 bg-muted/40 px-3 py-2 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-border/40 px-3 py-2 align-top">{children}</td>,
  hr: () => <hr className="my-4 border-0 border-t border-border/70" />,
};

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
});
