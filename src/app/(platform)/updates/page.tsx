import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getActivityFeed } from '@/actions/activity'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { UpdatesLayout } from './updates-layout'
import { FounderRecruitsBanner } from './founder-recruits-banner'

export const revalidate = 60

/**
 * Updates Page - Server Component
 *
 * @description Fetches the initial activity feed and passes it to the
 * client layout. This is a server component that handles auth and
 * initial data fetching.
 */
export default async function UpdatesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    redirect('/login')
  }

  // Fetch initial activity feed
  const result = await getActivityFeed({
    limit: 50,
    filter: 'all',
    showAllFoundryActivity: true,
    includeSystemLogs: false
  })

  const initialItems = result.success && result.data ? result.data : []

  // Fetch user role to conditionally show Founder recruits banner
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isFounder = profile?.role === 'Founder'

  return (
    <UpdatesLayout
      initialItems={initialItems}
      userId={user.id}
      foundryId={foundryId}
      bannerSlot={isFounder ? <FounderRecruitsBanner /> : null}
    />
  )
}
