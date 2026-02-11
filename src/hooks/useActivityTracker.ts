'use client'

/**
 * @file useActivityTracker.ts
 * 
 * @description Client-side hook that captures user behavior signals and sends
 * them in batches to the server. Tracks page views, time-on-page, and
 * provides utilities for tracking searches and feature usage.
 * 
 * Designed to be lightweight: batches events and flushes every 30s or on unmount.
 * Uses the Page Visibility API to accurately track time-on-page.
 * 
 * @example
 * // In a layout component:
 * function PlatformLayout({ children }) {
 *   useActivityTracker()
 *   return <>{children}</>
 * }
 * 
 * // Track a search from anywhere:
 * import { trackSearch, trackFeatureUse } from '@/hooks/useActivityTracker'
 * trackSearch('accountant near me')
 * trackFeatureUse('command_palette')
 */

import { useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import type { ActivityEvent } from '@/actions/activity-events'

const FLUSH_INTERVAL_MS = 30_000 // 30 seconds
const MAX_BATCH_SIZE = 50

// Module-level buffer so trackSearch/trackFeatureUse can push events
// without needing the hook instance
const eventBuffer: ActivityEvent[] = []
let flushPromise: Promise<void> | null = null

async function flushEvents() {
  if (eventBuffer.length === 0 || flushPromise) return

  const batch = eventBuffer.splice(0, MAX_BATCH_SIZE)

  flushPromise = (async () => {
    try {
      const { trackEvents } = await import('@/actions/activity-events')
      await trackEvents(batch)
    } catch (err) {
      // Silently fail — activity tracking is non-critical
      console.debug('[ActivityTracker] Flush failed:', err)
    } finally {
      flushPromise = null
    }
  })()

  return flushPromise
}

function pushEvent(event: ActivityEvent) {
  eventBuffer.push(event)
  if (eventBuffer.length >= MAX_BATCH_SIZE) {
    flushEvents()
  }
}

/**
 * Track a search query. Can be called from anywhere (e.g. command palette, marketplace search).
 */
export function trackSearch(query: string, source?: string) {
  pushEvent({
    event_type: 'search',
    event_data: { query, source: source || 'unknown' },
  })
}

/**
 * Track usage of a specific feature. Call when a user interacts with a notable feature.
 */
export function trackFeatureUse(feature: string, metadata?: Record<string, unknown>) {
  pushEvent({
    event_type: 'feature_use',
    event_data: { feature, ...metadata },
  })
}

/**
 * Track an advisory question being asked.
 */
export function trackAdvisoryQuestion(category: string, title: string) {
  pushEvent({
    event_type: 'advisory_question',
    event_data: { category, title },
  })
}

/**
 * Main activity tracker hook. Wire into the platform layout once.
 * Automatically tracks page views and time-on-page.
 */
export function useActivityTracker() {
  const pathname = usePathname()
  const pageEnteredAt = useRef<number>(Date.now())
  const lastPathname = useRef<string | null>(null)

  // Record time spent on previous page when navigating away
  const recordTimeSpent = useCallback(() => {
    if (lastPathname.current) {
      const durationSeconds = Math.round(
        (Date.now() - pageEnteredAt.current) / 1000
      )
      // Only record if user spent at least 2 seconds (filter out instant redirects)
      if (durationSeconds >= 2) {
        pushEvent({
          event_type: 'time_spent',
          event_data: {
            page: lastPathname.current,
            duration_seconds: durationSeconds,
          },
        })
      }
    }
  }, [])

  // Track page views on route change
  useEffect(() => {
    if (pathname === lastPathname.current) return

    // Record time on previous page
    recordTimeSpent()

    // Record new page view
    pushEvent({
      event_type: 'page_view',
      event_data: { page: pathname },
    })

    lastPathname.current = pathname
    pageEnteredAt.current = Date.now()
  }, [pathname, recordTimeSpent])

  // Periodic flush
  useEffect(() => {
    const interval = setInterval(flushEvents, FLUSH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  // Flush on page hide (tab switch, close, navigate away)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        recordTimeSpent()
        flushEvents()
      }
    }

    const handleBeforeUnload = () => {
      recordTimeSpent()
      if (eventBuffer.length > 0) {
        flushEvents()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Final flush on unmount
      recordTimeSpent()
      flushEvents()
    }
  }, [recordTimeSpent])
}
