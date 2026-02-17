"use client"

/**
 * @file browse-context.tsx
 *
 * @description Provides web page context from the in-app browser to the
 * specialist advisor panel. When the user browses a page, the extracted
 * content is stored here so the BriefSpecialistDialog can inject it
 * into the specialist's system prompt.
 *
 * @related
 * - Browse page: src/app/(platform)/browse/page.tsx
 * - Advisor panel: src/components/specialists/advisor-panel.tsx
 * - BriefSpecialistDialog: src/app/(platform)/agents/brief-specialist-dialog.tsx
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BrowsePageContext {
  /** URL currently being viewed */
  url: string
  /** Page title */
  title: string
  /** Extracted text content (truncated for token efficiency) */
  content: string
  /** Page description */
  description: string
}

interface BrowseContextValue {
  /** Current page context, or null if not browsing */
  pageContext: BrowsePageContext | null
  /** Set the current page context (called by browse page) */
  setPageContext: (ctx: BrowsePageContext | null) => void
  /** Clear the page context (called when leaving browse page) */
  clearPageContext: () => void
  /** Format the page context as a system prompt suffix */
  formatForPrompt: () => string
}

// ─── Context ────────────────────────────────────────────────────────────────

const BrowseContext = createContext<BrowseContextValue | null>(null)

// ─── Provider ───────────────────────────────────────────────────────────────

/**
 * Provides browse page context to the specialist system.
 *
 * @description Wraps the platform layout so the BriefSpecialistDialog
 * can access the current browsed page content for context injection.
 */
export function BrowseContextProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [pageContext, setPageContextState] = useState<BrowsePageContext | null>(null)

  const setPageContext = useCallback((ctx: BrowsePageContext | null) => {
    setPageContextState(ctx)
  }, [])

  const clearPageContext = useCallback(() => {
    setPageContextState(null)
  }, [])

  const formatForPrompt = useCallback((): string => {
    if (!pageContext) return ""

    // Truncate content to ~4000 chars for token efficiency
    const truncatedContent = pageContext.content.length > 4000
      ? pageContext.content.slice(0, 4000) + "\n[Content truncated...]"
      : pageContext.content

    return `\n\n## Browsing Context
The user is currently viewing a web page in the in-app browser. Reference this content naturally in your response.

**Page:** ${pageContext.title}
**URL:** ${pageContext.url}
${pageContext.description ? `**Description:** ${pageContext.description}\n` : ""}
**Page Content:**
${truncatedContent}`
  }, [pageContext])

  const value = useMemo<BrowseContextValue>(
    () => ({
      pageContext,
      setPageContext,
      clearPageContext,
      formatForPrompt,
    }),
    [pageContext, setPageContext, clearPageContext, formatForPrompt],
  )

  return (
    <BrowseContext.Provider value={value}>
      {children}
    </BrowseContext.Provider>
  )
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Access the browse page context.
 *
 * @description Used by the browse page to set context and by
 * BriefSpecialistDialog to read it for prompt injection.
 *
 * @throws Error if used outside BrowseContextProvider
 */
export function useBrowseContext(): BrowseContextValue {
  const ctx = useContext(BrowseContext)
  if (!ctx) {
    throw new Error("useBrowseContext must be used within BrowseContextProvider")
  }
  return ctx
}
