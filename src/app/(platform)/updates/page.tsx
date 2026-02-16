import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getActivityFeed } from '@/actions/activity'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { UpdatesLayout } from './updates-layout'
import { FounderRecruitsBanner } from './founder-recruits-banner'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-status-warning-light mx-auto">
          <AlertTriangle className="h-7 w-7 text-status-warning" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">Profile Setup Incomplete</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your account profile hasn&apos;t been fully set up yet.
            Please complete the onboarding process or contact support if this persists.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button asChild>
            <Link href="/today">Go to Dashboard</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/settings">Settings</Link>
          </Button>
        </div>
      </div>
    )
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
