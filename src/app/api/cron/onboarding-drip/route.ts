/**
 * @file Welcome drip cron processor.
 *
 * @description Runs hourly. Fetches scheduled_emails rows that are due and
 * sends them via the email channel. Every send passes a marketing flag so
 * the preference gate runs and the unsubscribe footer is appended.
 *
 * HISTORICAL NAME: the route is still called `onboarding-drip` because the
 * scheduled_emails table and Vercel cron path were named before the drip
 * was rewritten as a feature-education welcome sequence. Renaming the path
 * would require two coordinated deploys to avoid a gap; not worth the risk.
 *
 * @security
 * - CRON_SECRET Bearer token (verifyCronSecret)
 * - Rate-limited to 50 emails per run (Resend send-rate headroom)
 * - Status update prevents double-send
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/notifications/channels/email'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import type { EmailTemplate } from '@/lib/notifications/types'

const MAX_EMAILS_PER_RUN = 50

export async function GET(request: Request): Promise<NextResponse> {
  const authFailure = verifyCronSecret(request)
  if (authFailure) return authFailure

  let sent = 0
  let errors = 0
  const skipped = 0

  try {
    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const { data: pendingEmails, error: fetchError } = await supabase
      .from('scheduled_emails')
      .select('*')
      .in('status', ['pending', 'scheduled'])
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(MAX_EMAILS_PER_RUN)

    if (fetchError) {
      console.error('[WelcomeDrip Cron] Fetch error:', fetchError.message)
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
        const result = await sendEmail({
          to: email.email,
          subject: '',
          body: '',
          template: email.template as EmailTemplate,
          templateData: (email.template_data as Record<string, unknown>) || {},
          // Preference gate + unsubscribe footer. All rows in scheduled_emails
          // are currently welcome_drip; extend the row schema if this changes.
          marketing: { userId: email.user_id, channel: 'welcome_drip' },
        })

        // sendEmail returns success even when it skips (user opted out).
        // Mark the row as sent either way — the audit trail shows the
        // attempt was made and the preference gate was honoured.
        if (result.success) {
          await supabase
            .from('scheduled_emails')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', email.id)
          sent++
        } else {
          await supabase
            .from('scheduled_emails')
            .update({
              status: 'failed',
              error_message: result.error || 'Unknown send failure',
              updated_at: new Date().toISOString(),
            })
            .eq('id', email.id)
          errors++
        }
      } catch (err) {
        console.error(`[WelcomeDrip Cron] Failed to send ${email.id}:`, err)

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

    return NextResponse.json({
      sent,
      errors,
      skipped,
      total: pendingEmails.length,
    })
  } catch (error) {
    console.error('[WelcomeDrip Cron] Unexpected error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      sent,
      errors,
    }, { status: 500 })
  }
}
