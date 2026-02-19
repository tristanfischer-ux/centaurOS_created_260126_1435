import { createClient } from '@/lib/supabase/server'
import { getUserFoundries } from '@/lib/supabase/foundry-context'
import { redirect } from 'next/navigation'
import { WorkspacePickerView } from './workspace-picker-view'

export const metadata = {
  title: 'Choose Workspace | ForgeOS',
}

export default async function WorkspacePickerPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { foundries } = await getUserFoundries()

  // If user only has one foundry, go straight there
  if (foundries.length === 1) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_type')
      .eq('id', user.id)
      .single()

    if (profile?.account_type === 'supplier') {
      redirect('/supplier-portal')
    }
    redirect('/updates')
  }

  // If user has no foundries at all, redirect to join page
  if (foundries.length === 0) {
    redirect('/updates')
  }

  return <WorkspacePickerView foundries={foundries} />
}
