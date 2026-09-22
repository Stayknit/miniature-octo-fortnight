'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Renders doc markdown with the app's design tokens. We map each element
// explicitly rather than relying on a typography plugin, so styling stays
// consistent with the rest of the dashboard and needs no extra dependency.
export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="text-[14px] leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 mt-6 border-b border-border pb-2 font-sans text-2xl font-extrabold tracking-tight text-foreground first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-6 font-sans text-lg font-bold text-foreground">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-4 font-sans text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-1 mt-3 font-sans text-sm font-semibold text-foreground">{children}</h4>
          ),
          p: ({ children }) => <p className="my-2.5 text-muted-foreground">{children}</p>,
          a: ({ children, href }) => (
            <a
              href={href}
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noreferrer' : undefined}
              className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="my-2.5 flex flex-col gap-1.5 pl-5">{children}</ul>,
          ol: ({ children }) => (
            <ol className="my-2.5 flex list-decimal flex-col gap-1.5 pl-5 marker:text-muted-foreground">{children}</ol>
          ),
          li: ({ children, className }) => (
            <li
              className={
                // GFM task-list items carry `.task-list-item`; drop the bullet
                // for those so the checkbox stands alone.
                className?.includes('task-list-item')
                  ? 'list-none text-muted-foreground [&>input]:mr-2 [&>input]:align-middle'
                  : 'list-disc text-muted-foreground marker:text-muted-foreground/60'
              }
            >
              {children}
            </li>
          ),
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 rounded-r-lg border-l-4 border-primary/50 bg-surface-2 py-1 pl-4 pr-3 text-muted-foreground [&_p]:my-1.5">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-6 border-border" />,
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-')
            if (isBlock) {
              return <code className={className}>{children}</code>
            }
            return (
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-foreground">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-surface-2">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-border px-3 py-2 text-left font-semibold text-foreground">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border px-3 py-2 align-top text-muted-foreground">{children}</td>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
