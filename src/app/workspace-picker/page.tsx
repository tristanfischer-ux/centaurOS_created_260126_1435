import { createClient } from '@/lib/supabase/server'
import { getUserFoundries } from '@/lib/supabase/foundry-context'
import { redirect } from 'next/navigation'
import { WorkspacePickerView } from './workspace-picker-view'

export const metadata = {
  title: 'Choose Workspace',
  description: 'Select the workspace you want to work in.',
}

export default async function WorkspacePickerPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { foundries } = await getUserFoundries()

  // If user only has one foundry, go straight to /today.
  // DECISION 2026-04-16: founder-first architecture — no more supplier divert.
  if (foundries.length === 1) {
    redirect('/today')
  }

  // If user has no foundries at all, redirect to default page
  if (foundries.length === 0) {
    redirect('/today')
  }

  return <WorkspacePickerView foundries={foundries} />
}
