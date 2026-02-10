import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { getProfileHubData } from '@/actions/profile-hub'
import { getUserFoundries } from '@/lib/supabase/foundry-context'
import { ProfileHubView } from './profile-hub-view'

export const metadata = {
  title: 'My Profile | CentaurOS',
  description: 'Manage your profile and marketplace presence',
}

/**
 * Gets the admin Supabase client for accessing messaging_links table.
 *
 * @returns Admin client or null if env vars missing
 */
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * MyProfilePage - Server component that fetches profile data and renders the hub.
 *
 * @description Also fetches foundry memberships and Telegram link status
 * so the user can manage their profile, integrations, and notification
 * preferences all from one place.
 *
 * @security Requires authenticated user. Redirects to login if unauthenticated.
 */
export default async function MyProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/login')

  // Fetch profile data, foundries, and telegram link in parallel
  const admin = getAdminClient()
  const [data, foundries, telegramResult] = await Promise.all([
    getProfileHubData(),
    getUserFoundries(),
    admin
      ? admin
          .from('messaging_links')
          .select('id, platform_username, verified_at')
          .eq('profile_id', user.id)
          .eq('platform', 'telegram')
          .single()
      : Promise.resolve({ data: null }),
  ])

  if (!data) redirect('/login')

  const telegramLink = telegramResult?.data as {
    id: string
    platform_username: string | null
    verified_at: string | null
  } | null
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'ForgeOSBot'

  return (
    <ProfileHubView
      data={data}
      foundries={foundries}
      telegramLink={telegramLink}
      botUsername={botUsername}
    />
  )
}
