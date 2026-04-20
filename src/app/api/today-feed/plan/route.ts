import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { compareTodaySignals, toTodaySignal, type TodaySignal } from '@/types/today'

/**
 * GET /api/today-feed/plan
 *   → { signals: TodaySignal[] }
 *
 * Plan-scoped variant of `/api/today-feed` for Today V3's Plan panel
 * (PLAN-SCHEMA §14.5). Filters `event_log` to `section='plan'` +
 * `resolved_at IS NULL`. Foundry scoping enforced by the
 * `event_log_foundry_select` RLS policy.
 */
export async function GET(): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ signals: [] as TodaySignal[] })
  }

  const { data, error } = await supabase
    .from('event_log')
    .select('*')
    .eq('section', 'plan')
    .is('resolved_at', null)
    .limit(200)

  if (error || !data) {
    return NextResponse.json({ signals: [] as TodaySignal[] })
  }

  const signals = data.map(toTodaySignal).sort(compareTodaySignals)
  return NextResponse.json({ signals })
}
