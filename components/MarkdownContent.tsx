"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const components: Components = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const isInline = !match && !className;

      if (isInline) {
        return (
          <code
            className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground"
            {...props}
          >
            {children}
          </code>
        );
      }

      return (
        <SyntaxHighlighter
          style={oneDark}
          language={match ? match[1] : "text"}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: "0.5rem",
            fontSize: "0.8rem",
          }}
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      );
    },
    // Override default elements to use Tailwind classes
    p({ children }) {
      return <p className="mb-2 last:mb-0">{children}</p>;
    },
    ul({ children }) {
      return <ul className="mb-2 ml-4 list-disc last:mb-0">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="mb-2 ml-4 list-decimal last:mb-0">{children}</ol>;
    },
    li({ children }) {
      return <li className="mb-1">{children}</li>;
    },
    h1({ children }) {
      return <h1 className="mb-2 text-lg font-bold">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="mb-2 text-base font-bold">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="mb-2 text-sm font-bold">{children}</h3>;
    },
    blockquote({ children }) {
      return (
        <blockquote className="mb-2 border-l-2 border-primary/50 pl-3 italic text-muted-foreground">
          {children}
        </blockquote>
      );
    },
    a({ href, children }) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {children}
        </a>
      );
    },
    table({ children }) {
      return (
        <div className="mb-2 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            {children}
          </table>
        </div>
      );
    },
    th({ children }) {
      return (
        <th className="border border-border bg-secondary px-2 py-1 text-left font-semibold">
          {children}
        </th>
      );
    },
    td({ children }) {
      return <td className="border border-border px-2 py-1">{children}</td>;
    },
    pre({ children }) {
      return <div className="mb-2 overflow-x-auto last:mb-0">{children}</div>;
    },
    hr() {
      return <hr className="my-3 border-border" />;
    },
  };

  return (
    <div className="markdown-content prose-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
