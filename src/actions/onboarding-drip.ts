/**
 * @file onboarding-drip.ts — Onboarding email drip sequence scheduler
 *
 * @description Schedules and sends onboarding emails at Day 1, 3, 7, and 14
 * after user signup to drive activation and conversion.
 *
 * INTENT: PLG best practice — reduce time-to-value through guided onboarding.
 * Each email has a single clear CTA driving the user to a high-value action.
 *
 * FLOW: signup → scheduleOnboardingDrip() → cron job or edge function
 *       picks up scheduled emails → sendOnboardingEmail() → user inbox
 *
 * @related
 * - src/lib/notifications/channels/email.ts - Email templates
 * - src/lib/notifications/types.ts - EmailTemplate type
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/notifications/channels/email'
import type { EmailTemplate } from '@/lib/notifications/types'

/**
 * Onboarding drip schedule configuration.
 * Each step defines when to send and which template to use.
 */
const ONBOARDING_DRIP_STEPS: Array<{
  dayOffset: number
  template: EmailTemplate
  description: string
}> = [
  {
    dayOffset: 0,
    template: 'onboarding_day1_welcome',
    description: 'Welcome email with quick-win CTA (talk to specialist)',
  },
  {
    dayOffset: 3,
    template: 'onboarding_day3_dfm',
    description: 'DFM analysis prompt — second activation touchpoint',
  },
  {
    dayOffset: 7,
    template: 'onboarding_day7_assessment',
    description: 'Full engineering package showcase — value demonstration',
  },
  {
    dayOffset: 14,
    template: 'onboarding_day14_upgrade',
    description: 'Trial ending — upgrade prompt with incentive',
  },
]

/**
 * Schedule the onboarding drip sequence for a new user.
 * Called after account creation/approval.
 *
 * @param userId - The user's ID
 * @param email - The user's email address
 * @param firstName - The user's first name for personalization
 */
export async function scheduleOnboardingDrip(
  userId: string,
  email: string,
  firstName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const now = new Date()

    // Insert scheduled emails for each drip step
    const scheduledEmails = ONBOARDING_DRIP_STEPS.map((step) => {
      const sendAt = new Date(now)
      sendAt.setDate(sendAt.getDate() + step.dayOffset)
      // Send at 9am UTC for Day 1 (immediate for welcome), 9am for others
      if (step.dayOffset > 0) {
        sendAt.setHours(9, 0, 0, 0)
      }

      return {
        user_id: userId,
        email,
        template: step.template,
        template_data: {
          firstName: firstName || '',
          actionUrl: step.template === 'onboarding_day14_upgrade'
            ? 'https://fractionalforge.app/settings/billing'
            : 'https://fractionalforge.app/the-forge',
        },
        scheduled_for: sendAt.toISOString(),
        status: step.dayOffset === 0 ? 'pending' : 'scheduled',
        description: step.description,
      }
    })

    // DECISION: Using a simple scheduled_emails table pattern.
    // For now, store in a JSON field on the profile or a dedicated table.
    // A cron job (Vercel cron or Supabase pg_cron) processes pending emails.
    const { error } = await supabase
      .from('scheduled_emails')
      .insert(scheduledEmails)

    if (error) {
      // GOTCHA: Table may not exist yet — this is expected before migration runs.
      // Fall back to sending the welcome email immediately.
      console.debug('[OnboardingDrip] scheduled_emails table not ready, sending welcome directly:', error.message)

      // Send Day 1 welcome email immediately as fallback
      await sendEmail({
        to: email,
        subject: 'Welcome to ForgeOS',
        body: '',
        template: 'onboarding_day1_welcome',
        templateData: {
          firstName: firstName || '',
          actionUrl: 'https://fractionalforge.app/the-forge',
        },
      })

      return { success: true }
    }

    // Send Day 1 welcome email immediately
    const welcomeStep = ONBOARDING_DRIP_STEPS[0]
    await sendEmail({
      to: email,
      subject: 'Welcome to ForgeOS',
      body: '',
      template: welcomeStep.template,
      templateData: {
        firstName: firstName || '',
        actionUrl: 'https://fractionalforge.app/the-forge',
      },
    })

    return { success: true }
  } catch (error) {
    console.error('[OnboardingDrip] Failed to schedule drip:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Process pending scheduled emails.
 * Called by a cron job (e.g., Vercel Cron or Supabase pg_cron) every hour.
 *
 * @returns Number of emails sent
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

    // Fetch emails that are due
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
          templateData: email.template_data || {},
        })

        // Mark as sent
        await supabase
          .from('scheduled_emails')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', email.id)

        sent++
      } catch (err) {
        console.error(`[OnboardingDrip] Failed to send email ${email.id}:`, err)

        // Mark as failed
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
    console.error('[OnboardingDrip] Failed to process scheduled emails:', error)
  }

  return { sent, errors }
}

/**
 * Cancel remaining onboarding emails for a user.
 * Called when user upgrades to paid (no need for upgrade prompt).
 *
 * @param userId - The user whose remaining drip emails should be cancelled
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
    console.error('[OnboardingDrip] Failed to cancel drip:', error)
  }
}
