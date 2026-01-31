// @ts-nocheck - pitch_prep_requests table exists but types not regenerated
import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { PitchPrepDetailView } from './pitch-prep-detail-view'
import { PitchPrepRequest } from '@/types/pitch-prep'

export const metadata: Metadata = {
  title: 'Pitch Prep Request | CentaurOS',
  description: 'View your pitch preparation request',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PitchPrepDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  // Get the pitch prep request
  const { data: request, error } = await supabase
    .from('pitch_prep_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !request) {
    console.error('Failed to fetch pitch prep request:', error)
    notFound()
  }

  // Check authorization
  if (request.user_id !== user.id) {
    redirect('/pitch-prep')
  }

  return <PitchPrepDetailView request={request as PitchPrepRequest} />
}
