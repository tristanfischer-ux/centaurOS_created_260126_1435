/**
 * @file use-page-insights.ts — Shared hook for specialist page insights
 *
 * @description Extracts the common pattern of fetching AI specialist insights
 * on page load: state management, StrictMode double-mount guard, async fetch,
 * graceful error handling, localStorage caching, empty-state coaching,
 * loading state, and dismiss logic.
 *
 * Caching: On successful fetch, insights are cached in localStorage keyed by
 * `cacheKey`. On next visit, cached insights are shown instantly while a fresh
 * fetch happens in the background. Cache expires after 1 hour.
 *
 * Empty state: When `enabled` is false and `emptyInsight` is provided, the hook
 * returns that static insight so the specialist can coach the user on what to
 * enter first — no API call needed.
 *
 * Loading: `isLoading` is true when an API call is in flight and no cached
 * insights are available. When cache is available, `isLoading` stays false
 * (stale-while-revalidate pattern).
 *
 * @related
 * - Server actions: src/actions/specialist-page-insights.ts
 * - Card component: src/components/specialists/specialist-insight-card.tsx
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { AgentInsight } from '@/actions/agent-insights'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CachedInsights {
  insights: AgentInsight[]
  timestamp: number
}

function getCached(key: string): AgentInsight[] | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed: CachedInsights = JSON.parse(raw)
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(key)
      return null
    }
    return parsed.insights
  } catch {
    return null
  }
}

function setCache(key: string, insights: AgentInsight[]): void {
  try {
    const data: CachedInsights = { insights, timestamp: Date.now() }
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

interface UsePageInsightsOptions {
  /** Optional localStorage key for caching (e.g. 'finn-cash-burn') */
  cacheKey?: string
  /** Static insight shown when enabled=false (empty state coaching) */
  emptyInsight?: AgentInsight
}

interface UsePageInsightsResult {
  insights: AgentInsight[]
  dismissInsight: (id: string) => void
  /** True when an API call is in flight and no cached insights are available */
  isLoading: boolean
}

/**
 * Fetches specialist insights on mount and provides dismiss logic.
 *
 * @param fetchFn - Async function that calls the relevant server action
 * @param enabled - Whether to fetch (false skips the call, e.g. when data is empty)
 * @param options - Cache key and/or empty state insight
 * @returns insights array, dismissInsight callback, and isLoading state
 */
export function usePageInsights(
  fetchFn: () => Promise<AgentInsight[]>,
  enabled: boolean,
  options?: string | UsePageInsightsOptions,
): UsePageInsightsResult {
  // INTENT: Support both string (cacheKey only) and options object for backwards compat
  const opts = typeof options === 'string' ? { cacheKey: options } : options
  const cacheKey = opts?.cacheKey
  const emptyInsight = opts?.emptyInsight

  // INTENT: Determine initial state — cache hit means no loading needed
  const [initialState] = useState(() => {
    if (!enabled && emptyInsight) return { insights: [emptyInsight], hadCache: true }
    if (cacheKey && enabled) {
      const cached = getCached(`page-insights:${cacheKey}`)
      if (cached) return { insights: cached, hadCache: true }
    }
    return { insights: [] as AgentInsight[], hadCache: false }
  })

  const [insights, setInsights] = useState<AgentInsight[]>(initialState.insights)
  const [isLoading, setIsLoading] = useState(enabled && !initialState.hadCache)
  // SECURITY: Prevent duplicate AI calls from React Strict Mode double-mount
  const fetched = useRef(false)

  useEffect(() => {
    if (!enabled) return
    if (fetched.current) return
    fetched.current = true

    fetchFn()
      .then((result) => {
        if (Array.isArray(result) && result.length > 0) {
          setInsights(result)
          if (cacheKey) {
            setCache(`page-insights:${cacheKey}`, result)
          }
        }
      })
      .catch(() => { /* Non-critical — page works without insights */ })
      .finally(() => setIsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismissInsight = useCallback((id: string) => {
    setInsights((prev) => prev.filter((i) => i.id !== id))
  }, [])

  return { insights, dismissInsight, isLoading }
}
