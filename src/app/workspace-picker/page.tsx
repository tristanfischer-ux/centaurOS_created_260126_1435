import { createClient } from '@/lib/supabase/server'
import { getUserFoundries } from '@/lib/supabase/foundry-context'
import { redirect } from 'next/navigation'
import { WorkspacePickerView } from './workspace-picker-view'

export const metadata = {
  title: 'Choose Workspace',
  description: 'Select the workspace you want to work in.',
}

// Calls createClient() + getUserFoundries() at page entry → can't be statically
// prerendered. Fixes build-time "Missing Supabase environment variables" error
// in Vercel's Export step.
export const dynamic = 'force-dynamic'

export default async function WorkspacePickerPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { foundries } = await getUserFoundries()

  // If user only has one foundry, go straight to /investors.
  // DECISION 2026-04-25: /today removed; /investors is the killer-feature default.
  if (foundries.length === 1) {
    redirect('/investors')
  }

  // If user has no foundries at all, redirect to default page
  if (foundries.length === 0) {
    redirect('/investors')
  }

  return <WorkspacePickerView foundries={foundries} />
}
