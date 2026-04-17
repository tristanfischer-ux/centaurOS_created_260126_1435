/**
 * @file email-preferences.ts — Server actions for user email preferences.
 *
 * @description Called from the /settings/email page. Authenticated — the action
 * derives the user from the session, never trusts a client-supplied user id.
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import {
  setChannelPreference,
  unsubscribeAll,
  resumeAll,
  pauseAll,
  ALL_EMAIL_CHANNELS,
  type EmailChannel,
} from '@/lib/email/preferences'
import { revalidatePath } from 'next/cache'

function assertValidChannel(value: string): asserts value is EmailChannel {
  if (!ALL_EMAIL_CHANNELS.includes(value as EmailChannel)) {
    throw new Error(`Invalid email channel: ${value}`)
  }
}

export async function toggleChannel(
  channel: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    assertValidChannel(channel)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Not authenticated' }

    await setChannelPreference(user.id, channel, enabled)
    revalidatePath('/settings/email')
    return { ok: true }
  } catch (err) {
    console.error('[email-prefs] toggleChannel error', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function unsubscribeEverything(): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Not authenticated' }

    await unsubscribeAll(user.id)
    revalidatePath('/settings/email')
    return { ok: true }
  } catch (err) {
    console.error('[email-prefs] unsubscribeEverything error', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function resumeEmails(): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Not authenticated' }

    await resumeAll(user.id)
    revalidatePath('/settings/email')
    return { ok: true }
  } catch (err) {
    console.error('[email-prefs] resumeEmails error', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function pauseForNDays(days: number): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return { ok: false, error: 'Days must be between 1 and 365' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Not authenticated' }

    await pauseAll(user.id, days)
    revalidatePath('/settings/email')
    return { ok: true }
  } catch (err) {
    console.error('[email-prefs] pauseForNDays error', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
