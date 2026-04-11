'use client'

import { useEffect, useRef } from 'react'

/**
 * Fire-and-forget background fetch to pre-warm the investor match cache.
 * Runs once per session (tracked via sessionStorage).
 * The match endpoint handles its own caching — if results are fresh, it returns
 * immediately. If not, it generates new matches in the background.
 */
export function InvestorMatchPrewarmer() {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    // Only warm once per browser session
    const key = 'investor-match-prewarmed'
    if (typeof window !== 'undefined' && sessionStorage.getItem(key)) return

    // Fire and forget — don't await, don't handle errors
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 min max

    fetch('/api/investors/match', { signal: controller.signal })
      .then(res => {
        if (res.ok) {
          sessionStorage.setItem(key, '1')
        }
      })
      .catch(() => {
        // Silently ignore — this is a background optimization
      })
      .finally(() => clearTimeout(timeoutId))

    return () => {
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [])

  return null // Renders nothing
}
