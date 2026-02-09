import { createClient } from '@/lib/supabase/server'
import { getUserFoundries } from '@/lib/supabase/foundry-context'
import { redirect } from 'next/navigation'
import { PersonHub } from './person-hub'

/**
 * Person Hub — the user's personal home page.
 *
 * @description Shows company tiles for switching workspaces, quick links
 * to person-level features (Marketplace, Guild, Profile), and a welcome
 * header. This is the "Me" space, separate from any company context.
 *
 * @security Requires authenticated user. No foundry context needed —
 * this page is person-level, not company-level.
 */
export default async function HomePage() {
  const supabase = await createClient()

  // AUTH: Require authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // Fetch profile and foundry memberships in parallel
  const [profileResult, userFoundries] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, role, avatar_url, email')
      .eq('id', user.id)
      .single(),
    getUserFoundries(),
  ])

  const profile = profileResult.data

  return (
    <PersonHub
      userName={profile?.full_name || user.email || 'User'}
      userEmail={profile?.email || user.email || ''}
      userRole={profile?.role || 'Member'}
      userAvatar={profile?.avatar_url || null}
      foundries={userFoundries}
    />
  )
}
