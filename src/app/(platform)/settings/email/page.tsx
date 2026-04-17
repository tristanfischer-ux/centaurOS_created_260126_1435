import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  getPreferences,
  ALL_EMAIL_CHANNELS,
  getChannelLabel,
} from '@/lib/email/preferences'
import { EmailPreferencesForm } from '@/components/settings/email-preferences-form'

/**
 * Email Preferences Page
 *
 * @description Authenticated page where the user can opt out of individual
 * marketing email categories, pause all marketing email for 90 days, or
 * unsubscribe from everything. UK PECR + GDPR compliance surface.
 */
export default async function EmailPreferencesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const prefs = await getPreferences(user.id)

  const channels = ALL_EMAIL_CHANNELS.map((channel) => ({
    channel,
    ...getChannelLabel(channel),
    enabled: prefs[channel],
  }))

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Email preferences</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which marketing emails you receive from Fractional Forge. Transactional
          emails — things like password resets and order updates — are not affected by
          these settings.
        </p>
      </div>

      <EmailPreferencesForm
        channels={channels}
        unsubscribedAllAt={prefs.unsubscribed_all_at}
        pausedAllUntil={prefs.paused_all_until}
      />
    </div>
  )
}
