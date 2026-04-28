'use client'

/**
 * Supabase-Realtime Plan event feed for Today V3 (PLAN-SCHEMA §14.5).
 *
 * Mirrors `useTodayForgeFeed` but filters to `section='plan'`. Used by
 * `PlanPanel` in the Today V3 shell.
 *
 * Behaviour:
 *   - Initial hydration via GET /api/today-feed/plan.
 *   - Subscribes to `event_log` INSERT/UPDATE filtered to
 *     `foundry_id=eq.<activeFoundryId>`; the handler further narrows to
 *     `section='plan'` and `resolved_at IS NULL`.
 *   - UPDATE with non-null `resolved_at` evicts the row from local state.
 *   - Dedupes by `row.id` on every merge.
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

interface UseTodayPlanFeedOptions {
  foundryId: string | null
  initialSignals?: TodaySignal[]
}

interface UseTodayPlanFeedResult {
  signals: TodaySignal[]
  isLoading: boolean
  refresh: () => void
}

export function useTodayPlanFeed({
  foundryId,
  initialSignals,
}: UseTodayPlanFeedOptions): UseTodayPlanFeedResult {
  const [signals, setSignals] = useState<TodaySignal[]>(initialSignals ?? [])
  const [isLoading, setIsLoading] = useState(!initialSignals)
  const mountedRef = useRef(true)

  const hydrate = useCallback(async () => {
    try {
      const res = await fetch('/api/today-feed/plan', { credentials: 'include' })
      if (!res.ok) return
      const body = (await res.json()) as { signals?: TodaySignal[] }
      if (!mountedRef.current) return
      setSignals(body.signals ?? [])
    } catch {
      /* keep previous */
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    if (!initialSignals) hydrate()
    else setIsLoading(false)
    return () => { mountedRef.current = false }
  }, [hydrate, initialSignals])

  useEffect(() => {
    if (!foundryId) return
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return

    const supabase = createBrowserClient<Database>(url, key)
    const channel = supabase
      .channel(`event_log_plan_${foundryId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_log', filter: `foundry_id=eq.${foundryId}` },
        (payload) => {
          const row = payload.new as EventLogRow
          if (row.section !== 'plan' || row.resolved_at) return
          if (!mountedRef.current) return
          setSignals((prev) =>
            [toTodaySignal(row), ...prev.filter((s) => s.id !== row.id)].sort(compareTodaySignals),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'event_log', filter: `foundry_id=eq.${foundryId}` },
        (payload) => {
          const row = payload.new as EventLogRow
          if (row.section !== 'plan') return
          if (!mountedRef.current) return
          setSignals((prev) => {
            const without = prev.filter((s) => s.id !== row.id)
            if (row.resolved_at) return without
            return [toTodaySignal(row), ...without].sort(compareTodaySignals)
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
