import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's foundry_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) {
      return NextResponse.json({ members: [] })
    }

    // Get all team members in the same foundry (excluding current user)
    const { data: members, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, avatar_url')
      .eq('foundry_id', profile.foundry_id)
      .neq('id', user.id)
      .order('full_name', { ascending: true })

    if (error) {
      console.error('Failed to fetch team members:', error)
      return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 })
    }

    return NextResponse.json({ members: members || [] })
  } catch (error) {
    console.error('Error in team members API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
