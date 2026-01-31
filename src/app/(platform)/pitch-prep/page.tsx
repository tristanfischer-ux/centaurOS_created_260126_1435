// @ts-nocheck - pitch_prep_requests table exists but types not regenerated
import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PitchPrepListView } from './pitch-prep-list-view'
import { PitchPrepRequest } from '@/types/pitch-prep'

export const metadata: Metadata = {
  title: 'Pitch Prep | CentaurOS',
  description: 'Prepare your pitch for investor conversations',
}

export default async function PitchPrepPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  // Get user's pitch prep requests
  const { data: requests, error } = await supabase
    .from('pitch_prep_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch pitch prep requests:', error)
  }

  return <PitchPrepListView requests={(requests || []) as PitchPrepRequest[]} />
}
