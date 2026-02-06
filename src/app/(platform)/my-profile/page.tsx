import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getProfileHubData } from '@/actions/profile-hub'
import { ProfileHubView } from './profile-hub-view'

export const metadata = {
  title: 'My Profile | ForgeOS',
  description: 'Manage your marketplace profile and presence',
}

export default async function MyProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/login')

  const data = await getProfileHubData()
  if (!data) redirect('/login')

  return <ProfileHubView data={data} />
}
