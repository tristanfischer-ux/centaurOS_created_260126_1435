/**
 * @file SkillDocumentRenderer.tsx
 *
 * @description Renders Markdown document content from skill-generated documents.
 * Uses react-markdown with remark-gfm for tables, strikethrough, and task lists.
 * Styles are applied via component overrides (no @tailwindcss/typography dependency).
 *
 * @related
 * - src/lib/document-skills/types.ts — SkillDocumentResult type
 * - src/app/(platform)/reports/page.tsx — Consumer
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

import type { Components } from 'react-markdown'

interface SkillDocumentRendererProps {
  content: string
  forPrint?: boolean
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="font-display text-2xl font-bold text-foreground mt-8 mb-4 tracking-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-display text-xl font-semibold text-foreground mt-8 mb-4 pb-2 border-b border-border tracking-tight">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-display text-lg font-semibold text-foreground mt-6 mb-3 tracking-tight">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="font-display text-base font-medium text-foreground mt-4 mb-2">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-sm text-foreground leading-relaxed mb-3">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic">{children}</em>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-international-orange hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>
  ),
  ul: ({ children }) => (
    <ul className="my-3 ml-6 list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 ml-6 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm text-foreground leading-relaxed">{children}</li>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="text-left px-3 py-2 font-semibold text-foreground border border-border text-sm">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-foreground border border-border text-sm">{children}</td>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-international-orange/30 bg-muted/30 px-4 py-2 my-4 text-sm text-muted-foreground">{children}</blockquote>
  ),
  code: ({ children, className }) => {
    // Fenced code blocks get a className like "language-xxx"
    if (className) {
      return (
        <pre className="my-4 rounded-lg bg-muted p-4 overflow-x-auto">
          <code className="text-sm text-foreground font-mono">{children}</code>
        </pre>
      )
    }
    return (
      <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
    )
  },
  pre: ({ children }) => (
    <>{children}</>
  ),
  hr: () => (
    <hr className="border-border my-6" />
  ),
}

export function SkillDocumentRenderer({ content, forPrint = false }: SkillDocumentRendererProps) {
  return (
    <div className={cn('max-w-none', forPrint && 'shadow-none print:shadow-none')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
