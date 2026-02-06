'use server'

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Temporary diagnostic endpoint to debug foundries RLS.
 * DELETE THIS AFTER DEBUGGING.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Call the RLS diagnostic function
  const { data: diagnosis, error: diagError } = await supabase.rpc('diagnose_foundry_rls')

  // Also try the direct query to see if it works
  const { data: directQuery, error: directError } = await supabase
    .from('foundries')
    .select('id, name, purpose_data')
    .limit(10)

  return NextResponse.json({
    diagnosis,
    diagError,
    directQuery,
    directError,
  })
}
