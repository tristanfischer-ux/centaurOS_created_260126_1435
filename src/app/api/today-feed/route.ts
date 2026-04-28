import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  compareTodaySignals,
  toTodaySignal,
  type TodaySignal,
} from '@/types/today'

const VALID_SECTIONS = ['forge', 'products', 'plan', 'money', 'meta'] as const
type ValidSection = (typeof VALID_SECTIONS)[number]

function parseSectionsParam(raw: string | null): ValidSection[] {
  // Default preserves the pre-Phase-2 behaviour: forge-only.
  if (!raw) return ['forge']
  const requested = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ValidSection => (VALID_SECTIONS as readonly string[]).includes(s))
  return requested.length > 0 ? requested : ['forge']
}

/**
 * GET /api/today-feed?sections=forge,money
 *   → { signals: TodaySignal[] }
 *
 * Reads `event_log` filtered to the requested sections + `resolved_at IS NULL`,
 * sorts by decay_rate (immediate → 1d → 3d → 7d → 30d) then consequence_weight
 * DESC then created_at DESC. Foundry scoping is enforced by the
 * `event_log_foundry_select` RLS policy.
 *
 * `sections` query param accepts a comma-separated list of section names
 * (forge / products / plan / money / meta). Unknown values are ignored. Empty
 * or absent param defaults to `forge` so legacy callers that don't pass
 * `sections` see the original Phase-1 behaviour.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ signals: [] as TodaySignal[] })
  }

  const sections = parseSectionsParam(req.nextUrl.searchParams.get('sections'))

  const { data, error } = await supabase
    .from('event_log')
    .select('*')
    .in('section', sections)
    .is('resolved_at', null)
    .limit(200)

  if (error || !data) {
    return NextResponse.json({ signals: [] as TodaySignal[] })
  }

  const signals = data.map(toTodaySignal).sort(compareTodaySignals)
  return NextResponse.json({ signals })
}
