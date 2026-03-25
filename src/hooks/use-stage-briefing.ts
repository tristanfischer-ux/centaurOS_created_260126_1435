"use client"

/**
 * @file use-stage-briefing.ts — Hook for fetching stage entry/exit briefings.
 *
 * INTENT: Calls generateStageBriefing on mount (when enabled) and caches
 * the result in localStorage. Cache is invalidated when project state changes
 * (via a hash of the input data).
 *
 * @related
 * - Server action: src/actions/stage-briefings.ts
 * - StageSpecialistCard: src/components/cad/stage-specialist-card.tsx
 */

import { useState, useEffect, useRef } from "react"
import { generateStageBriefing } from "@/actions/stage-briefings"
import type { CadLabStage } from "@/lib/cad-lab/stage-specialist-map"

interface UseStageBriefingOptions {
    stage: CadLabStage
    variant: "entry" | "exit"
    projectId: string | null
    projectSubject: string
    moduleCount: number
    specifiedModuleCount?: number
    reviewSummary?: { pass: number; warn: number; fail: number }
    diagnosticCompletionPct?: number
    supplierMatchCount?: number
    manufacturingOrderCount?: number
    /** Set false to skip fetching (e.g., exit card not shown yet) */
    enabled?: boolean
}

interface UseStageBriefingResult {
    briefing: string | null
    isLoading: boolean
}

function computeDataHash(opts: UseStageBriefingOptions): string {
    const key = [
        opts.stage,
        opts.variant,
        opts.projectSubject.slice(0, 50),
        opts.moduleCount,
        opts.specifiedModuleCount ?? 0,
        opts.diagnosticCompletionPct ?? 0,
        opts.reviewSummary ? `${opts.reviewSummary.pass}-${opts.reviewSummary.warn}-${opts.reviewSummary.fail}` : "none",
        opts.supplierMatchCount ?? 0,
        opts.manufacturingOrderCount ?? 0,
    ].join("|")
    // Simple string hash
    let hash = 0
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0
    }
    return String(Math.abs(hash))
}

function getCacheKey(projectId: string, stage: string, variant: string, dataHash: string): string {
    return `forge-briefing-${projectId}-${stage}-${variant}-${dataHash}`
}

// INTENT: Cap localStorage briefing entries to prevent unbounded growth.
// Old entries are evicted when the cap is exceeded (LRU by insertion order).
const MAX_CACHED_BRIEFINGS = 50
const CACHE_INDEX_KEY = "forge-briefing-keys"

function trackCacheKey(key: string): void {
    try {
        const raw = localStorage.getItem(CACHE_INDEX_KEY)
        const keys: string[] = raw ? JSON.parse(raw) : []
        // Remove if already present (move to end)
        const idx = keys.indexOf(key)
        if (idx !== -1) keys.splice(idx, 1)
        keys.push(key)
        // Evict oldest entries beyond cap
        while (keys.length > MAX_CACHED_BRIEFINGS) {
            const evicted = keys.shift()
            if (evicted) localStorage.removeItem(evicted)
        }
        localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(keys))
    } catch {
        // localStorage unavailable — non-fatal
    }
}

export function useStageBriefing(opts: UseStageBriefingOptions): UseStageBriefingResult {
    const [briefing, setBriefing] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const fetchedRef = useRef<string | null>(null)
    // GOTCHA: Generation counter prevents stale closures — if deps change mid-flight,
    // the old fetch's .then() sees a stale generation and skips setState.
    const generationRef = useRef(0)

    const enabled = opts.enabled !== false
    const projectId = opts.projectId

    useEffect(() => {
        if (!enabled || !projectId || !opts.projectSubject) return

        const dataHash = computeDataHash(opts)
        const cacheKey = getCacheKey(projectId, opts.stage, opts.variant, dataHash)

        // Already fetched for this exact state
        if (fetchedRef.current === cacheKey) return

        // Check localStorage cache
        try {
            const cached = localStorage.getItem(cacheKey)
            if (cached) {
                setBriefing(cached)
                fetchedRef.current = cacheKey
                return
            }
        } catch {
            // localStorage unavailable — proceed to fetch
        }

        fetchedRef.current = cacheKey
        const generation = ++generationRef.current
        setIsLoading(true)

        generateStageBriefing({
            stage: opts.stage,
            variant: opts.variant,
            projectSubject: opts.projectSubject,
            moduleCount: opts.moduleCount,
            specifiedModuleCount: opts.specifiedModuleCount,
            reviewSummary: opts.reviewSummary,
            diagnosticCompletionPct: opts.diagnosticCompletionPct,
            supplierMatchCount: opts.supplierMatchCount,
            manufacturingOrderCount: opts.manufacturingOrderCount,
        }).then(({ briefing: text }) => {
            // GOTCHA: Stale closure guard — only update state if this is still the current generation
            if (generationRef.current !== generation) return
            setBriefing(text)
            try {
                localStorage.setItem(cacheKey, text)
                trackCacheKey(cacheKey)
            } catch {
                // localStorage full — non-fatal
            }
        }).catch(() => {
            // Silently fall back to no briefing
        }).finally(() => {
            if (generationRef.current === generation) {
                setIsLoading(false)
            }
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, projectId, opts.stage, opts.variant, opts.projectSubject, opts.moduleCount, opts.specifiedModuleCount, opts.diagnosticCompletionPct, opts.supplierMatchCount, opts.manufacturingOrderCount, opts.reviewSummary?.pass, opts.reviewSummary?.warn, opts.reviewSummary?.fail])

    return { briefing, isLoading }
}
