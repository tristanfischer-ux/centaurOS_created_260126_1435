/**
 * @file preferences.ts — Per-user email preference helpers.
 *
 * @description UK PECR + GDPR compliance. Every marketing email must check
 * `isEmailAllowed()` before sending. Transactional emails (password reset,
 * order status) bypass these checks.
 *
 * @security Uses admin client for reads — preferences must be consulted
 * even when the send context has no user session (cron jobs, webhooks).
 */

import { createAdminClient } from '@/lib/supabase/admin'

/** Channel identifiers. Must match column names in email_preferences table. */
export type EmailChannel =
  | 'product_announcements'
  | 'welcome_drip'
  | 'dormancy_nudges'
  | 'morning_digest'
  | 'outreach_drip'
  | 'specialist_briefings'

export const ALL_EMAIL_CHANNELS: readonly EmailChannel[] = [
  'product_announcements',
  'welcome_drip',
  'dormancy_nudges',
  'morning_digest',
  'outreach_drip',
  'specialist_briefings',
] as const

const CHANNEL_LABELS: Record<EmailChannel, { title: string; description: string }> = {
  product_announcements: {
    title: 'Product announcements',
    description: 'New features, major updates and platform news.',
  },
  welcome_drip: {
    title: 'Welcome emails',
    description: 'The six-email feature tour new users receive in their first week.',
  },
  dormancy_nudges: {
    title: 'Dormancy nudges',
    description: 'Light check-ins if you have not signed in for a while.',
  },
  morning_digest: {
    title: 'Morning digest',
    description: 'Daily summary of tasks, investor matches and team activity.',
  },
  outreach_drip: {
    title: 'Outreach drip',
    description: 'Suggested investor and supplier outreach templates.',
  },
  specialist_briefings: {
    title: 'Specialist briefings',
    description: 'Periodic summaries from the AI specialists you work with.',
  },
}

export function getChannelLabel(channel: EmailChannel) {
  return CHANNEL_LABELS[channel]
}

/**
 * Check whether a given user is allowed to receive email on a given channel.
 *
 * Returns true when:
 * - No preferences row exists yet (user has not opted out of anything)
 * - Row exists, `unsubscribed_all_at` is NULL
 * - `paused_all_until` is NULL or in the past
 * - The channel's own flag is true
 *
 * @param userId - auth.users.id
 * @param channel - One of the EmailChannel values
 */
export async function isEmailAllowed(
  userId: string,
  channel: EmailChannel,
): Promise<boolean> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('email_preferences')
    .select(`unsubscribed_all_at, paused_all_until, ${channel}`)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    // SECURITY: On error, fail-closed. Better to skip a marketing email than
    // to send one to an unsubscribed user.
    console.error('[email-prefs] isEmailAllowed error — failing closed', {
      userId,
      channel,
      error: error.message,
    })
    return false
  }

  // No row yet — user has not opted out of anything, default to allow
  if (!data) return true

  const prefs = data as unknown as {
    unsubscribed_all_at: string | null
    paused_all_until: string | null
  } & Record<EmailChannel, boolean>

  if (prefs.unsubscribed_all_at) return false

  if (prefs.paused_all_until) {
    const pausedUntil = new Date(prefs.paused_all_until)
    if (pausedUntil.getTime() > Date.now()) return false
  }

  return prefs[channel] !== false
}

/**
 * Hard unsubscribe — user receives no more marketing email until they
 * explicitly re-enable via the /settings/email page.
 */
export async function unsubscribeAll(userId: string): Promise<void> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // Upsert so we create a row if one doesn't exist yet
  const { error } = await supabase
    .from('email_preferences')
    .upsert(
      { user_id: userId, unsubscribed_all_at: now },
      { onConflict: 'user_id' },
    )

  if (error) {
    throw new Error(`Failed to unsubscribe user ${userId}: ${error.message}`)
  }
}

/** Opt out of a single channel but keep others. */
export async function unsubscribeChannel(
  userId: string,
  channel: EmailChannel,
): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('email_preferences')
    .upsert(
      { user_id: userId, [channel]: false },
      { onConflict: 'user_id' },
    )

  if (error) {
    throw new Error(`Failed to unsubscribe user ${userId} from ${channel}: ${error.message}`)
  }
}

/** Pause all marketing email for N days. */
export async function pauseAll(userId: string, days: number): Promise<void> {
  const supabase = createAdminClient()
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('email_preferences')
    .upsert(
      { user_id: userId, paused_all_until: until },
      { onConflict: 'user_id' },
    )

  if (error) {
    throw new Error(`Failed to pause email for user ${userId}: ${error.message}`)
  }
}

/** Re-enable everything (clears hard stop and pause). */
export async function resumeAll(userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('email_preferences')
    .upsert(
      {
        user_id: userId,
        unsubscribed_all_at: null,
        paused_all_until: null,
      },
      { onConflict: 'user_id' },
    )

  if (error) {
    throw new Error(`Failed to resume email for user ${userId}: ${error.message}`)
  }
}

export async function getPreferences(userId: string): Promise<{
  unsubscribed_all_at: string | null
  paused_all_until: string | null
} & Record<EmailChannel, boolean>> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('email_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) {
    // Return default opted-in state
    return {
      unsubscribed_all_at: null,
      paused_all_until: null,
      product_announcements: true,
      welcome_drip: true,
      dormancy_nudges: true,
      morning_digest: true,
      outreach_drip: true,
      specialist_briefings: true,
    }
  }

  return data as unknown as {
    unsubscribed_all_at: string | null
    paused_all_until: string | null
  } & Record<EmailChannel, boolean>
}

/** Set a single channel's flag (used by the settings UI). */
export async function setChannelPreference(
  userId: string,
  channel: EmailChannel,
  enabled: boolean,
): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('email_preferences')
    .upsert(
      { user_id: userId, [channel]: enabled },
      { onConflict: 'user_id' },
    )

  if (error) {
    throw new Error(
      `Failed to set ${channel}=${enabled} for user ${userId}: ${error.message}`,
    )
  }
}
