'use client'

/**
 * Client-side feature-flag hook.
 *
 * Fetches from `/api/flags/[key]` once per mount and caches per-key in module
 * scope. Server components should use `getCurrentUserFeatureFlag` instead —
 * no round-trip, same data.
 *
 * Known limitation: if a flag is flipped mid-session, the client won't see
 * the change until the next page load. Acceptable for Phase 1 review — Tristan
 * flips, reloads, sees the new state. If we need live flips later, swap the
 * cache for SWR or a Supabase Realtime subscription on `profiles.feature_flags`.
 */

import { useEffect, useState } from 'react'
import type { FeatureFlagKey } from './keys'

const cache = new Map<FeatureFlagKey, boolean>()
const inflight = new Map<FeatureFlagKey, Promise<boolean>>()

async function fetchFlag(key: FeatureFlagKey): Promise<boolean> {
  if (cache.has(key)) return cache.get(key)!
  const existing = inflight.get(key)
  if (existing) return existing

  const promise = (async () => {
    try {
      const res = await fetch(`/api/flags/${key}`, { credentials: 'include' })
      if (!res.ok) return false
      const body = (await res.json()) as { enabled?: boolean }
      const enabled = body.enabled === true
      cache.set(key, enabled)
      return enabled
    } catch {
      return false
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, promise)
  return promise
}

export function useFeatureFlag(key: FeatureFlagKey): { enabled: boolean; isLoading: boolean } {
  const [enabled, setEnabled] = useState<boolean>(() => cache.get(key) ?? false)
  const [isLoading, setIsLoading] = useState<boolean>(() => !cache.has(key))

  useEffect(() => {
    let cancelled = false
    if (cache.has(key)) {
      setEnabled(cache.get(key)!)
      setIsLoading(false)
      return
    }
    fetchFlag(key).then((result) => {
      if (cancelled) return
      setEnabled(result)
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [key])

  return { enabled, isLoading }
}
