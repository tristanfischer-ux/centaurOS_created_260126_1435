import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { compareTodaySignals, toTodaySignal, type TodaySignal } from '@/types/today'

/**
 * GET /api/today-feed
 *   → { signals: TodaySignal[] }
 *
 * Phase 1 PR #1: reads `event_log` filtered to `section='forge'` +
 * `resolved_at IS NULL`, sorts by decay_rate (immediate → 1d → 3d → 7d → 30d)
 * then consequence_weight DESC then created_at DESC. Foundry scoping is
 * enforced by the `event_log_foundry_select` RLS policy.
 *
 * Returns an empty `signals[]` until Forge routes in PR #2+ start writing
 * events. The response shape is stable — downstream phases (Products/Plan/
 * Money) will extend the section filter, not the envelope.
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
    .eq('section', 'forge')
    .is('resolved_at', null)
    .limit(200)

  if (error || !data) {
    return NextResponse.json({ signals: [] as TodaySignal[] })
  }

  const signals = data.map(toTodaySignal).sort(compareTodaySignals)
  return NextResponse.json({ signals })
}
