/**
 * Cron Job: Weekly Fractional Capacity Reset
 *
 * @description Zeroes `fractional_engagements.hours_used_this_week` for every
 * active engagement at the start of each working week. Feeds Plan's capacity
 * indicators ("Sarah: 2/6h used") and the `fractional_engagement` Today signal
 * when the ratio passes 90%. Required by PLAN-SCHEMA §17.3 (resolved default:
 * Monday 00:00 UTC system-wide).
 *
 * Schedule: Every Monday at 00:00 UTC
 *
 * Vercel cron config in vercel.json:
 * path: /api/cron/fractional-capacity-reset
 * schedule: 0 0 * * 1
 *
 * @security Requires CRON_SECRET Bearer token for authorization (same pattern
 * as sibling crons — verifyCronSecret + per-IP rate limit).
 * @audit Reset touches only `fractional_engagements.hours_used_this_week`
 * and `updated_at`. No row deletion, no cross-table writes. Safe under flag OFF
 * because no engagements exist yet pre-Chunk-B.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'
import { verifyCronSecret } from '@/lib/security/cron-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIP(req.headers)
  const ipLimit = await rateLimit('webhook', `cron-fractional-capacity-reset:${ip}`)
  if (!ipLimit.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const authFailure = verifyCronSecret(req)
  if (authFailure) return authFailure

  const supabase = createAdminClient()

  // Only reset active (or on_hold) engagements; ended/pending_accept stay
  // untouched so their historical `hours_used_this_week` is preserved for audit.
  const { data, error } = await supabase
    .from('fractional_engagements')
    .update({ hours_used_this_week: 0 })
    .in('status', ['active', 'on_hold'])
    .select('id')

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    reset_count: data?.length ?? 0,
    ran_at: new Date().toISOString(),
  })
}
