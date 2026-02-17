"use client"

/**
 * @file browser-frame.tsx
 *
 * @description Iframe component that attempts to embed a URL directly.
 * Detects when a site blocks iframe embedding (via X-Frame-Options or CSP)
 * and signals the parent to fall back to reader view.
 *
 * Detection strategy:
 * 1. Set iframe src and start a timeout
 * 2. Listen for onLoad — if it fires, the site loaded (may still be blocked)
 * 3. If timeout expires without onLoad, or onError fires, trigger fallback
 * 4. Some sites load a blank page when blocked — detect via timeout heuristic
 *
 * @related
 * - Browse page: src/app/(platform)/browse/page.tsx
 * - Reader view: src/app/(platform)/browse/reader-view.tsx
 */

import { useState, useRef, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle, ExternalLink } from "lucide-react"

interface BrowserFrameProps {
  /** URL to embed */
  url: string
  /** Called when the iframe fails to load (site blocks embedding) */
  onEmbedFailed: () => void
  /** Called when the iframe loads successfully */
  onEmbedSuccess: () => void
  /** Additional CSS classes */
  className?: string
}

/** How long to wait for iframe to load before assuming it's blocked */
const EMBED_TIMEOUT_MS = 8000

/**
 * BrowserFrame — Sandboxed iframe with embed failure detection.
 *
 * @description Renders an iframe with security sandbox attributes.
 * Monitors the load event and uses a timeout fallback to detect
 * when sites silently block iframe embedding.
 *
 * @component
 */
export function BrowserFrame({
  url,
  onEmbedFailed,
  onEmbedSuccess,
  className,
}: BrowserFrameProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasReportedRef = useRef(false)

  const handleLoad = useCallback(() => {
    if (hasReportedRef.current) return
    hasReportedRef.current = true

    // Clear the timeout since we got a load event
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    setIsLoading(false)
    onEmbedSuccess()
  }, [onEmbedSuccess])

  const handleError = useCallback(() => {
    if (hasReportedRef.current) return
    hasReportedRef.current = true

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    setIsLoading(false)
    setHasError(true)
    onEmbedFailed()
  }, [onEmbedFailed])

  // Set up timeout for silent failures (sites that block without error event)
  useEffect(() => {
    hasReportedRef.current = false
    setIsLoading(true)
    setHasError(false)

    timeoutRef.current = setTimeout(() => {
      if (!hasReportedRef.current) {
        hasReportedRef.current = true
        setIsLoading(false)
        setHasError(true)
        onEmbedFailed()
      }
    }, EMBED_TIMEOUT_MS)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [url, onEmbedFailed])

  if (hasError) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-4 p-8 text-center", className)}>
        <div className="flex items-center justify-center h-12 w-12 rounded-full bg-status-warning-light">
          <AlertCircle className="h-6 w-6 text-status-warning" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            This site doesn&apos;t support embedding
          </p>
          <p className="text-sm text-muted-foreground max-w-md">
            Switching to Reader View so your specialist can still see the content.
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-electric-blue hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Open in new tab
        </a>
      </div>
    )
  }

  return (
    <div className={cn("relative w-full h-full", className)}>
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background z-10">
          <Skeleton className="w-full h-8 max-w-lg" />
          <Skeleton className="w-full h-64 max-w-lg" />
          <Skeleton className="w-full h-8 max-w-md" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Loading page...
          </p>
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
