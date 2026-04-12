"use server"

/**
 * @file task-delegation.ts
 *
 * @description Server action for delegating tasks to AI specialists.
 * The specialist generates a complete deliverable (artifact) for the task,
 * which the founder reviews and approves before the task is marked complete.
 *
 * @security Auth-gated via withAuth. Foundry-scoped queries.
 */

import { createClient } from '@/lib/supabase/server'
import { withAuth } from '@/lib/server-action-utils'
import { getSpecialistById } from '@/lib/agents/specialists-config'
import { compilePersonalityPrompt } from '@/lib/agents/personality'
import { getRelevantSpecialist } from '@/hooks/use-relevant-specialist'
import { createArtifact } from '@/actions/agent-artifacts'

// ─── Types ──────────────────────────────────────────────────────────

interface DelegationResult {
  artifactId?: string
  specialistId?: string
  specialistName?: string
  error?: string
}

// ─── Helpers ────────────────────────────────────────────────────────

// DECISION: Map task domain keywords to artifact content types.
// Content tasks produce documents, research produces reports, etc.
function inferContentType(title: string, description: string): 'document' | 'report' | 'checklist' {
  const combined = `${title} ${description}`.toLowerCase()
  if (/research|prospect|search|find|mine|compile|list|directory/i.test(combined)) return 'report'
  if (/checklist|audit|review|check|verify|test/i.test(combined)) return 'checklist'
  return 'document'
}

// DECISION: High-stakes domains get a prominent review disclaimer.
function needsReviewDisclaimer(specialistId: string): string | null {
  const disclaimers: Record<string, string> = {
    'finance-lead': '⚠️ **FINANCIAL CONTENT — REVIEW REQUIRED:** This contains financial projections and assumptions. Verify all numbers with your accountant before acting on them.',
    'legal-counsel': '⚠️ **LEGAL CONTENT — REVIEW REQUIRED:** This is not legal advice. Have a qualified solicitor review before using in any binding context.',
    'fundraising-advisor': '⚠️ **INVESTOR-FACING CONTENT — REVIEW REQUIRED:** Verify all claims, metrics, and projections before presenting to investors.',
  }
  return disclaimers[specialistId] ?? null
}

// ─── Main Action ────────────────────────────────────────────────────

/**
 * @description Delegates a task to an AI specialist who generates a complete
 * deliverable. The artifact is linked to the task for founder review.
 *
 * @param taskId - The task to delegate
 * @param specialistIdOverride - Optional: force a specific specialist (otherwise auto-routes)
 * @param feedback - Optional: revision feedback from a previous attempt
 * @returns The artifact ID and specialist info, or an error
 */
