import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getProfileHubData } from '@/actions/profile-hub'
import { ProfileHubView } from './profile-hub-view'

export const metadata = {
  title: 'My Profile | CentaurOS',
  description: 'Manage your profile and marketplace presence',
}

/**
 * MyProfilePage - Server component that fetches profile data and renders the hub.
 *
 * @security Requires authenticated user. Redirects to login if unauthenticated.
 */
export default async function MyProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/login')

  const data = await getProfileHubData()
  if (!data) redirect('/login')

  return <ProfileHubView data={data} />
}
