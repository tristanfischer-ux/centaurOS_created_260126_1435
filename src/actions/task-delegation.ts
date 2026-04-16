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
// GOTCHA: Do NOT import createArtifact here. It uses getFoundryIdCached()
// which relies on React.cache — doesn't work in API route context.
// Artifacts are created via direct supabase insert in _delegateInner.
import { buildContextLayers } from '@/lib/agents/prompt-builder'
import { buildAIContextWithServiceClient } from '@/lib/agents/sweep-context'

// ─── Types ──────────────────────────────────────────────────────────

interface DelegationResult {
  artifactId?: string
  specialistId?: string
  specialistName?: string
  error?: string
}

// ─── Helpers ────────────────────────────────────────────────────────

// DECISION: Map task domain keywords to artifact content types.
// Universal coverage — every task category maps to an appropriate artifact type.
function inferContentType(title: string, description: string): 'document' | 'report' | 'checklist' | 'email' | 'presentation' {
  const combined = `${title} ${description}`.toLowerCase()
  // Research and data-heavy tasks → report (structured, tablular)
  if (/research|prospect|search|find|mine|compile|list|directory|analys|survey|benchmark|competitor|market/i.test(combined)) return 'report'
  // Compliance, QA, and verification tasks → checklist
  if (/checklist|audit|review|check|verify|test|compliance|gdpr|security|standards/i.test(combined)) return 'checklist'
  // Outreach, communications, and email tasks → email
  if (/email|outreach|message|linkedin|send|batch|follow.up|sequence|campaign|cold/i.test(combined)) return 'email'
  // Pitch, investor, and presentation tasks → presentation
  if (/pitch|investor|deck|presentation|board.update|weekly.report|demo.script/i.test(combined)) return 'presentation'
  // Everything else → document (blog posts, pages, case studies, specs, etc.)
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
// INTENT: Inner delegation logic exposed for API routes which handle
// their own auth. Accepts pre-authenticated supabase client + user.
export async function delegateTaskWithContext(
  taskId: string,
  user: { id: string },
  supabase: Awaited<ReturnType<typeof createClient>>,
  specialistIdOverride?: string,
  feedback?: string,
): Promise<DelegationResult> {
  return _delegateInner(taskId, user, supabase, specialistIdOverride, feedback)
}

export async function delegateTaskToSpecialist(
  taskId: string,
  specialistIdOverride?: string,
  feedback?: string,
): Promise<DelegationResult> {
  return withAuth(async ({ user }) => {
    const supabase = await createClient()
    return _delegateInner(taskId, user, supabase, specialistIdOverride, feedback)
  })
}

async function _delegateInner(
  taskId: string,
  user: { id: string },
  supabase: Awaited<ReturnType<typeof createClient>>,
  specialistIdOverride?: string,
  feedback?: string,
): Promise<DelegationResult> {

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
        id, title, description, status, objective_id, metadata,
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

    // ── 3. Build RICH context (same depth as specialist chat) ──────
    // DECISION: The chat system injects 10 context layers (company profile,
    // knowledge vault, decision journal, founder preferences, etc.). Previous
    // delegation only had 5 lines of context → deliverables were "OK" not
    // "incredible." Now we inject the same rich context.
    const taskContext = [
      `TASK: ${task.title}`,
      task.description ? `DESCRIPTION: ${task.description}` : null,
      objective ? `OBJECTIVE: ${objective.title}` : null,
      objective?.description ? `OBJECTIVE CONTEXT: ${objective.description}` : null,
      pillarTitle ? `STRATEGIC PILLAR: ${pillarTitle}` : null,
      `FOUNDER: ${profile.full_name}`,
      feedback ? `\nREVISION FEEDBACK FROM FOUNDER:\n${feedback}` : null,
    ].filter(Boolean).join('\n')

    // Fetch company intelligence (purpose, profile, products, team)
    let companyContext = ''
    try {
      companyContext = await buildAIContextWithServiceClient(profile.foundry_id)
    } catch {
      companyContext = '\n--- Business Context ---\nFractional Forge — AI manufacturing platform for hardware startups\n--- End Business Context ---\n'
    }

    // Fetch specialist-specific context layers (knowledge, decisions, preferences)
    let specialistContext = ''
    try {
      const { contextBlocks } = await buildContextLayers({
        foundryId: profile.foundry_id,
        specialistId,
        threadId: null,
        input: `${task.title} ${task.description || ''}`,
        finalPrompt: taskContext,
        isConversationalFastPath: false,
      })
      specialistContext = contextBlocks
    } catch {
      // Non-critical — specialist operates without enrichment
    }

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

${companyContext}

${specialistContext}

---

YOU ARE NOW IN EXECUTION MODE. The founder has delegated a task to you. Your job is to COMPLETE it — not discuss it, not ask questions, not outline options. Produce the actual deliverable.

The founder's expectation is: "Oh my god, there's no way I could have done this on my own." Not "this is OK." You are a senior specialist, not a junior assistant. Your output should be genuinely impressive.

${disclaimer ? `IMPORTANT: ${disclaimer}\n` : ''}

TASK CONTEXT:
${taskContext}

REAL PRODUCT DATA (use these exact names and numbers, never placeholders):
- Pricing: Explorer (free, 50 tasks), Seed (£19/mo, 250 tasks), Startup Team (£49/mo, 750 tasks), Professional (£149/mo, 2,500 tasks), Enterprise (£499/mo, 10,000 tasks)
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
${feedback ? '11. The founder has reviewed a previous version and provided feedback. Address ALL feedback.' : ''}

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
          // DECISION: Opus for high-judgment specialists AND data-heavy specialists.
          // Round 3 testing: Opus scored 23-25/25 on strategy/legal tasks. Sal's prospect
          // lists keep truncating with Sonnet (31KB+ incomplete). Opus produces more
          // proportionate output that respects the 15KB scope cap.
          // Sonnet is faster/cheaper for marketing content (Mia, Cal, Max, etc.).
          model: ['legal-counsel', 'finance-lead', 'fundraising-advisor', 'strategist', 'sales-lead'].includes(specialistId)
            ? 'claude-opus-4-6'
            : 'claude-sonnet-4-6',
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

      // ── 6. Create artifact DIRECTLY via supabase (not createArtifact server action) ──
      // CRITICAL: createArtifact() uses getFoundryIdCached() → React.cache which
      // doesn't work in API routes. This caused EVERY delegation to fail silently
      // with "No active foundry". Insert directly using the passed-in supabase client.
      const contentType = inferContentType(task.title, task.description || '')
      const { data: artifact, error: artifactError } = await supabase
        .from('agent_artifacts')
        .insert({
          foundry_id: profile.foundry_id,
          created_by: user.id,
          title: `${specialist.name}: ${task.title}`,
          content,
          content_type: contentType,
          metadata: {
            taskId: task.id,
            specialistId: specialist.id,
            specialistName: specialist.name,
            delegatedAt: new Date().toISOString(),
            isRevision: !!feedback,
          },
        })
        .select('id')
        .single()

      if (artifactError || !artifact) {
        console.error('[task-delegation] Artifact creation failed:', artifactError?.message)
        return { error: artifactError?.message || 'Failed to save deliverable' }
      }

      // ── 7. Link artifact to task + update status ──────────────────
      // GOTCHA: metadata must be MERGED, not overwritten, to preserve
      // source_thread_id, rollout_id, and other fields set elsewhere.
      const existingMetadata = (task.metadata ?? {}) as Record<string, unknown>
      await supabase
        .from('tasks')
        .update({
          // GOTCHA: Can't set assignee_id to specialist.profileId because
          // tasks.assignee_id has FK to profiles(id), not specialist_profiles.
          // Store specialist info in metadata instead; UI reads from there.
          metadata: {
            ...existingMetadata,
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

    // GOTCHA: Must MERGE metadata to preserve source_thread_id, rollout_id, etc.
    // Only clear delegation-specific fields.
    const { data: existing } = await supabase
      .from('tasks')
      .select('metadata')
      .eq('id', taskId)
      .single()

    const existingMetadata = (existing?.metadata ?? {}) as Record<string, unknown>

    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'Pending',
        metadata: {
          ...existingMetadata,
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
