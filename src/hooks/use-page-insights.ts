/**
 * @file use-page-insights.ts — Shared hook for specialist page insights
 *
 * @description Extracts the common pattern of fetching AI specialist insights
 * on page load: state management, StrictMode double-mount guard, async fetch,
 * graceful error handling, localStorage caching, empty-state coaching, and
 * dismiss logic.
 *
 * Caching: On successful fetch, insights are cached in localStorage keyed by
 * `cacheKey`. On next visit, cached insights are shown instantly while a fresh
 * fetch happens in the background. Cache expires after 1 hour.
 *
 * Empty state: When `enabled` is false and `emptyInsight` is provided, the hook
 * returns that static insight so the specialist can coach the user on what to
 * enter first — no API call needed.
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

/**
 * Fetches specialist insights on mount and provides dismiss logic.
 *
 * @param fetchFn - Async function that calls the relevant server action
 * @param enabled - Whether to fetch (false skips the call, e.g. when data is empty)
 * @param options - Cache key and/or empty state insight
 * @returns insights array and a dismissInsight callback
 */
export function usePageInsights(
  fetchFn: () => Promise<AgentInsight[]>,
  enabled: boolean,
  options?: string | UsePageInsightsOptions,
): { insights: AgentInsight[]; dismissInsight: (id: string) => void } {
  // INTENT: Support both string (cacheKey only) and options object for backwards compat
  const opts = typeof options === 'string' ? { cacheKey: options } : options
  const cacheKey = opts?.cacheKey
  const emptyInsight = opts?.emptyInsight

  const [insights, setInsights] = useState<AgentInsight[]>(() => {
    // When data is empty and we have a coaching insight, show it immediately
    if (!enabled && emptyInsight) return [emptyInsight]
    // Show cached insights instantly on mount to avoid blank state
    if (cacheKey && enabled) {
      return getCached(`page-insights:${cacheKey}`) ?? []
    }
    return []
  })
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismissInsight = useCallback((id: string) => {
    setInsights((prev) => prev.filter((i) => i.id !== id))
  }, [])

  return { insights, dismissInsight }
}
