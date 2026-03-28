/**
 * @file use-page-briefing.ts — Shared hook for live specialist page briefings
 *
 * @description Fetches a specialist narrative briefing on page load and provides
 * caching, loading state, and graceful error handling. Used by SpecialistBriefingHero
 * to show live AI-generated narratives instead of static fallback text.
 *
 * Caching: Narrative is cached in localStorage with a 1-hour TTL. Return visits
 * show the cached narrative instantly with no API call.
 *
 * @related
 * - Server action: src/actions/specialist-page-insights.ts (generatePageBriefing)
 * - Hero component: src/components/specialists/specialist-briefing-hero.tsx
 */

import { useState, useEffect, useRef } from 'react'
import type { BriefingSeverity } from '@/components/specialists/specialist-briefing-hero'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CachedBriefing {
  narrative: string
  severity: BriefingSeverity
  timestamp: number
}

function getCached(key: string): CachedBriefing | null {
  try {
    const raw = localStorage.getItem(`page-briefing:${key}`)
    if (!raw) return null
    const parsed: CachedBriefing = JSON.parse(raw)
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(`page-briefing:${key}`)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function setCache(key: string, narrative: string, severity: BriefingSeverity): void {
  try {
    const data: CachedBriefing = { narrative, severity, timestamp: Date.now() }
    localStorage.setItem(`page-briefing:${key}`, JSON.stringify(data))
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

interface UsePageBriefingResult {
  /** AI-generated narrative text, or null if loading/failed */
  narrative: string | null
  /** Health severity for card tinting */
  severity: BriefingSeverity
  /** True while the narrative is being generated */
  isLoading: boolean
}

/**
 * Fetches a specialist briefing narrative on mount.
 *
 * @param fetchFn - Async function that calls generatePageBriefing
 * @param defaultSeverity - Severity to use before/without AI result
 * @param enabled - Whether to fetch (false skips, e.g. when no data)
 * @param cacheKey - localStorage key for caching (e.g. 'finn-cash-burn')
 */
export function usePageBriefing(
  fetchFn: () => Promise<{ narrative: string | null; severity: BriefingSeverity }>,
  defaultSeverity: BriefingSeverity,
  enabled: boolean,
  cacheKey?: string,
): UsePageBriefingResult {
  // Check cache on init
  const [initialCache] = useState(() => {
    if (cacheKey && enabled) return getCached(cacheKey)
    return null
  })

  const [narrative, setNarrative] = useState<string | null>(initialCache?.narrative ?? null)
  const [severity, setSeverity] = useState<BriefingSeverity>(initialCache?.severity ?? defaultSeverity)
  const [isLoading, setIsLoading] = useState(enabled && !initialCache)
  const fetched = useRef(false)

  useEffect(() => {
    if (!enabled) return
    if (fetched.current) return
    fetched.current = true

    fetchFn()
      .then((result) => {
        if (result.narrative) {
          setNarrative(result.narrative)
          setSeverity(result.severity)
          if (cacheKey) {
            setCache(cacheKey, result.narrative, result.severity)
          }
        }
      })
      .catch(() => { /* Non-critical — fallback message shows */ })
      .finally(() => setIsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { narrative, severity, isLoading }
}
