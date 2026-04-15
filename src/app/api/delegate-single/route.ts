/**
 * @file API route for single task delegation.
 *
 * @description Uses admin client for DB operations (bypasses RLS) while
 * verifying auth via the cookie-based client. This avoids all the
 * cookie/auth context issues that caused repeated failures.
 *
 * @security Auth verified via cookie client. DB ops via admin client scoped to user's foundry.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { delegateTaskWithContext } from '@/actions/task-delegation'
import { rateLimit } from '@/lib/security/rate-limit'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // AUTH: Verify user is authenticated via cookies
  const authClient = await createClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // SECURITY: Rate limit single AI delegation
  const { success: rateLimitOk } = await rateLimit('aiWorker', user.id, { limit: 20, window: 60000 })
  if (!rateLimitOk) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 })
  }

  const body = await request.json()
  const { taskId, specialistId, feedback } = body as { taskId?: string; specialistId?: string; feedback?: string }

  if (!taskId) {
    return NextResponse.json({ error: 'taskId required' }, { status: 400 })
  }

  try {
    // DECISION: Use admin client for DB operations. The cookie-based client
    // has persistent issues with auth context in API routes on Vercel.
    // Auth is already verified above. Admin client bypasses RLS but we
    // scope all queries to the user's foundry in the delegation function.
    const adminClient = createAdminClient()
    const result = await delegateTaskWithContext(taskId, user, adminClient, specialistId, feedback)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[delegate-single] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
