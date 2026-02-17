"use client"

/**
 * @file page.tsx — In-app browser with specialist co-browsing.
 *
 * @description Provides an embedded browser experience where users can
 * navigate to any URL. The specialist advisor panel stays open alongside,
 * receiving page content as context for real-time guidance.
 *
 * Strategy: Fetch page server-side first (fast, reliable). Check response
 * headers to determine if the site allows iframe embedding. Show reader
 * view immediately for non-embeddable sites; show iframe for embeddable
 * ones. Users can toggle between views when both are available.
 *
 * @related
 * - Browser frame: src/app/(platform)/browse/browser-frame.tsx
 * - Reader view: src/app/(platform)/browse/reader-view.tsx
 * - Web fetch action: src/actions/web-fetch.ts
 * - Advisor panel context: src/contexts/advisor-panel-context.tsx
 */

import { useState, useCallback, useRef, useEffect } from "react"
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  ExternalLink,
  Search,
  BookOpen,
  Monitor,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { StatusBadge } from "@/components/ui/status-badge"
import { useAdvisorPanel } from "@/contexts/advisor-panel-context"
import { useBrowseContext } from "@/contexts/browse-context"
import { fetchWebPage } from "@/actions/web-fetch"
import { BrowserFrame } from "./browser-frame"
import { ReaderView } from "./reader-view"
import type { WebPageResult } from "@/actions/web-fetch"

// ─── Types ──────────────────────────────────────────────────────────────────

type ViewMode = "empty" | "iframe" | "reader" | "loading" | "error"

interface HistoryEntry {
  url: string
  title: string
  embeddable: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalizes user input into a valid URL.
 * Adds https:// if no protocol specified. Treats non-URL input as a search query.
 */
function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ""

  // Already has a protocol
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  // Looks like a domain (has a dot and no spaces)
  if (/^[^\s]+\.[^\s]+$/.test(trimmed)) {
    return `https://${trimmed}`
  }

