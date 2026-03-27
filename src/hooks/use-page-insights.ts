/**
 * @file use-page-insights.ts — Shared hook for specialist page insights
 *
 * @description Extracts the common pattern of fetching AI specialist insights
 * on page load: state management, StrictMode double-mount guard, async fetch,
 * graceful error handling, and dismiss logic.
 *
 * @related
 * - Server actions: src/actions/specialist-page-insights.ts
 * - Card component: src/components/specialists/specialist-insight-card.tsx
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { AgentInsight } from '@/actions/agent-insights'

/**
 * Fetches specialist insights on mount and provides dismiss logic.
 *
 * @param fetchFn - Async function that calls the relevant server action
 * @param enabled - Whether to fetch (false skips the call, e.g. when data is empty)
 * @returns insights array and a dismissInsight callback
 */
export function usePageInsights(
  fetchFn: () => Promise<AgentInsight[]>,
  enabled: boolean,
): { insights: AgentInsight[]; dismissInsight: (id: string) => void } {
  const [insights, setInsights] = useState<AgentInsight[]>([])
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
