"use client"

/**
 * @file use-company-review.ts — Hook for AI company reviews with localStorage caching.
 *
 * @description Calls reviewMatchedCompanies() server action, caches results in
 * localStorage keyed by project + stage + company IDs hash. Generation counter
 * prevents stale closure updates.
 *
 * @related
 * - Server action: src/actions/company-review.ts
 * - Cache pattern: src/hooks/use-stage-briefing.ts
 */

import { useState, useEffect, useRef } from "react"
import { reviewMatchedCompanies } from "@/actions/company-review"
import type { CompanyReview } from "@/actions/company-review"

interface UseCompanyReviewOptions {
  stage: "source" | "assemble"
  projectId: string | null
  projectSubject: string
  modules: Array<{
    name: string
    process: string
    material: string
    tolerance: string
    batchSize: string
    environment: string
  }>
  companyIds: string[]
  enabled?: boolean
}

interface UseCompanyReviewResult {
  reviews: CompanyReview[]
  summary: string | null
  isLoading: boolean
}

function hashCompanyIds(ids: string[]): string {
  const sorted = [...ids].sort().join(",")
  let hash = 0
  for (let i = 0; i < sorted.length; i++) {
    hash = ((hash << 5) - hash + sorted.charCodeAt(i)) | 0
  }
  return String(Math.abs(hash))
}

function getCacheKey(projectId: string, stage: string, idsHash: string): string {
  return `forge-company-review-${projectId}-${stage}-${idsHash}`
}

// INTENT: Cap localStorage review entries to prevent unbounded growth
const MAX_CACHED_REVIEWS = 30
const CACHE_INDEX_KEY = "forge-company-review-keys"

function trackCacheKey(key: string): void {
  try {
    const raw = localStorage.getItem(CACHE_INDEX_KEY)
    let keys: string[] = []
    if (raw) {
      const parsed = JSON.parse(raw)
      keys = Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : []
    }
    const idx = keys.indexOf(key)
    if (idx !== -1) keys.splice(idx, 1)
    keys.push(key)
    while (keys.length > MAX_CACHED_REVIEWS) {
      const evicted = keys.shift()
      if (evicted) localStorage.removeItem(evicted)
    }
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(keys))
  } catch {
    try { localStorage.removeItem(CACHE_INDEX_KEY) } catch { /* noop */ }
  }
}

export function useCompanyReview(opts: UseCompanyReviewOptions): UseCompanyReviewResult {
  const [reviews, setReviews] = useState<CompanyReview[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const fetchedRef = useRef<string | null>(null)
  // GOTCHA: Generation counter prevents stale closures
  const generationRef = useRef(0)

  const enabled = opts.enabled !== false
  const projectId = opts.projectId
  const idsHash = hashCompanyIds(opts.companyIds)

  useEffect(() => {
    if (!enabled || !projectId || opts.companyIds.length === 0 || !opts.projectSubject) return

    const cacheKey = getCacheKey(projectId, opts.stage, idsHash)

    // Already fetched for this exact set
    if (fetchedRef.current === cacheKey) return

    // Check localStorage cache
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached) as { reviews: CompanyReview[]; summary: string }
        setReviews(parsed.reviews ?? [])
        setSummary(parsed.summary ?? null)
        fetchedRef.current = cacheKey
        return
      }
    } catch {
      // localStorage unavailable — proceed to fetch
    }

    fetchedRef.current = cacheKey
    const generation = ++generationRef.current
    setIsLoading(true)

    reviewMatchedCompanies({
      stage: opts.stage,
      projectSubject: opts.projectSubject,
      modules: opts.modules,
      companyIds: opts.companyIds,
    })
      .then((result) => {
        if (generationRef.current !== generation) return
        setReviews(result.reviews)
        setSummary(result.summary)
        // Cache if we got actual reviews
        if (result.reviews.length > 0) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify(result))
            trackCacheKey(cacheKey)
          } catch {
            // localStorage full — non-fatal
          }
        }
      })
      .catch(() => {
        // Silently fall back to no reviews
      })
      .finally(() => {
        if (generationRef.current === generation) {
          setIsLoading(false)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, projectId, opts.stage, idsHash, opts.projectSubject])

  return { reviews, summary, isLoading }
}
