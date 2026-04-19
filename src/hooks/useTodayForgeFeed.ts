'use client'

/**
 * Supabase-Realtime-subscribed Forge event feed for Today V3.
 *
 * Phase 1 PR #1 ships the hook wired but NOT MOUNTED on `/today`. PR #1.5
 * rebuild mounts it; until then the existing Today page renders unchanged.
 *
 * Behaviour:
 *   - Initial hydration via GET /api/today-feed.
 *   - Subscribes to `event_log` row INSERT / UPDATE via Supabase Realtime,
 *     filtered to `foundry_id=eq.<activeFoundryId>` and `section=eq.forge`.
 *     RLS still gates visibility on the server side even with Realtime.
 *   - UPDATE with a non-null `resolved_at` evicts the row from local state.
 *
 * When Forge routes in PR #2+ write `event_log` events, signals land here
 * without a reload. Until then the returned `signals` is empty.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  compareTodaySignals,
  toTodaySignal,
  type TodaySignal,
} from '@/types/today'
import type { Database } from '@/types/database.types'

type EventLogRow = Database['public']['Tables']['event_log']['Row']

interface UseTodayForgeFeedOptions {
  /** The active foundry to scope the subscription to. If null, no subscription runs. */
  foundryId: string | null
}

interface UseTodayForgeFeedResult {
  signals: TodaySignal[]
  isLoading: boolean
  refresh: () => void
}

export function useTodayForgeFeed({ foundryId }: UseTodayForgeFeedOptions): UseTodayForgeFeedResult {
  const [signals, setSignals] = useState<TodaySignal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const mountedRef = useRef(true)

  const hydrate = useCallback(async () => {
    try {
      const res = await fetch('/api/today-feed', { credentials: 'include' })
      if (!res.ok) return
      const body = (await res.json()) as { signals?: TodaySignal[] }
      if (!mountedRef.current) return
      setSignals(body.signals ?? [])
    } catch {
      // Non-critical — keep whatever we have from the last successful fetch.
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    hydrate()
    return () => { mountedRef.current = false }
  }, [hydrate])

  useEffect(() => {
    if (!foundryId) return

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return

    const supabase = createBrowserClient<Database>(url, key)
    const channel = supabase
      .channel(`event_log_forge_${foundryId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_log', filter: `foundry_id=eq.${foundryId}` },
        (payload) => {
          const row = payload.new as EventLogRow
          if (row.section !== 'forge' || row.resolved_at) return
          if (!mountedRef.current) return
          setSignals((prev) => [toTodaySignal(row), ...prev.filter((s) => s.id !== row.id)].sort(compareTodaySignals))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'event_log', filter: `foundry_id=eq.${foundryId}` },
        (payload) => {
          const row = payload.new as EventLogRow
          if (row.section !== 'forge') return
          if (!mountedRef.current) return
          setSignals((prev) => {
            const withoutRow = prev.filter((s) => s.id !== row.id)
            if (row.resolved_at) return withoutRow
            return [toTodaySignal(row), ...withoutRow].sort(compareTodaySignals)
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [foundryId])

  return { signals, isLoading, refresh: hydrate }
}
