import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { expertise, bio, availability_hours } = body

    // Update the profile with executive-specific data
    const { error } = await supabase
      .from('profiles')
      .update({
        bio,
        onboarding_data: {
          executive_profile_completed: true,
          expertise_areas: expertise,
          availability_hours,
          profile_completed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      console.error('Error updating executive profile:', error)
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Executive profile setup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