export async function delegateTaskToSpecialist(
  taskId: string,
  specialistIdOverride?: string,
  feedback?: string,
): Promise<DelegationResult> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()

    // ── 1. Get task details + context ──────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('foundry_id, full_name')
      .eq('id', user.id)
      .single()

    if (!profile?.foundry_id) return { error: 'No foundry found' }

    const { data: task } = await supabase
      .from('tasks')
      .select(`
        id, title, description, status, objective_id,
        objectives!objective_id ( title, description, parent_objective_id,
          parent:objectives!parent_objective_id ( title )
        )
      `)
      .eq('id', taskId)
      .eq('foundry_id', profile.foundry_id)
      .single()

    if (!task) return { error: 'Task not found' }

    // ── 2. Route to specialist ────────────────────────────────────
    const objective = task.objectives as { title: string; description: string | null; parent: { title: string } | null } | null
    const pillarTitle = objective?.parent?.title ?? null

    let specialistId = specialistIdOverride
    let specialistName = ''

    if (!specialistId) {
      const routed = getRelevantSpecialist(task.title, task.description, pillarTitle)
      specialistId = routed.specialistId
      specialistName = routed.specialistName
    }

    const specialist = getSpecialistById(specialistId)
    if (!specialist) return { error: `Specialist "${specialistId}" not found` }
    specialistName = specialist.name

    // ── 3. Build context ──────────────────────────────────────────
    const contextParts = [
      `TASK: ${task.title}`,
      task.description ? `DESCRIPTION: ${task.description}` : null,
      objective ? `OBJECTIVE: ${objective.title}` : null,
      objective?.description ? `OBJECTIVE CONTEXT: ${objective.description}` : null,
      pillarTitle ? `STRATEGIC PILLAR: ${pillarTitle}` : null,
      `FOUNDER: ${profile.full_name}`,
      `COMPANY: Fractional Forge`,
      feedback ? `\nREVISION FEEDBACK FROM FOUNDER:\n${feedback}` : null,
    ].filter(Boolean).join('\n')

    // ── 4. Compile personality + task execution prompt ─────────────
    const personalityPrompt = specialist.personality
      ? compilePersonalityPrompt(specialist.name, specialist.personality, undefined, specialist.id)
      : `You are ${specialist.name}, ${specialist.title}.`

    const disclaimer = needsReviewDisclaimer(specialist.id)

    // INTENT: Voice reinforcement — extract signature phrases so they appear
    // both in the compiled personality AND the execution instructions.
    const voice = specialist.personality?.voice
    const signaturePhrases = voice?.signaturePhrases?.slice(0, 3) ?? []
    const voiceReminder = signaturePhrases.length > 0
      ? `\nVOICE REMINDER: You are ${specialist.name}. Use phrases like "${signaturePhrases.join('", "')}" naturally. A reader should know it's you without seeing your name.`
      : ''

    const executionPrompt = `${personalityPrompt}

---

YOU ARE NOW IN EXECUTION MODE. The founder has delegated a task to you. Your job is to COMPLETE it — not discuss it, not ask questions, not outline options. Produce the actual deliverable.

${disclaimer ? `IMPORTANT: ${disclaimer}\n` : ''}

TASK CONTEXT:
${contextParts}

INSTRUCTIONS:
1. Produce a COMPLETE, ready-to-use deliverable for this task.
2. Start with a brief "## What I Did" summary (2-3 sentences max).
3. Then produce the full deliverable content.
4. Mark anything requiring the founder's judgment with [REVIEW NEEDED] and explain why.
5. Format as clean markdown. Use headings, lists, and tables where appropriate.
6. Be thorough — this should be something the founder can approve and use immediately.
7. Include at least one non-obvious insight or recommendation the founder wouldn't have thought of.
${feedback ? '8. The founder has reviewed a previous version and provided feedback above. Address ALL of their feedback in this revision.' : ''}

Do NOT:
- Ask clarifying questions (make reasonable assumptions and note them)
- Provide multiple options (pick the best one and explain why)
- Give generic advice (be specific to this company and task)
- Pad with filler (every sentence should earn its place)
- Sound like a generic assistant — sound like ${specialist.name}${voiceReminder}`

    // ── 5. Generate deliverable via AI ────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) return { error: 'AI service not configured' }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          // DECISION: Sonnet for task execution. Opus is 2-3x slower/costlier
          // and testing shows Sonnet produces high-quality deliverables.
          // GOTCHA: 4096 was too low — Leo (legal) and Sal (sales) hit the
          // limit on complex deliverables (prospect lists, demo scripts).
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          system: executionPrompt,
          messages: [
            {
              role: "user",
              content: feedback
                ? `Please revise your previous deliverable based on the feedback above. Produce the complete updated version.`
                : `Complete this task now. Produce the full deliverable.`,
            },
          ],
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        console.error('[task-delegation] API error:', response.status)
        return { error: 'Failed to generate deliverable' }
      }

      const data = await response.json()
      const content = (data.content?.[0]?.text ?? "").trim()

      if (!content) return { error: 'Specialist returned empty response' }

      // ── 6. Create artifact ────────────────────────────────────────
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
          isRevision: !!feedback,
        },
      })

      if (artifactError || !artifact) {
        console.error('[task-delegation] Artifact creation failed:', artifactError)
        return { error: artifactError || 'Failed to save deliverable' }
      }

      // ── 7. Link artifact to task + update status ──────────────────
      await supabase
        .from('tasks')
        .update({
          metadata: {
            ...(task as Record<string, unknown>).metadata as Record<string, unknown> | undefined,
            delegation_artifact_id: artifact.id,
            delegated_to: specialist.id,
            delegated_at: new Date().toISOString(),
          },
          status: 'Amended_Pending_Approval',
        })
        .eq('id', taskId)

      return {
        artifactId: artifact.id,
        specialistId: specialist.id,
        specialistName: specialist.name,
      }
    } catch (err) {
      clearTimeout(timeout)
      if (err instanceof Error && err.name === 'AbortError') {
        return { error: 'Request timed out — try again or break the task into smaller pieces' }
      }
      console.error('[task-delegation] Unexpected error:', err)
      return { error: 'Failed to generate deliverable' }
    }
  })
}

/**
 * @description Approves a delegated task's deliverable and marks the task complete.
 */
export async function approveDelegation(taskId: string): Promise<{ error?: string }> {
  return withAuth(async () => {
    const supabase = await createClient()

    const { error } = await supabase
      .from('tasks')
      .update({ status: 'Completed' })
      .eq('id', taskId)

    if (error) return { error: error.message }
    return {}
  })
}

/**
 * @description Rejects a delegated task's deliverable, returning it to Pending.
 */
export async function rejectDelegation(taskId: string): Promise<{ error?: string }> {
  return withAuth(async () => {
    const supabase = await createClient()

    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'Pending',
        metadata: {
          delegation_artifact_id: null,
          delegated_to: null,
          delegated_at: null,
        },
      })
      .eq('id', taskId)

    if (error) return { error: error.message }
    return {}
  })
}
