/**
 * @file Onboarding Drip Processor — Cron job that sends scheduled onboarding emails.
 *
 * @description Runs hourly via Vercel cron. Finds scheduled_emails that are due
 * and sends them. Handles Day 1 (welcome), Day 3 (DFM prompt), Day 7 (assessment),
 * and Day 14 (upgrade prompt) onboarding touchpoints.
 *
 * INTENT: Drive new user activation through timed, value-focused email nudges.
 * Each email has one clear CTA leading to a high-value platform action.
 *
 * @security
 * - CRON_SECRET verification prevents unauthorized invocations
 * - Rate-limited to 50 emails per cron run to stay within Resend limits
 * - Updates status to prevent double-sends
 *
 * @related
 * - src/actions/onboarding-drip.ts — Scheduling logic
 * - src/lib/notifications/channels/email.ts — Email templates
 * - vercel.json — Cron schedule definition
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/notifications/channels/email'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import type { EmailTemplate } from '@/lib/notifications/types'

const MAX_EMAILS_PER_RUN = 50

export async function GET(request: Request): Promise<NextResponse> {
  // SECURITY: Verify cron secret using shared timing-safe utility
  const authFailure = verifyCronSecret(request)
  if (authFailure) return authFailure

  let sent = 0
  let errors = 0

  try {
    const supabase = createAdminClient()
    const now = new Date().toISOString()

    // Fetch emails that are due to be sent
    const { data: pendingEmails, error: fetchError } = await supabase
      .from('scheduled_emails')
      .select('*')
      .in('status', ['pending', 'scheduled'])
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(MAX_EMAILS_PER_RUN)

    if (fetchError) {
      console.error('[OnboardingDrip Cron] Fetch error:', fetchError.message)
      return NextResponse.json({
        error: 'Failed to fetch scheduled emails',
        details: fetchError.message,
      }, { status: 500 })
    }

    if (!pendingEmails?.length) {
      return NextResponse.json({ sent: 0, errors: 0, message: 'No emails due' })
    }

    for (const email of pendingEmails) {
      try {
        await sendEmail({
          to: email.email,
          subject: '',
          body: '',
          template: email.template as EmailTemplate,
          templateData: (email.template_data as Record<string, unknown>) || {},
        })

        // Mark as sent
        await supabase
          .from('scheduled_emails')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.id)

        sent++
      } catch (err) {
        console.error(`[OnboardingDrip Cron] Failed to send ${email.id}:`, err)

        await supabase
          .from('scheduled_emails')
          .update({
            status: 'failed',
            error_message: err instanceof Error ? err.message : 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.id)

        errors++
      }
    }

    return NextResponse.json({ sent, errors, total: pendingEmails.length })
  } catch (error) {
    console.error('[OnboardingDrip Cron] Unexpected error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      sent,
      errors,
    }, { status: 500 })
  }
}
