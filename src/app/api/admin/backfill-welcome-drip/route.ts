/**
 * @file /api/admin/backfill-welcome-drip — one-shot admin endpoint to enrol
 * existing users into the welcome drip sequence.
 *
 * @description When the 6-email welcome drip goes live, existing users who
 * signed up before the drip existed have never received it. Tristan approved
 * back-enrolling them on 2026-04-16. This endpoint does the work — idempotent,
 * paginated, and defaults to dry-run so the first call never sends anything.
 *
 * USAGE (from admin machine, via curl):
 *
 *   # Dry-run (safe — tells you how many users WOULD be enrolled):
 *   curl -X POST 'https://fractionalforge.app/api/admin/backfill-welcome-drip' \
 *        -H 'Cookie: <admin session cookie>' \
 *        -H 'Content-Type: application/json' \
 *        -d '{"dryRun": true}'
 *
 *   # Actual run (requires confirm token):
 *   curl -X POST 'https://fractionalforge.app/api/admin/backfill-welcome-drip' \
 *        -H 'Cookie: <admin session cookie>' \
 *        -H 'Content-Type: application/json' \
 *        -d '{"dryRun": false, "confirm": "BACKFILL_WELCOME_DRIP_2026_04_17", "offset": 0}'
 *
 * @security
 * - Admin-only via isAdmin()
 * - Confirm token must match exactly to run
 * - Excludes internal domains (@perigee-labs.com, @fractionalforge.app)
 * - Skips users already enrolled (checks for existing welcome_day0 row)
 * - Skips users who have opted out of welcome_drip channel
 * - Rate-limited to 500 enrolments per call (6 inserts per user = 3,000 rows max)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin } from '@/lib/admin/access'
import { sendEmail } from '@/lib/notifications/channels/email'
import { isEmailAllowed } from '@/lib/email/preferences'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // Vercel Pro cap

const CONFIRM_TOKEN = 'BACKFILL_WELCOME_DRIP_2026_04_17'
const MAX_USERS_PER_CALL = 500
const EXCLUDED_DOMAINS = ['perigee-labs.com', 'fractionalforge.app']

const WELCOME_DRIP_STEPS = [
  { dayOffset: 0, template: 'welcome_day0', description: 'Back-enrol: Welcome letter' },
  { dayOffset: 1, template: 'welcome_day1_investors', description: 'Back-enrol: Day 1 investors' },
  { dayOffset: 2, template: 'welcome_day2_specialists', description: 'Back-enrol: Day 2 specialists' },
  { dayOffset: 3, template: 'welcome_day3_forge', description: 'Back-enrol: Day 3 forge' },
  { dayOffset: 4, template: 'welcome_day4_strategy', description: 'Back-enrol: Day 4 strategy' },
  { dayOffset: 5, template: 'welcome_day5_cashburn', description: 'Back-enrol: Day 5 cash burn' },
] as const

interface BackfillRequest {
  dryRun?: boolean
  confirm?: string
  offset?: number
}

interface BackfillResponse {
  mode: 'dry-run' | 'live'
  processed: number
  enrolled: number
  skippedExisting: number
  skippedOptedOut: number
  skippedExcludedDomain: number
  errors: Array<{ email: string; error: string }>
  nextOffset: number | null
  totalRemaining: number | null
}

export async function POST(request: Request): Promise<Response> {
  // AUTH: admin only
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const hasAccess = await isAdmin(user.id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  let body: BackfillRequest = {}
  try {
    body = await request.json()
  } catch {
    // Empty body = default to dry-run
  }

  const dryRun = body.dryRun !== false // default true
  const offset = Math.max(0, Number(body.offset) || 0)

  // If this is a live run, require the exact confirm token
  if (!dryRun && body.confirm !== CONFIRM_TOKEN) {
    return NextResponse.json(
      {
        error: `Live run requires confirm token. Pass {"confirm": "${CONFIRM_TOKEN}"}.`,
      },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const now = new Date()

  // Fetch a page of candidate profiles. Order by created_at so pagination is stable.
  const { data: profiles, error: profilesError, count } = await admin
    .from('profiles')
    .select('id, email, full_name', { count: 'exact' })
    .not('email', 'is', null)
    .range(offset, offset + MAX_USERS_PER_CALL - 1)
    .order('created_at', { ascending: true })

  if (profilesError) {
    console.error('[backfill-welcome-drip] Failed to fetch profiles', profilesError)
    return NextResponse.json(
      { error: 'Failed to fetch profiles', details: profilesError.message },
      { status: 500 },
    )
  }

  const result: BackfillResponse = {
    mode: dryRun ? 'dry-run' : 'live',
    processed: 0,
    enrolled: 0,
    skippedExisting: 0,
    skippedOptedOut: 0,
    skippedExcludedDomain: 0,
    errors: [],
    nextOffset: null,
    totalRemaining: null,
  }

  if (!profiles || profiles.length === 0) {
    return NextResponse.json(result)
  }

  for (const profile of profiles) {
    result.processed++

    const email = profile.email as string | null
    if (!email) continue

    const domain = email.split('@')[1]?.toLowerCase()
    if (domain && EXCLUDED_DOMAINS.includes(domain)) {
      result.skippedExcludedDomain++
      continue
    }

    // Skip if user already has a welcome_day0 scheduled_emails row
    // (prevents double-enrolment on a second run)
    const { data: existing } = await admin
      .from('scheduled_emails')
      .select('id')
      .eq('user_id', profile.id)
      .eq('template', 'welcome_day0')
      .limit(1)

    if (existing && existing.length > 0) {
      result.skippedExisting++
      continue
    }

    // Skip if user has opted out of the welcome_drip channel
    const allowed = await isEmailAllowed(profile.id, 'welcome_drip')
    if (!allowed) {
      result.skippedOptedOut++
      continue
    }

    if (dryRun) {
      result.enrolled++
      continue
    }

    // LIVE: insert 6 rows
    const firstName =
      (profile.full_name as string | null)?.split(' ')[0] ||
      ''

    const rows = WELCOME_DRIP_STEPS.map((step) => {
      const sendAt = new Date(now)
      sendAt.setDate(sendAt.getDate() + step.dayOffset)
      if (step.dayOffset > 0) {
        sendAt.setUTCHours(8, 0, 0, 0)
      }

      return {
        user_id: profile.id,
        email,
        template: step.template,
        template_data: { firstName },
        scheduled_for: sendAt.toISOString(),
        status: step.dayOffset === 0 ? 'sent' : 'scheduled',
        sent_at: step.dayOffset === 0 ? now.toISOString() : null,
        description: step.description,
      }
    })

    const { error: insertError } = await admin
      .from('scheduled_emails')
      .insert(rows)

    if (insertError) {
      result.errors.push({
        email,
        error: insertError.message,
      })
      continue
    }

    // Send Day 0 immediately
    try {
      await sendEmail({
        to: email,
        subject: 'Welcome to ForgeOS',
        body: '',
        template: 'welcome_day0',
        templateData: { firstName },
        marketing: { userId: profile.id, channel: 'welcome_drip' },
      })
      result.enrolled++
    } catch (err) {
      result.errors.push({
        email,
        error: err instanceof Error ? err.message : 'Unknown error sending Day 0',
      })
      // Day 0 row was already marked 'sent' in the insert — mark it failed
      await admin
        .from('scheduled_emails')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'Unknown error',
        })
        .eq('user_id', profile.id)
        .eq('template', 'welcome_day0')
    }
  }

  // Pagination hint
  const total = count ?? null
  if (total !== null) {
    const consumed = offset + profiles.length
    if (consumed < total) {
      result.nextOffset = consumed
      result.totalRemaining = total - consumed
    }
  }

  return NextResponse.json(result)
}
