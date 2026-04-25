/**
 * @file use-page-insights.ts — Shared hook for specialist page insights
 *
 * @description Dual-stream specialist insights: fires the fast tier (Gemini
 * 3.1 Flash Lite, ~1-2s) and the deep tier (Sonnet, ~5-8s) in parallel.
 * Shows the fast result immediately, then silently upgrades to the deep
 * tier's sharper analysis when it resolves.
 *
 * Caching: Insights are cached in localStorage with a 6-hour TTL. While the
 * cache is fresh both LLM calls are skipped entirely — no spend on every
 * page load. Stale or missing cache fires the dual-stream as before.
 *
 * COST CUT 2026-04-24: TTL bumped from 1h → 6h, AND fresh-cache hits no
 * longer kick off a background deep-tier refresh. Combined with the fast-tier
 * Gemini swap this is the bulk of the £500/mo Anthropic saving.
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

// COST CUT 2026-04-24: 1h → 6h TTL. Specialist insights are derived from
// page-level aggregates (counts, status mixes) that move on the order of
// hours, not minutes — six hours of staleness is invisible to the user but
// cuts Anthropic spend on the deep tier by ~6x for repeat visits.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

// SSR guard — localStorage is only available client-side. Without this the
// hook crashes during the initial useState lazy initializer on Next.js.
const isBrowser = typeof window !== 'undefined'

interface CachedInsights {
  insights: AgentInsight[]
  ts: number
}

function buildStorageKey(cacheKey: string): string {
  // INTENT: pi:v1: prefix lets us bump the schema version (pi:v2:...) and
  // invalidate every cached entry across the app at once. Migrated from the
  // previous `page-insights:` prefix on 2026-04-24 — old entries simply
  // remain orphaned in localStorage and age out of their 1h TTL.
  return `pi:v1:${cacheKey}`
}

function getCached(cacheKey: string): AgentInsight[] | null {
  if (!isBrowser) return null
  try {
    const raw = localStorage.getItem(buildStorageKey(cacheKey))
    if (!raw) return null
    const parsed: CachedInsights = JSON.parse(raw)
    if (!parsed?.ts || Date.now() - parsed.ts > CACHE_TTL_MS) {
      localStorage.removeItem(buildStorageKey(cacheKey))
      return null
    }
    return parsed.insights
  } catch {
    return null
  }
}

function setCache(cacheKey: string, insights: AgentInsight[]): void {
  if (!isBrowser) return
  try {
    const data: CachedInsights = { insights, ts: Date.now() }
    localStorage.setItem(buildStorageKey(cacheKey), JSON.stringify(data))
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

function clearCache(cacheKey: string): void {
  if (!isBrowser) return
  try {
    localStorage.removeItem(buildStorageKey(cacheKey))
  } catch {
    // Non-critical
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
  /** True when no insights are available yet (no cache, fast tier hasn't returned) */
  isLoading: boolean
  /**
   * Bypass-cache refresh — clears the localStorage entry and re-fires the
   * dual-stream (fast + deep). Wire this into a manual refresh control.
   * Safe to call when no cacheKey is set (no-op for cache, still re-fetches).
   */
  refresh: () => void
}

/**
 * Dual-stream specialist insights hook.
 *
 * Fires the fetch function twice in parallel — once with `fast: true` (Gemini
 * 3.1 Flash Lite) and once without (Sonnet). Shows the fast result
 * immediately, then upgrades to Sonnet when it resolves. Caches the Sonnet
 * result for future visits at a 6-hour TTL.
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
      const cached = getCached(cacheKey)
      if (cached) return { insights: cached, hadCache: true }
    }
    return { insights: [] as AgentInsight[], hadCache: false }
  })

  const [insights, setInsights] = useState<AgentInsight[]>(initialState.insights)
  const [isLoading, setIsLoading] = useState(enabled && !initialState.hadCache)
  const fetched = useRef(false)
  // INTENT: Track whether the deep tier has already resolved — if so, don't
  // let a late-arriving fast-tier response downgrade the quality.
  const deepResolved = useRef(false)

  // INTENT: Shared fetch path — used by both the initial useEffect and the
  // manual refresh handler. Fires fast + deep in parallel. The fast result
  // shows immediately; the deep result upgrades it and writes to cache.
  const runDualStream = useCallback(() => {
    deepResolved.current = false
    setIsLoading(true)

    const fastPromise = fetchFn(true)
      .then((result) => {
        if (deepResolved.current) return // deep already won the race
        // GOTCHA: withAuth/withAIGate may return { error: string } — skip gracefully
        if (result && typeof result === 'object' && !Array.isArray(result) && 'error' in result) return
        if (Array.isArray(result) && result.length > 0) {
          setInsights(result)
          setIsLoading(false)
        }
      })
      .catch(() => { /* Non-critical */ })

    const deepPromise = fetchFn(false)
      .then((result) => {
        deepResolved.current = true
        // GOTCHA: withAuth/withAIGate may return { error: string } — skip gracefully
        if (result && typeof result === 'object' && !Array.isArray(result) && 'error' in result) return
        if (Array.isArray(result) && result.length > 0) {
          setInsights(result)
          if (cacheKey) setCache(cacheKey, result)
        }
      })
      .catch(() => { /* Non-critical */ })

    Promise.allSettled([fastPromise, deepPromise]).then(() => setIsLoading(false))
  }, [fetchFn, cacheKey])

  useEffect(() => {
    if (!enabled) return
    if (fetched.current) return
    fetched.current = true

    // COST CUT 2026-04-24: When the cache is fresh (within the 6h TTL) skip
    // BOTH tiers entirely — no fast-tier ping, no background deep-tier
    // refresh. The previous behaviour fired Sonnet on every page load even
    // with a cache hit, which was the dominant Haiku/Sonnet spend pattern.
    if (initialState.hadCache) return

    runDualStream()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismissInsight = useCallback((id: string) => {
    setInsights((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const refresh = useCallback(() => {
    if (!enabled) return
    if (cacheKey) clearCache(cacheKey)
    runDualStream()
  }, [enabled, cacheKey, runDualStream])

  return { insights, dismissInsight, isLoading, refresh }
}
