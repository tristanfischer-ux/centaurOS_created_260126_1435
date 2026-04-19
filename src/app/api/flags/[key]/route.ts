import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFeatureFlag } from '@/lib/features/flags'
import { isFeatureFlagKey } from '@/lib/features/keys'

/**
 * GET /api/flags/[key] → { enabled: boolean }
 *
 * Returns `{ enabled: false }` for: unknown key, no authenticated user, or
 * any lookup error. Never 500s on the happy path.
 *
 * Used by the `useFeatureFlag` client hook. Server components should use
 * `getCurrentUserFeatureFlag` directly — no round-trip.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await ctx.params

  if (!isFeatureFlagKey(key)) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ enabled: false })
  }

  const enabled = await getFeatureFlag(supabase, user.id, key)
  return NextResponse.json({ enabled })
}
