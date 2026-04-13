/**
 * @file API route for batch task delegation via SSE.
 *
 * @description Processes multiple task delegations in parallel batches of 3,
 * streaming progress events to the client. Each task is routed to the most
 * relevant specialist, who generates a complete deliverable artifact.
 *
 * Uses SSE (Server-Sent Events) to keep the client updated in real time.
 * The 300s maxDuration gives Opus enough time for high-stakes delegations.
 *
 * @security Requires authentication via Supabase session cookie.
 *
 * @related
 * - src/actions/task-delegation.ts — Single-task delegation logic (source of truth)
 * - src/components/tasks/delegation-progress-modal.tsx — Client-side consumer
 * - src/hooks/use-relevant-specialist.ts — Specialist routing
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSpecialistById } from '@/lib/agents/specialists-config'
import { getRelevantSpecialist } from '@/hooks/use-relevant-specialist'
import { compilePersonalityPrompt } from '@/lib/agents/personality'
import { createArtifact } from '@/actions/agent-artifacts'
import { buildContextLayers } from '@/lib/agents/prompt-builder'
import { buildAIContextWithServiceClient } from '@/lib/agents/sweep-context'

// DECISION: 300s timeout — batch of 15 tasks × 3 parallel = 5 sequential rounds.
// Each round takes 30-120s depending on Opus vs Sonnet routing.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const BATCH_SIZE = 3

// ─── Helpers (adapted from task-delegation.ts) ─────────────────────────────

function inferContentType(
  title: string,
  description: string,
): 'document' | 'report' | 'checklist' | 'email' | 'presentation' {
  const combined = `${title} ${description}`.toLowerCase()
  if (/research|prospect|search|find|mine|compile|list|directory|analys|survey|benchmark|competitor|market/i.test(combined)) return 'report'
  if (/checklist|audit|review|check|verify|test|compliance|gdpr|security|standards/i.test(combined)) return 'checklist'
  if (/email|outreach|message|linkedin|send|batch|follow.up|sequence|campaign|cold/i.test(combined)) return 'email'
  if (/pitch|investor|deck|presentation|board.update|weekly.report|demo.script/i.test(combined)) return 'presentation'
  return 'document'
}

function needsReviewDisclaimer(specialistId: string): string | null {
  const disclaimers: Record<string, string> = {
    'finance-lead': '⚠️ **FINANCIAL CONTENT — REVIEW REQUIRED:** This contains financial projections and assumptions. Verify all numbers with your accountant before acting on them.',
    'legal-counsel': '⚠️ **LEGAL CONTENT — REVIEW REQUIRED:** This is not legal advice. Have a qualified solicitor review before using in any binding context.',
    'fundraising-advisor': '⚠️ **INVESTOR-FACING CONTENT — REVIEW REQUIRED:** Verify all claims, metrics, and projections before presenting to investors.',
  }
  return disclaimers[specialistId] ?? null
}

// ─── Core delegation logic for a single task ───────────────────────────────

interface TaskDelegationContext {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  foundryId: string
  fullName: string
  apiKey: string
}

async function delegateSingleTask(
  taskId: string,
  ctx: TaskDelegationContext,
): Promise<{
  taskId: string
  taskTitle: string
  specialistName: string
  status: 'complete' | 'error'
  error?: string
}> {
  const { supabase, foundryId, fullName, apiKey } = ctx

  // 1. Fetch task
  const { data: task } = await supabase
    .from('tasks')
    .select(`
      id, title, description, status, objective_id,
      objectives!objective_id ( title, description, parent_objective_id,
        parent:objectives!parent_objective_id ( title )
      )
    `)
    .eq('id', taskId)
    .eq('foundry_id', foundryId)
    .single()

  if (!task) {
    return { taskId, taskTitle: 'Unknown', specialistName: 'Unknown', status: 'error', error: 'Task not found' }
  }

  // 2. Route to specialist
  const objective = task.objectives as {
    title: string
    description: string | null
    parent: { title: string } | null
  } | null
  const pillarTitle = objective?.parent?.title ?? null

  const routed = getRelevantSpecialist(task.title, task.description, pillarTitle)
  const specialist = getSpecialistById(routed.specialistId)
  if (!specialist) {
    return { taskId, taskTitle: task.title, specialistName: routed.specialistName, status: 'error', error: 'Specialist not found' }
  }

  // 3. Build context
  const taskContext = [
    `TASK: ${task.title}`,
    task.description ? `DESCRIPTION: ${task.description}` : null,
    objective ? `OBJECTIVE: ${objective.title}` : null,
    objective?.description ? `OBJECTIVE CONTEXT: ${objective.description}` : null,
    pillarTitle ? `STRATEGIC PILLAR: ${pillarTitle}` : null,
    `FOUNDER: ${fullName}`,
  ].filter(Boolean).join('\n')

  let companyContext = ''
  try {
    companyContext = await buildAIContextWithServiceClient(foundryId)
  } catch {
    companyContext = '\n--- Business Context ---\nFractional Forge — AI manufacturing platform for hardware startups\n--- End Business Context ---\n'
  }

  let specialistContext = ''
  try {
    const { contextBlocks } = await buildContextLayers({
      foundryId,
      specialistId: specialist.id,
      threadId: null,
      input: `${task.title} ${task.description || ''}`,
      finalPrompt: taskContext,
      isConversationalFastPath: false,
    })
    specialistContext = contextBlocks
  } catch {
    // Non-critical — specialist operates without enrichment
  }

  // 4. Build execution prompt
  const personalityPrompt = specialist.personality
    ? compilePersonalityPrompt(specialist.name, specialist.personality, undefined, specialist.id)
    : `You are ${specialist.name}, ${specialist.title}.`

  const disclaimer = needsReviewDisclaimer(specialist.id)

  const voice = specialist.personality?.voice
  const signaturePhrases = voice?.signaturePhrases?.slice(0, 3) ?? []
  const voiceReminder = signaturePhrases.length > 0
    ? `\nVOICE REMINDER: You are ${specialist.name}. Use phrases like "${signaturePhrases.join('", "')}" naturally. A reader should know it's you without seeing your name.`
    : ''

  const executionPrompt = `${personalityPrompt}

${companyContext}

${specialistContext}

---

YOU ARE NOW IN EXECUTION MODE. The founder has delegated a task to you. Your job is to COMPLETE it — not discuss it, not ask questions, not outline options. Produce the actual deliverable.

The founder's expectation is: "Oh my god, there's no way I could have done this on my own." Not "this is OK." You are a senior specialist, not a junior assistant. Your output should be genuinely impressive.

${disclaimer ? `IMPORTANT: ${disclaimer}\n` : ''}

TASK CONTEXT:
${taskContext}

REAL PRODUCT DATA (use these exact names and numbers, never placeholders):
- Pricing: Explorer (free, 50 tasks), Starter (£49/mo, 100 tasks), Professional (£149/mo, 500 tasks), Enterprise (£399/mo, 10000 tasks)
- Specialists: Sage (Strategy), Max (CTO), Jian (VP Engineering), Fang (VP Manufacturing), Chase (VP Supply Chain), Priya (Product), Mia (Marketing), Sal (Sales), Cal (Chief of Staff), Finn (Finance), Fiona (Fundraising), Harper (HR), Leo (Legal)
- Key features: CAD Lab (concept → specify → source → assemble), The Forge marketplace, Strategy River, 13 specialist conversations
- Stage: Pre-revenue, bootstrapped, UK-based, founder-only team. Scale deliverables to this stage.
- Website: fractionalforge.app

INSTRUCTIONS:
1. Produce a COMPLETE, ready-to-use deliverable. Nothing left for the founder to fill in — no placeholder brackets, no "[insert X here]".
2. Start with "## What I Did" (2-3 sentences). Open with a bold, opinionated take that only YOU (${specialist.name}) would make.
3. For web pages or UI: output a complete Next.js/React component using shadcn/ui and Tailwind. Include the metadata export. The founder does not write code.
4. For content (emails, posts, copy): output the final, send-ready text. Include distribution instructions.
5. For research (prospect lists, analysis): output structured data. Include a "Start with these 3" action section.
6. Use REAL product data above — real names, real prices, real features. Never fabricate companies or people.
7. Mark anything requiring the founder's judgment with [REVIEW NEEDED] and explain why.
8. Include at least one non-obvious insight that demonstrates deep expertise.
9. SCOPE CHECK: If your output will exceed 15KB, you are over-engineering. A complete 10KB deliverable beats a truncated 25KB one. Scale to a bootstrapped startup, not an enterprise.
10. Close with your signature action format specific to YOU.

OUTPUT FORMAT:
- If this is a web page or UI component: deliver as a single React/Next.js component with all CSS inline. Must render without modification.
- If this is spreadsheet/research data: output as a markdown table with clear headers. Cap at 30 rows per generation.
- If this is copy/content: include metadata at the top (word count, target page, distribution plan).
- If this is a script or procedure: include exact word-for-word text, timed sections, and stage directions.

SPECIFICITY CHECK: If your output contains "your product", "your company", "[insert X]", or any placeholder bracket — STOP and replace with the real name from the product data above. Every reference must use real names.

Do NOT:
- Ask clarifying questions (make reasonable assumptions and note them)
- Provide multiple options (pick the best one and explain why)
- Give generic advice (be specific to this company and task)
- Use placeholder brackets like [your name here] or [insert metric]
- Over-engineer — you are building for a team of one, not an enterprise
- Sound like a generic assistant — sound like ${specialist.name}${voiceReminder}`

  // 5. Call AI
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ['legal-counsel', 'finance-lead', 'fundraising-advisor', 'strategist', 'sales-lead'].includes(specialist.id)
          ? 'claude-opus-4-6'
          : 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: executionPrompt,
        messages: [
          { role: 'user', content: 'Complete this task now. Produce the full deliverable.' },
        ],
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      console.error('[delegate-batch] API error:', response.status)
      return { taskId, taskTitle: task.title, specialistName: specialist.name, status: 'error', error: 'Failed to generate deliverable' }
    }

    const data = await response.json()
    const content = (data.content?.[0]?.text ?? '').trim()

    if (!content) {
      return { taskId, taskTitle: task.title, specialistName: specialist.name, status: 'error', error: 'Empty response from specialist' }
    }

    // 6. Create artifact
    const contentType = inferContentType(task.title, task.description || '')
    const { data: artifact, error: artifactError } = await createArtifact({
      title: `${specialist.name}: ${task.title}`,
      content,
      contentType,
      metadata: {
        taskId: task.id,
        specialistId: specialist.id,
        specialistName: specialist.name,
        delegatedAt: new Date().toISOString(),
        isRevision: false,
      },
    })

    if (artifactError || !artifact) {
      console.error('[delegate-batch] Artifact creation failed:', artifactError)
      return { taskId, taskTitle: task.title, specialistName: specialist.name, status: 'error', error: artifactError || 'Failed to save deliverable' }
    }

    // 7. Update task status + link artifact
    await supabase
      .from('tasks')
      .update({
        metadata: {
          delegation_artifact_id: artifact.id,
          delegated_to: specialist.id,
          delegated_at: new Date().toISOString(),
        },
        status: 'Amended_Pending_Approval',
      })
      .eq('id', taskId)

    return { taskId, taskTitle: task.title, specialistName: specialist.name, status: 'complete' }
  } catch (err) {
    clearTimeout(timeout)
    const errorMsg = err instanceof Error && err.name === 'AbortError'
      ? 'Request timed out'
      : 'Unexpected error during delegation'
    console.error('[delegate-batch] Error delegating task:', taskId, err)
    return { taskId, taskTitle: task.title ?? 'Unknown', specialistName: specialist?.name ?? 'Unknown', status: 'error', error: errorMsg }
  }
}

// ─── SSE Route Handler ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await request.json()
  const { taskIds } = body as { taskIds?: string[] }

  if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
    return new Response(JSON.stringify({ error: 'taskIds array required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // SECURITY: Cap batch size to prevent abuse
  if (taskIds.length > 50) {
    return new Response(JSON.stringify({ error: 'Maximum 50 tasks per batch' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Get user profile for foundry scoping
  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, full_name')
    .eq('id', user.id)
    .single()

  if (!profile?.foundry_id) {
    return new Response(JSON.stringify({ error: 'No foundry found' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const ctx: TaskDelegationContext = {
    supabase,
    userId: user.id,
    foundryId: profile.foundry_id,
    fullName: profile.full_name ?? 'Founder',
    apiKey,
  }

  const encoder = new TextEncoder()
  const total = taskIds.length

  const stream = new ReadableStream({
    async start(controller) {
      // FLOW: Send start event
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', total })}\n\n`))

      let completed = 0
      let failed = 0

      // Process in batches of BATCH_SIZE (parallel within, sequential between)
      for (let i = 0; i < taskIds.length; i += BATCH_SIZE) {
        const batch = taskIds.slice(i, i + BATCH_SIZE)

        const results = await Promise.allSettled(
          batch.map((taskId) => delegateSingleTask(taskId, ctx)),
        )

        for (const result of results) {
          if (result.status === 'fulfilled') {
            const r = result.value
            if (r.status === 'complete') {
              completed++
            } else {
              failed++
            }
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({
                type: 'progress',
                taskId: r.taskId,
                taskTitle: r.taskTitle,
                specialistName: r.specialistName,
                status: r.status,
                error: r.error,
              })}\n\n`,
            ))
          } else {
            failed++
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({
                type: 'progress',
                taskId: batch[0],
                taskTitle: 'Unknown',
                specialistName: 'Unknown',
                status: 'error',
                error: 'Unexpected failure',
              })}\n\n`,
            ))
          }
        }
      }

      // FLOW: Send done event
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
