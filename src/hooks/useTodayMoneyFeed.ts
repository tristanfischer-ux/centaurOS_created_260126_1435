'use client'

/**
 * Supabase-Realtime-subscribed Money event feed for Today V3.
 *
 * Mirrors `useTodayForgeFeed.ts` but scopes to `section='money'`. Today V3
 * merges both into one queue; keeping the hooks separate lets each section
 * own its own filter, channel, and lifecycle.
 *
 * Behaviour:
 *   - Initial hydration via GET /api/today-feed?sections=money.
 *   - Subscribes to `event_log` row INSERT / UPDATE via Supabase Realtime,
 *     filtered to `foundry_id=eq.<activeFoundryId>` and `section=eq.money`.
 *     RLS still gates visibility on the server side even with Realtime.
 *   - UPDATE with a non-null `resolved_at` evicts the row from local state.
 *
 * As Money server actions in Phase 2 write `event_log` rows (12 triggers per
 * MONEY-SCHEMA §2 event_log signal contract), signals land here without a
 * page reload.
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

export type MoneySignal = TodaySignal

interface UseTodayMoneyFeedOptions {
  /** The active foundry to scope the subscription to. If null, no subscription runs. */
  foundryId: string | null
}

interface UseTodayMoneyFeedResult {
  signals: MoneySignal[]
  isLoading: boolean
  refresh: () => void
}

export function useTodayMoneyFeed({
  foundryId,
}: UseTodayMoneyFeedOptions): UseTodayMoneyFeedResult {
  const [signals, setSignals] = useState<MoneySignal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const mountedRef = useRef(true)

  const hydrate = useCallback(async () => {
    try {
      const res = await fetch('/api/today-feed?sections=money', {
        credentials: 'include',
      })
      if (!res.ok) return
      const body = (await res.json()) as { signals?: MoneySignal[] }
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
    return () => {
      mountedRef.current = false
    }
  }, [hydrate])

  useEffect(() => {
    if (!foundryId) return

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return

    const supabase = createBrowserClient<Database>(url, key)
    const channel = supabase
      .channel(`event_log_money_${foundryId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'event_log',
          filter: `foundry_id=eq.${foundryId}`,
        },
        (payload) => {
          const row = payload.new as EventLogRow
          if (row.section !== 'money' || row.resolved_at) return
          if (!mountedRef.current) return
          setSignals((prev) =>
            [toTodaySignal(row), ...prev.filter((s) => s.id !== row.id)].sort(
              compareTodaySignals,
            ),
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'event_log',
          filter: `foundry_id=eq.${foundryId}`,
        },
        (payload) => {
          const row = payload.new as EventLogRow
          if (row.section !== 'money') return
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
