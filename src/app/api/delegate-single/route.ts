/**
 * @file API route for single task delegation.
 *
 * @description Server actions have a 60s Vercel timeout. Opus delegation
 * takes 60-150s. This API route has maxDuration=300, giving enough time.
 * Called by the "Auto-assign AI" button in the task detail panel.
 *
 * @security Requires authentication via Supabase session cookie.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { delegateTaskWithContext } from '@/actions/task-delegation'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // AUTH: Create client once, pass to delegation function
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { taskId, specialistId, feedback } = body as { taskId?: string; specialistId?: string; feedback?: string }

  if (!taskId) {
    return NextResponse.json({ error: 'taskId required' }, { status: 400 })
  }

  try {
    // DECISION: Pass pre-authenticated supabase + user to avoid nested
    // createClient() calls which can fail in API route streaming context.
    const result = await delegateTaskWithContext(taskId, user, supabase, specialistId, feedback)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[delegate-single] Error:', err)
    return NextResponse.json({ error: 'Delegation failed' }, { status: 500 })
  }
}
