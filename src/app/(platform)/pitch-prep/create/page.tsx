import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PitchPrepForm } from '@/components/pitch-prep'

export const metadata: Metadata = {
  title: 'Create Pitch Prep Request | CentaurOS',
  description: 'Submit a pitch preparation request to get investor-ready',
}

export default async function CreatePitchPrepPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  return (
    <div className="max-w-3xl mx-auto py-6">
      <PitchPrepForm />
    </div>
  )
}
