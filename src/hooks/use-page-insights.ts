/**
 * @file use-page-insights.ts — Shared hook for specialist page insights
 *
 * @description Dual-stream specialist insights: fires Haiku (fast, ~1-2s) and
 * Sonnet (deep, ~5-8s) in parallel. Shows Haiku result immediately, then
 * silently upgrades to Sonnet's sharper analysis when it resolves.
 *
 * Caching: Sonnet result is cached in localStorage (1-hour TTL). On return
 * visits, cached Sonnet result shows instantly — no loading, no API calls.
 *
 * Empty state: When `enabled` is false and `emptyInsight` is provided, the hook
 * returns that static insight with no API call.
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
  /** True when no insights are available yet (no cache, Haiku hasn't returned) */
  isLoading: boolean
}

/**
 * Dual-stream specialist insights hook.
 *
 * Fires the fetch function twice in parallel — once with `fast: true` (Haiku)
 * and once without (Sonnet). Shows Haiku's result immediately, then upgrades
 * to Sonnet when it resolves. Caches the Sonnet result for future visits.
 *
 * @param fetchFn - Async function that calls a generate*Insights server action.
 *                  Must accept an optional `fast` boolean as second argument.
 * @param enabled - Whether to fetch (false skips the call)
 * @param options - Cache key and/or empty state insight
 */
export function usePageInsights(
  fetchFn: (fast?: boolean) => Promise<AgentInsight[]>,
  enabled: boolean,
  options?: string | UsePageInsightsOptions,
): UsePageInsightsResult {
  const opts = typeof options === 'string' ? { cacheKey: options } : options
  const cacheKey = opts?.cacheKey
  const emptyInsight = opts?.emptyInsight

  // INTENT: Determine initial state — cache hit means no loading, no API calls
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
  const fetched = useRef(false)
  // INTENT: Track whether Sonnet has already resolved — if so, don't let a
  // late-arriving Haiku response downgrade the quality
  const sonnetResolved = useRef(false)

  useEffect(() => {
    if (!enabled) return
    if (fetched.current) return
    fetched.current = true

    // INTENT: When we have a cache hit, skip Haiku entirely — just fire Sonnet
    // in the background to refresh the cache for next time
    if (initialState.hadCache) {
      fetchFn(false)
        .then((result) => {
          // GOTCHA: withAuth/withAIGate may return { error: string } instead of AgentInsight[].
          // Array.isArray guards against the error shape, but log for debugging.
          if (result && 'error' in (result as Record<string, unknown>)) return
          if (Array.isArray(result) && result.length > 0) {
            setInsights(result)
            if (cacheKey) setCache(`page-insights:${cacheKey}`, result)
          }
        })
        .catch(() => { /* Non-critical — cached insights already showing */ })
      return
    }

    // DUAL-STREAM: Fire Haiku (fast) and Sonnet (deep) in parallel
    // Haiku resolves first → show immediately → Sonnet upgrades later
    const fastPromise = fetchFn(true)
      .then((result) => {
        if (sonnetResolved.current) return // Sonnet already won the race
        // GOTCHA: withAuth/withAIGate may return { error: string } — skip gracefully
        if (result && 'error' in (result as Record<string, unknown>)) return
        if (Array.isArray(result) && result.length > 0) {
          setInsights(result)
          setIsLoading(false)
        }
      })
      .catch(() => { /* Non-critical */ })

    const deepPromise = fetchFn(false)
      .then((result) => {
        sonnetResolved.current = true
        // GOTCHA: withAuth/withAIGate may return { error: string } — skip gracefully
        if (result && 'error' in (result as Record<string, unknown>)) return
        if (Array.isArray(result) && result.length > 0) {
          setInsights(result)
          if (cacheKey) setCache(`page-insights:${cacheKey}`, result)
        }
      })
      .catch(() => { /* Non-critical */ })

    // Clear loading after both complete (in case Haiku failed silently)
    Promise.allSettled([fastPromise, deepPromise]).then(() => setIsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismissInsight = useCallback((id: string) => {
    setInsights((prev) => prev.filter((i) => i.id !== id))
  }, [])

  return { insights, dismissInsight, isLoading }
}
