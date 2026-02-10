import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getProfileHubData } from '@/actions/profile-hub'
import { getUserFoundries } from '@/lib/supabase/foundry-context'
import { ProfileHubView } from './profile-hub-view'

export const metadata = {
  title: 'My Profile | CentaurOS',
  description: 'Manage your profile and marketplace presence',
}

/**
 * MyProfilePage - Server component that fetches profile data and renders the hub.
 *
 * @description Also fetches foundry memberships so the user can switch
 * companies directly from their profile page.
 *
 * @security Requires authenticated user. Redirects to login if unauthenticated.
 */
export default async function MyProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/login')

  const [data, foundries] = await Promise.all([
    getProfileHubData(),
    getUserFoundries(),
  ])

  if (!data) redirect('/login')

  return <ProfileHubView data={data} foundries={foundries} />
}
