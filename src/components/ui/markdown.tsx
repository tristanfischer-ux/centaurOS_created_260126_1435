'use client'

import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

interface MarkdownProps {
  /** Markdown string to render */
  content: string
  /** Additional CSS classes for the wrapper */
  className?: string
}

/**
 * SECURITY: Validate URL protocols to prevent XSS via javascript: or data: URLs
 */
function isValidUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url, window.location.origin)
    // Only allow safe protocols
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Markdown — renders markdown content with polished, report-quality typography.
 *
 * @description Provides styled rendering for research reports, documentation,
 * and any markdown content. Uses semantic color tokens for consistency.
 *
 * @param content - The markdown string to render
 * @param className - Additional CSS classes for the wrapper
 *
 * @example
 * <Markdown content={report} className="text-sm" />
 */
export function Markdown({ content, className }: MarkdownProps) {
  if (!content) return null

  return (
    <div className={cn('markdown-content', className)}>
      <ReactMarkdown
        components={{
        p: ({ children }) => (
          <p className="my-2.5 leading-relaxed text-inherit">{children}</p>
        ),
        h1: ({ children }) => (
          <h1 className="mt-6 mb-3 text-xl font-bold text-foreground first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-8 mb-3 text-lg font-bold text-foreground border-b border-muted pb-2 first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-5 mb-2 text-base font-semibold text-foreground">
            {children}
          </h3>
        ),
        ul: ({ children }) => (
          <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed pl-1">{children}</li>
        ),
        // SECURITY: Validate URLs to prevent XSS via javascript: or data: URLs
        a: ({ href, children }) => {
          const safeHref = isValidUrl(href) ? href : '#'
          return (
            <a 
              href={safeHref} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline underline-offset-2"
            >
              {children}
            </a>
          )
        },
        code: ({ children }) => (
          <code className="bg-muted px-1.5 py-0.5 rounded text-[0.9em] text-foreground font-mono">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="bg-muted p-4 rounded-lg overflow-x-auto my-3 text-sm">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-international-orange/40 pl-4 my-4 text-muted-foreground">
            {children}
          </blockquote>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        hr: () => <hr className="my-6 border-t border-muted" />,
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/60">{children}</thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr className="border-b border-muted last:border-b-0">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-4 py-2 text-left font-semibold text-foreground">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-2 text-muted-foreground">{children}</td>
        ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
