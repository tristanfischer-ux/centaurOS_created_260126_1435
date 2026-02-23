'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
 * Memoized to avoid re-renders when parent updates (e.g. streaming content).
 *
 * @param content - The markdown string to render
 * @param className - Additional CSS classes for the wrapper
 *
 * @example
 * <Markdown content={report} className="text-sm" />
 */
// ─── Confidence Marker Detection ───────────────────────────────────────

interface ConfidenceMarker {
  raw: string
  label: string
  containerClass: string
  badgeClass: string
}

const CONFIDENCE_MARKERS: ConfidenceMarker[] = [
  {
    raw: '[FROM COMPANY DATA]',
    label: 'Company Data',
    containerClass: 'border-l-4 border-l-success bg-success/5',
    badgeClass: 'text-success',
  },
  {
    raw: '[INDUSTRY BENCHMARK]',
    label: 'Industry Benchmark',
    containerClass: 'border-l-4 border-l-info bg-info/5',
    badgeClass: 'text-info',
  },
  {
    raw: '[YOUR ESTIMATE]',
    label: 'Estimate',
    containerClass: 'border-l-4 border-l-warning bg-warning/5',
    badgeClass: 'text-warning',
  },
  {
    raw: '[DATA NEEDED:',
    label: 'Data Needed',
    containerClass: 'border-l-4 border-dashed border-l-destructive bg-destructive/5',
    badgeClass: 'text-destructive',
  },
]

function extractTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(extractTextContent).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    return extractTextContent((children as React.ReactElement<{ children?: React.ReactNode }>).props.children)
  }
  return ''
}

function detectConfidenceMarker(text: string): ConfidenceMarker | null {
  const trimmed = text.trimStart()
  for (const marker of CONFIDENCE_MARKERS) {
    if (trimmed.startsWith(marker.raw)) {
      // For DATA NEEDED, extract the specific field name
      if (marker.raw === '[DATA NEEDED:') {
        const endBracket = trimmed.indexOf(']')
        if (endBracket > 0) {
          const field = trimmed.slice(marker.raw.length, endBracket).trim()
          return {
            ...marker,
            raw: trimmed.slice(0, endBracket + 1),
            label: `Data Needed: ${field}`,
          }
        }
      }
      return marker
    }
  }
  return null
}

function stripMarkerFromChildren(children: React.ReactNode, markerRaw: string): React.ReactNode {
  if (typeof children === 'string') {
    return children.replace(markerRaw, '').trimStart()
  }
  if (Array.isArray(children)) {
    let stripped = false
    return children.map((child) => {
      if (stripped) return child
      if (typeof child === 'string' && child.includes(markerRaw)) {
        stripped = true
        return child.replace(markerRaw, '').trimStart()
      }
      return child
    })
  }
  return children
}

function MarkdownInner({ content, className }: MarkdownProps) {
  if (!content) return null

  return (
    <div className={cn('markdown-content', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        p: ({ children }) => {
          // Short-circuit: skip expensive extractTextContent if first child doesn't start with '['
          const firstChild = Array.isArray(children) ? children[0] : children
          if (typeof firstChild !== 'string' || !firstChild.trimStart().startsWith('[')) {
            return <p className="my-2.5 leading-relaxed text-inherit">{children}</p>
          }
          // Detect confidence markers and render styled sections
          const text = extractTextContent(children)
          const marker = detectConfidenceMarker(text)
          if (marker) {
            return (
              <div className={cn('my-2.5 rounded-md pl-3 pr-2 py-2', marker.containerClass)}>
                <span className={cn('inline-block text-[10px] font-semibold uppercase tracking-wider mb-1', marker.badgeClass)}>
                  {marker.label}
                </span>
                <p className="leading-relaxed text-inherit text-sm">
                  {stripMarkerFromChildren(children, marker.raw)}
                </p>
              </div>
            )
          }
          return (
            <p className="my-2.5 leading-relaxed text-inherit">{children}</p>
          )
        },
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

export const Markdown = React.memo(MarkdownInner)
