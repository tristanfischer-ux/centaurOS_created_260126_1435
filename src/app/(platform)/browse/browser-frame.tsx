"use client"

/**
 * @file browser-frame.tsx
 *
 * @description Iframe component that embeds a URL directly. Only rendered
 * when the server-side header check confirms the site allows embedding.
 * Includes a safety timeout in case the server check was wrong (some sites
 * block via JavaScript rather than headers).
 *
 * @related
 * - Browse page: src/app/(platform)/browse/page.tsx
 * - Reader view: src/app/(platform)/browse/reader-view.tsx
 * - Web fetch action: src/actions/web-fetch.ts
 */

import { useState, useRef, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { BookOpen } from "lucide-react"

interface BrowserFrameProps {
  /** URL to embed */
  url: string
  /** Called when the iframe fails to load — parent switches to reader view */
  onEmbedFailed: () => void
  /** Additional CSS classes */
  className?: string
}

/**
 * Safety timeout: if the iframe hasn't fired onLoad after this many ms,
 * show a fallback button. Reduced from 8s since we already know the site
 * should be embeddable (server checked headers).
 */
const SAFETY_TIMEOUT_MS = 5000

/**
 * BrowserFrame — Sandboxed iframe for embeddable sites.
 *
 * @description Renders an iframe with security sandbox attributes.
 * Since the server already confirmed the site allows embedding via
 * response headers, this component is simpler — it just needs a safety
 * timeout for the rare case where a site blocks via JavaScript.
 *
 * @component
 */
export function BrowserFrame({
  url,
  onEmbedFailed,
  className,
}: BrowserFrameProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(true)
  const [showFallback, setShowFallback] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleLoad = useCallback(() => {
    setIsLoading(false)
    // Clear safety timeout — iframe loaded successfully
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const handleError = useCallback(() => {
    setIsLoading(false)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    // Iframe errored — switch to reader view
    onEmbedFailed()
  }, [onEmbedFailed])

  // Safety timeout: if iframe hasn't loaded, show a manual fallback button
  useEffect(() => {
    setIsLoading(true)
    setShowFallback(false)

    timeoutRef.current = setTimeout(() => {
      // Don't auto-switch — just show a button so the user can decide
      setShowFallback(true)
      setIsLoading(false)
    }, SAFETY_TIMEOUT_MS)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [url])

  return (
    <div className={cn("relative w-full h-full", className)}>
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background z-10">
          <Skeleton className="w-full h-8 max-w-lg" />
          <Skeleton className="w-full h-64 max-w-lg" />
          <Skeleton className="w-full h-8 max-w-md" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Loading live view...
          </p>
        </div>
      )}

      {/* Fallback button — shown if iframe takes too long */}
      {showFallback && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
          <Button
            variant="secondary"
            size="sm"
            onClick={onEmbedFailed}
            className="shadow-lg border"
          >
            <BookOpen className="h-4 w-4 mr-2" />
            Page not loading? Switch to Reader View
          </Button>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={url}
        title={`Browsing: ${url}`}
        onLoad={handleLoad}
        onError={handleError}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className="w-full h-full border-0"
        referrerPolicy="no-referrer"
      />
    </div>
  )
}
