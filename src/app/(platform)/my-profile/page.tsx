import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { getProfileHubData } from '@/actions/profile-hub'
import { getUserFoundries } from '@/lib/supabase/foundry-context'
import { ProfileHubView } from './profile-hub-view'

export const metadata = {
  title: 'My Profile | ForgeOS',
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

  // Date boundaries for enrichment data
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const now = new Date()
  const day = now.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const thisMonday = new Date(now)
  thisMonday.setDate(now.getDate() + mondayOffset)
  thisMonday.setHours(0, 0, 0, 0)
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(lastMonday.getDate() - 7)

  // Fetch profile data, foundries, telegram link, and enrichment data in parallel
  const admin = getAdminClient()
  const [data, foundriesResult, telegramResult, completionHistoryResult] = await Promise.all([
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
    // Task completion history for sparkline (last 30 days)
    supabase
      .from('task_history')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('action_type', 'COMPLETED')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true }),
  ])

  if (!data) redirect('/login')

  const telegramLink = telegramResult?.data as {
    id: string
    platform_username: string | null
    verified_at: string | null
  } | null
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'ForgeOSBot'

  // Build enrichment data: sparkline, weekly trends
  const completionsByDate = new Map<string, number>()
  for (const event of completionHistoryResult.data ?? []) {
    if (!event.created_at) continue
    const dateStr = event.created_at.split('T')[0]
    completionsByDate.set(dateStr, (completionsByDate.get(dateStr) ?? 0) + 1)
  }

  // Generate 30-day sparkline data (fill missing days with 0)
  const sparklineData: Array<{ date: string; count: number }> = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    sparklineData.push({ date: dateStr, count: completionsByDate.get(dateStr) ?? 0 })
  }

  // Weekly comparison
  const thisMondayStr = thisMonday.toISOString().split('T')[0]
  const lastMondayStr = lastMonday.toISOString().split('T')[0]
  let completedThisWeek = 0
  let completedLastWeek = 0
  for (const [dateStr, count] of completionsByDate) {
    if (dateStr >= thisMondayStr) completedThisWeek += count
    else if (dateStr >= lastMondayStr && dateStr < thisMondayStr) completedLastWeek += count
  }

  const enrichment = {
    sparklineData,
    completedThisWeek,
    completedLastWeek,
  }

  return (
    <ProfileHubView
      data={data}
      foundries={foundriesResult.foundries}
      foundriesError={foundriesResult.error}
      telegramLink={telegramLink}
      botUsername={botUsername}
      enrichment={enrichment}
    />
  )
}
