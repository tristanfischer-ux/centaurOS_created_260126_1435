/**
 * @file onboarding-drip.ts — Welcome drip scheduler.
 *
 * @description Schedules and sends the six-email welcome drip for new signups.
 * Day 0 (immediate) and Days 1-5 at 08:00 UTC (09:00 BST / 08:00 GMT UK time).
 *
 * SUPERSEDES: the legacy Day 1 / 3 / 7 / 14 activation drip. Those template
 * names are still in the EmailTemplate union for historical rows but no
 * new rows reference them — see migration 20260417020000 which cancels
 * any pending legacy rows.
 *
 * INTENT: feature education in Tristan's Apr 16 letter voice. One short
 * email per day covering the main sections: investors, specialists, the
 * forge, strategy, cash burn.
 *
 * FLOW: signup → scheduleOnboardingDrip() → 6 rows inserted into
 *       scheduled_emails → hourly cron picks up each as it becomes due →
 *       sendEmail with marketing: { userId, channel: 'welcome_drip' } →
 *       preferences checked, unsubscribe footer appended, sent via Resend.
 *
 * @related
 * - src/lib/notifications/channels/email.ts — Email templates (welcome_*)
 * - src/lib/email/preferences.ts — Preference gate
 * - src/lib/email/footer.ts — Unsubscribe footer
 * - src/app/api/cron/onboarding-drip/route.ts — Hourly processor
 * - ENGAGEMENT-PLAN.md — Approved copy for each email body
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/notifications/channels/email'
import type { EmailTemplate } from '@/lib/notifications/types'

/**
 * Welcome drip schedule configuration.
 *
 * Day 0 is sent immediately on signup; Days 1-5 are sent at 08:00 UTC on
 * successive days (which is 09:00 in UK Summer Time, 08:00 in UK Winter Time).
 */
const WELCOME_DRIP_STEPS: Array<{
  dayOffset: number
  template: EmailTemplate
  description: string
}> = [
  {
    dayOffset: 0,
    template: 'welcome_day0',
    description: 'Welcome — letter note introducing the 5-day series',
  },
  {
    dayOffset: 1,
    template: 'welcome_day1_investors',
    description: 'Day 1 — investor matching across 7,800 investors',
  },
  {
    dayOffset: 2,
    template: 'welcome_day2_specialists',
    description: 'Day 2 — 13 AI specialists + fractional executives marketplace',
  },
  {
    dayOffset: 3,
    template: 'welcome_day3_forge',
    description: 'Day 3 — The Forge: product description into build plan',
  },
  {
    dayOffset: 4,
    template: 'welcome_day4_strategy',
    description: 'Day 4 — Strategy: business plan to a week of work',
  },
  {
    dayOffset: 5,
    template: 'welcome_day5_cashburn',
    description: 'Day 5 — Cash burn: runway and speed-versus-cost tradeoff',
  },
]

/**
 * Schedule the welcome drip sequence for a new user.
 * Called after account creation/approval.
 *
 * @param userId - The user's auth.users id
 * @param email - The user's email address
 * @param firstName - The user's first name for personalisation
 */
export async function scheduleOnboardingDrip(
  userId: string,
  email: string,
  firstName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const now = new Date()

    // Build scheduled rows. Day 0 is sent directly below and stored as 'sent';
    // Days 1-5 are stored as 'scheduled' for the cron to pick up.
    const scheduledEmails = WELCOME_DRIP_STEPS.map((step) => {
      const sendAt = new Date(now)
      sendAt.setDate(sendAt.getDate() + step.dayOffset)

      // For Days 1-5, pin to 08:00 UTC (09:00 UK BST, 08:00 UK GMT).
      // Day 0 is "now" — don't adjust the clock.
      if (step.dayOffset > 0) {
        sendAt.setUTCHours(8, 0, 0, 0)
      }

      return {
        user_id: userId,
        email,
        template: step.template,
        template_data: {
          firstName: firstName || '',
        },
        scheduled_for: sendAt.toISOString(),
        status: step.dayOffset === 0 ? 'sent' : 'scheduled',
        sent_at: step.dayOffset === 0 ? now.toISOString() : null,
        description: step.description,
      }
    })

    const { error } = await supabase
      .from('scheduled_emails')
      .insert(scheduledEmails)

    if (error) {
      // GOTCHA: fall-through if table or schema has issues. Send Day 0 directly
      // so the user at least receives a welcome; surface the error upstream so
      // we do not silently lose the scheduled days.
      console.error('[WelcomeDrip] Failed to insert scheduled rows, sending Day 0 directly:', {
        userId,
        error: error.message,
      })

      await sendEmail({
        to: email,
        subject: 'Welcome to ForgeOS',
        body: '',
        template: 'welcome_day0',
        templateData: { firstName: firstName || '' },
        marketing: { userId, channel: 'welcome_drip' },
      })

      return { success: false, error: error.message }
    }

    // Send Day 0 welcome immediately (the cron only picks up status='scheduled')
    await sendEmail({
      to: email,
      subject: 'Welcome to ForgeOS',
      body: '',
      template: 'welcome_day0',
      templateData: { firstName: firstName || '' },
      marketing: { userId, channel: 'welcome_drip' },
    })

    return { success: true }
  } catch (error) {
    console.error('[WelcomeDrip] Failed to schedule drip:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Process pending scheduled emails (invoked by the cron route).
 *
 * @returns Number of emails sent and errors encountered
 */
export async function processScheduledEmails(): Promise<{
  sent: number
  errors: number
}> {
  let sent = 0
  let errors = 0

  try {
    const supabase = await createClient()
    const now = new Date().toISOString()

    const { data: pendingEmails, error } = await supabase
      .from('scheduled_emails')
      .select('*')
      .in('status', ['pending', 'scheduled'])
      .lte('scheduled_for', now)
      .limit(50)

    if (error || !pendingEmails?.length) {
      return { sent: 0, errors: 0 }
    }

    for (const email of pendingEmails) {
      try {
        await sendEmail({
          to: email.email,
          subject: '',
          body: '',
          template: email.template as EmailTemplate,
          templateData: (email.template_data as Record<string, unknown>) || {},
          // All rows written by scheduleOnboardingDrip are welcome_drip channel.
          // If future drips use this table for other channels, extend the row
          // schema with a channel column and read it here.
          marketing: { userId: email.user_id, channel: 'welcome_drip' },
        })

        await supabase
          .from('scheduled_emails')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', email.id)

        sent++
      } catch (err) {
        console.error(`[WelcomeDrip] Failed to send email ${email.id}:`, err)

        await supabase
          .from('scheduled_emails')
          .update({
            status: 'failed',
            error_message: err instanceof Error ? err.message : 'Unknown error',
          })
          .eq('id', email.id)

        errors++
      }
    }
  } catch (error) {
    console.error('[WelcomeDrip] Failed to process scheduled emails:', error)
  }

  return { sent, errors }
}

/**
 * Cancel remaining welcome drip emails for a user.
 * Called when user unsubscribes via the preferences page (optional — the
 * cron also checks preferences at send time, so this is belt-and-braces).
 */
export async function cancelOnboardingDrip(
  userId: string
): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('scheduled_emails')
      .update({ status: 'cancelled' })
      .eq('user_id', userId)
      .in('status', ['pending', 'scheduled'])
  } catch (error) {
    console.error('[WelcomeDrip] Failed to cancel drip:', error)
  }
}
