'use client'

/**
 * @file use-weekly-time.ts — Shared hook for weekly time progress data.
 *
 * @description Deduplicates the getWeeklyTimeProgress() server action call
 * when multiple components mount simultaneously (e.g., sidebar bar + today
 * dashboard card). Uses a module-level promise cache so the second caller
 * piggybacks on the first request instead of firing a duplicate.
 */

import { useState, useEffect, useCallback } from 'react'
import { getWeeklyTimeProgress } from '@/actions/time-tracking'

export interface WeeklyTimeData {
  totalMinutes: number
  billableMinutes: number
  todayMinutes: number
  targetMinutes: number
}

// Module-level dedup: one in-flight promise shared across all callers
let cached: Promise<WeeklyTimeData | null> | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 30_000 // 30s — stale after half a minute

// Listeners to notify when cache is invalidated
const listeners = new Set<() => void>()

function fetchOnce(): Promise<WeeklyTimeData | null> {
  const now = Date.now()
  if (cached && now - cacheTimestamp < CACHE_TTL_MS) return cached

  cacheTimestamp = now
  cached = getWeeklyTimeProgress()
    .then((result) => {
      if ('error' in result) return null
      return result as WeeklyTimeData
    })
    .catch((err) => {
      console.warn('[TIME] Weekly time fetch failed:', err)
      return null
    })

  return cached
}

/**
 * Invalidate the weekly time cache and notify all mounted hooks to re-fetch.
 * Call this after stopping a timer or logging a new entry.
 */
export function invalidateWeeklyTimeCache() {
  cached = null
  cacheTimestamp = 0
  listeners.forEach((fn) => fn())
}

/**
 * useWeeklyTime — Returns weekly time data, deduplicated across components.
 *
 * Multiple components calling this hook in the same render cycle share
 * a single server action call. Data is cached for 30 seconds.
 */
export function useWeeklyTime(): WeeklyTimeData | null {
  const [data, setData] = useState<WeeklyTimeData | null>(null)

  const refresh = useCallback(() => {
    let cancelled = false
    fetchOnce().then((result) => {
      if (!cancelled) setData(result)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const cleanup = refresh()
    listeners.add(refresh)
    return () => { cleanup(); listeners.delete(refresh) }
  }, [refresh])

  return data
}