  // Treat as search query
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

/**
 * Extracts the hostname from a URL for display purposes.
 */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * BrowsePage — In-app browser with specialist co-browsing.
 *
 * @description Full-page browser experience that fills the main content area.
 * Features a URL bar with navigation controls. Fetches pages server-side first
 * to determine embeddability, then shows reader view or iframe accordingly.
 * Users can toggle between views when a site supports embedding.
 */
export default function BrowsePage(): React.ReactElement {
  const [urlInput, setUrlInput] = useState("")
  const [currentUrl, setCurrentUrl] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("empty")
  const [pageData, setPageData] = useState<WebPageResult | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [isEmbeddable, setIsEmbeddable] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const { openPanel, isOpen } = useAdvisorPanel()
  const { setPageContext, clearPageContext } = useBrowseContext()

  // Auto-open advisor panel when landing on browse page
  useEffect(() => {
    if (!isOpen) {
      openPanel("strategist", {
        handoffContext: "The user is using the in-app browser. Help them research, analyze web pages, and navigate workflows. When they load a page, you'll receive the content as context.",
        contextLabel: "Co-Browsing",
      })
    }
    // Clear browse context when leaving the page
    return () => {
      clearPageContext()
    }
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update browse context when page data changes (so specialist can see it)
  useEffect(() => {
    if (pageData) {
      setPageContext({
        url: pageData.url,
        title: pageData.title,
        content: pageData.content,
        description: pageData.description,
      })
    }
  }, [pageData, setPageContext])

  /**
   * Navigates to a URL: fetches server-side first, then decides view mode.
   *
   * @description Reader-first approach: always fetch the page content first
   * (2-3s), check headers for embeddability, then show the appropriate view.
   * This eliminates the 8s iframe timeout problem entirely.
   */
  const navigateTo = useCallback(async (rawUrl: string) => {
    const url = normalizeUrl(rawUrl)
    if (!url) return

    setCurrentUrl(url)
    setUrlInput(url)
    setViewMode("loading")
    setErrorMessage("")
    setPageData(null)
    setIsEmbeddable(false)

    const result = await fetchWebPage(url)

    if (!result.success || !result.data) {
      setViewMode("error")
      setErrorMessage(result.error || "Failed to load page")
      return
    }

    setPageData(result.data)
    setIsEmbeddable(result.data.embeddable)

    // Show iframe for embeddable sites, reader view for everything else
    if (result.data.embeddable) {
      setViewMode("iframe")
    } else {
      setViewMode("reader")
    }

    // Add to history
    setHistory((prev) => {
      const newEntry: HistoryEntry = {
        url,
        title: result.data!.title,
        embeddable: result.data!.embeddable,
      }
      const newHistory = [...prev.slice(0, historyIndex + 1), newEntry]
      setHistoryIndex(newHistory.length - 1)
      return newHistory
    })
  }, [historyIndex])

  /**
   * Handle URL bar form submission.
   */
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    navigateTo(urlInput)
  }, [urlInput, navigateTo])

  /**
   * Toggle between reader and iframe view (only for embeddable sites).
   */
  const toggleView = useCallback(() => {
    if (!isEmbeddable) return
    setViewMode((prev) => (prev === "iframe" ? "reader" : "iframe"))
  }, [isEmbeddable])

  /**
   * Switch to reader view (used when iframe fails despite being marked embeddable).
   */
  const switchToReader = useCallback(() => {
    setViewMode("reader")
  }, [])

  /**
   * Navigate back in history.
   */
  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const prevEntry = history[historyIndex - 1]
      setHistoryIndex(historyIndex - 1)
      setCurrentUrl(prevEntry.url)
      setUrlInput(prevEntry.url)
      // Re-navigate to reload content
      navigateTo(prevEntry.url)
    }
  }, [history, historyIndex, navigateTo])

  /**
   * Navigate forward in history.
   */
  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextEntry = history[historyIndex + 1]
      setHistoryIndex(historyIndex + 1)
      setCurrentUrl(nextEntry.url)
      setUrlInput(nextEntry.url)
      navigateTo(nextEntry.url)
    }
  }, [history, historyIndex, navigateTo])

  /**
   * Reload the current page.
   */
  const reload = useCallback(() => {
    if (currentUrl) {
      navigateTo(currentUrl)
    }
  }, [currentUrl, navigateTo])

  const canGoBack = historyIndex > 0
  const canGoForward = historyIndex < history.length - 1

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] -m-4 sm:-m-6 lg:-m-8 -mt-14 sm:-mt-6 lg:-mt-8">
      {/* URL Bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-background">
        {/* Navigation buttons */}
        <div className="flex items-center gap-1">
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={goBack}
                disabled={!canGoBack}
                aria-label="Go back"
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Go back</TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={goForward}
                disabled={!canGoForward}
                aria-label="Go forward"
                className="h-8 w-8"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Go forward</TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={reload}
                disabled={!currentUrl}
                aria-label="Reload page"
                className="h-8 w-8"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload</TooltipContent>
          </Tooltip>
        </div>

        {/* URL input */}
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Enter a URL or search term..."
              className="pl-10 pr-4 h-9 text-sm"
              aria-label="URL or search"
            />
          </div>
          <Button type="submit" size="sm" className="h-9 px-4">
            <Search className="h-4 w-4 mr-2" />
            Go
          </Button>
        </form>

        {/* View mode indicator + toggle */}
        <div className="flex items-center gap-2">
          {viewMode === "iframe" && (
            <StatusBadge status="success" size="sm" dot>
              <Monitor className="h-3 w-3 mr-1" />
              Live
            </StatusBadge>
          )}
          {viewMode === "reader" && (
            <StatusBadge status="info" size="sm" dot>
              <BookOpen className="h-3 w-3 mr-1" />
              Reader
            </StatusBadge>
          )}
          {viewMode === "loading" && (
            <StatusBadge status="warning" size="sm">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Loading
            </StatusBadge>
          )}

          {/* View toggle — only shown when site is embeddable and content is loaded */}
          {pageData && isEmbeddable && (viewMode === "iframe" || viewMode === "reader") && (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleView}
                  aria-label={viewMode === "iframe" ? "Switch to Reader View" : "Switch to Live View"}
                  className="h-8 w-8"
                >
                  {viewMode === "iframe" ? (
                    <BookOpen className="h-4 w-4" />
                  ) : (
                    <Monitor className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {viewMode === "iframe" ? "Switch to Reader View" : "Switch to Live View"}
              </TooltipContent>
            </Tooltip>
          )}

          {currentUrl && (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Open in new tab</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "empty" && (
          <EmptyBrowseState onNavigate={navigateTo} inputRef={inputRef} />
        )}

        {viewMode === "loading" && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="h-8 w-8 text-international-orange animate-spin" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">
                Fetching {getDomain(currentUrl)}
              </p>
              <p className="text-xs text-muted-foreground">
                Extracting content for your specialist...
              </p>
            </div>
          </div>
        )}

        {viewMode === "iframe" && currentUrl && (
          <BrowserFrame
            url={currentUrl}
            onEmbedFailed={switchToReader}
            className="h-full"
          />
        )}

        {viewMode === "reader" && pageData && (
          <ReaderView pageData={pageData} className="h-full" />
        )}

        {viewMode === "error" && (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-status-error-light">
              <Globe className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Couldn&apos;t load this page
              </p>
              <p className="text-sm text-muted-foreground max-w-md">
                {errorMessage}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={reload}>
                <RotateCw className="h-4 w-4 mr-2" />
                Try again
              </Button>
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-electric-blue hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Open in new tab
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Empty State ────────────────────────────────────────────────────────────

interface EmptyBrowseStateProps {
  onNavigate: (url: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Shown when no URL has been entered yet. Provides quick-start suggestions.
 */
function EmptyBrowseState({ onNavigate, inputRef }: EmptyBrowseStateProps): React.ReactElement {
  const suggestions = [
    { label: "Alibaba Suppliers", url: "https://www.alibaba.com", icon: "🏭" },
    { label: "ThomasNet", url: "https://www.thomasnet.com", icon: "🔧" },
    { label: "Hacker News", url: "https://news.ycombinator.com", icon: "📰" },
    { label: "Product Hunt", url: "https://www.producthunt.com", icon: "🚀" },
    { label: "Crunchbase", url: "https://www.crunchbase.com", icon: "📊" },
    { label: "Wikipedia", url: "https://en.wikipedia.org", icon: "📚" },
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
      <div className="space-y-4 text-center">
        <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-orange-50 mx-auto">
          <Globe className="h-8 w-8 text-international-orange" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-display font-bold text-foreground">
            Browse with your Specialist
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Enter any URL above. Your specialist can see what you&apos;re viewing and provide
            real-time guidance, summaries, and analysis.
          </p>
        </div>
      </div>

      {/* Quick suggestions */}
      <div className="space-y-3 w-full max-w-lg">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground text-center">
          Quick Start
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {suggestions.map((s) => (
            <button
              key={s.url}
              onClick={() => onNavigate(s.url)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg border",
                "text-sm text-foreground font-medium",
                "hover:bg-muted hover:border-international-orange/30 transition-colors",
                "text-left"
              )}
            >
              <span className="text-lg">{s.icon}</span>
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => inputRef.current?.focus()}
        className="text-muted-foreground"
      >
        <Search className="h-4 w-4 mr-2" />
        Or type a URL above to get started
      </Button>
    </div>
  )
}
