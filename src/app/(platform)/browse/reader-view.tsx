"use client"

/**
 * @file reader-view.tsx
 *
 * @description Clean, readable rendering of extracted web page content.
 * Used as the fallback when a site blocks iframe embedding. Displays
 * the page content in ForgeOS's design system with proper typography.
 *
 * @related
 * - Browse page: src/app/(platform)/browse/page.tsx
 * - Web fetch action: src/actions/web-fetch.ts
 */

import { cn } from "@/lib/utils"
import { ExternalLink, Clock, User, BookOpen } from "lucide-react"
import DOMPurify from "isomorphic-dompurify"
import type { WebPageResult } from "@/actions/web-fetch"

interface ReaderViewProps {
  /** Extracted page data from fetchWebPage */
  pageData: WebPageResult
  /** Additional CSS classes */
  className?: string
}

/**
 * ReaderView — Clean rendered view of extracted web page content.
 *
 * @description Renders sanitized HTML from the web fetch action in a
 * styled container that matches ForgeOS typography. Shows page metadata
 * (title, source, author, reading time) and a link to the original URL.
 *
 * @component
 *
 * @example
 * <ReaderView pageData={fetchedPage} />
 */
export function ReaderView({ pageData, className }: ReaderViewProps): React.ReactElement {
  return (
    <div className={cn("flex flex-col h-full overflow-y-auto", className)}>
      {/* Reader mode banner */}
      <div className="flex items-center gap-2 px-6 py-3 bg-status-info-light border-b">
        <BookOpen className="h-4 w-4 text-status-info" />
        <p className="text-sm text-status-info-dark">
          <span className="font-medium">Reader View</span>
          {" — "}
          This site doesn&apos;t support embedding. Your specialist can still see the full content.
        </p>
      </div>

      {/* Article content */}
      <div className="flex-1 overflow-y-auto">
        <article className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {/* Page header */}
          <header className="space-y-4">
            {/* Source info */}
            <div className="flex items-center gap-3">
              {pageData.favicon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pageData.favicon}
                  alt=""
                  className="h-5 w-5 rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none"
                  }}
                />
              )}
              <span className="text-sm text-muted-foreground">
                {pageData.siteName || new URL(pageData.url).hostname}
              </span>
              <a
                href={pageData.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-electric-blue hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Original
              </a>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-display font-bold text-foreground leading-tight">
              {pageData.title}
            </h1>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {pageData.byline && (
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {pageData.byline}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {pageData.readingTimeMinutes} min read
              </span>
            </div>

            {/* Description */}
            {pageData.description && (
              <p className="text-muted-foreground text-base leading-relaxed italic">
                {pageData.description}
              </p>
            )}
          </header>

          {/* Divider */}
          <hr className="border-slate-100" />

          {/* Rendered HTML content */}
          <div
            className="prose prose-sm max-w-none
              prose-headings:text-foreground prose-headings:font-display
              prose-p:text-foreground prose-p:leading-relaxed
              prose-a:text-electric-blue prose-a:no-underline hover:prose-a:underline
              prose-strong:text-foreground
              prose-blockquote:border-l-international-orange prose-blockquote:text-muted-foreground
              prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded
              prose-pre:bg-muted prose-pre:text-foreground
              prose-img:rounded-lg prose-img:max-w-full
              prose-table:text-sm
              prose-th:text-foreground prose-th:font-semibold
              prose-td:text-foreground"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(pageData.htmlContent, { FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'], FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'] }) }}
          />
        </article>
      </div>
    </div>
  )
}
