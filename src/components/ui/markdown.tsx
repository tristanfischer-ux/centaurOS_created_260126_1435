'use client'

import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

interface MarkdownProps {
  content: string
  className?: string
}

export function Markdown({ content, className }: MarkdownProps) {
  if (!content) return null

  return (
    <ReactMarkdown
      className={cn('markdown-content', className)}
      components={{
        p: ({ children }) => <p className="my-1 text-inherit">{children}</p>,
        h1: ({ children }) => <h1 className="my-2 text-xl font-bold">{children}</h1>,
        h2: ({ children }) => <h2 className="my-2 text-lg font-bold">{children}</h2>,
        h3: ({ children }) => <h3 className="my-2 text-base font-bold">{children}</h3>,
        ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
        ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
        li: ({ children }) => <li className="my-0.5">{children}</li>,
        a: ({ href, children }) => (
          <a 
            href={href} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="bg-slate-100 px-1 py-0.5 rounded text-sm text-slate-800 font-mono">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="bg-slate-100 p-3 rounded overflow-x-auto my-2">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-slate-300 pl-4 my-2 italic text-slate-600">
            {children}
          </blockquote>
        ),
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
