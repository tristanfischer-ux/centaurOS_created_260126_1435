/**
 * @file API route for batch task delegation via SSE.
 *
 * @description Processes multiple task delegations in parallel batches of 3,
 * streaming progress events to the client. Delegates to the existing
 * delegateTaskToSpecialist server action for each task.
 *
 * @security Requires authentication via Supabase session cookie.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRelevantSpecialist } from '@/hooks/use-relevant-specialist'
import { delegateTaskWithContext } from '@/actions/task-delegation'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const BATCH_SIZE = 3

export async function POST(request: NextRequest) {
  // AUTH: Verify via cookie client, then use admin client for DB ops
  const authClient = await createClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await request.json()
  const { taskIds } = body as { taskIds?: string[] }

  if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
    return new Response(JSON.stringify({ error: 'taskIds array required' }), { status: 400 })
  }

  if (taskIds.length > 50) {
    return new Response(JSON.stringify({ error: 'Maximum 50 tasks per batch' }), { status: 400 })
  }

  // DECISION: Admin client for all DB operations. Cookie-based client has
  // persistent auth context issues in Vercel API route streaming.
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id')
    .eq('id', user.id)
    .single()

  if (!profile?.foundry_id) {
    return new Response(JSON.stringify({ error: 'No foundry found' }), { status: 400 })
  }

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, description')
    .in('id', taskIds)
    .eq('foundry_id', profile.foundry_id)

  const taskMap = new Map((tasks ?? []).map(t => [t.id, t]))

  const encoder = new TextEncoder()
  const total = taskIds.length

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', total })}\n\n`))

      let completed = 0
      let failed = 0

      try {
        for (let i = 0; i < taskIds.length; i += BATCH_SIZE) {
          const batch = taskIds.slice(i, i + BATCH_SIZE)

          const results = await Promise.allSettled(
            batch.map(async (taskId) => {
              const task = taskMap.get(taskId)
              const title = task?.title ?? 'Unknown'
              const routed = getRelevantSpecialist(title, task?.description ?? '')

              try {
                // DECISION: Use the existing server action — it's already tested,
                // handles auth, rich context, model routing, artifact creation,
                // and metadata merging. Don't duplicate 200 lines of logic.
                // DECISION: Pass pre-authenticated supabase + user from the
                // API route context — avoids nested createClient() calls.
                const result = await delegateTaskWithContext(taskId, user, supabase)

                if (result.error) {
                  return { taskId, taskTitle: title, specialistName: routed.specialistName, status: 'error' as const, error: result.error }
                }

                return { taskId, taskTitle: title, specialistName: result.specialistName ?? routed.specialistName, status: 'complete' as const }
              } catch (err) {
                console.error('[delegate-batch] Task failed:', taskId, err)
                return { taskId, taskTitle: title, specialistName: routed.specialistName, status: 'error' as const, error: 'Delegation failed' }
              }
            }),
          )

          for (const result of results) {
            if (result.status === 'fulfilled') {
              const r = result.value
              if (r.status === 'complete') completed++
              else failed++
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'progress', ...r })}\n\n`,
              ))
            } else {
              failed++
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'progress', taskId: batch[0], taskTitle: 'Unknown', specialistName: 'Unknown', status: 'error', error: 'Unexpected failure' })}\n\n`,
              ))
            }
          }
        }
      } catch (loopError) {
        console.error('[delegate-batch] Stream loop crashed:', loopError)
        failed = total - completed
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'progress', taskId: 'error', taskTitle: 'Batch failed', specialistName: 'System', status: 'error', error: String(loopError) })}\n\n`,
        ))
      }

      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: 'done', completed, failed })}\n\n`,
      ))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
