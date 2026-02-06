'use server'

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Temporary diagnostic endpoint to debug purpose_data retrieval.
 * DELETE THIS AFTER DEBUGGING.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, foundry_id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'No profile', profileError }, { status: 400 })
  }

  const { data: foundry, error: foundryError } = await supabase
    .from('foundries')
    .select('id, name, purpose_data')
    .eq('id', profile.foundry_id)
    .single()

  return NextResponse.json({
    userId: user.id,
    foundryId: profile.foundry_id,
    role: profile.role,
    foundry,
    foundryError,
    hasPurposeData: !!foundry?.purpose_data,
    purposeDataType: typeof foundry?.purpose_data,
    purposeDataKeys: foundry?.purpose_data ? Object.keys(foundry.purpose_data as object) : null,
  })
}
