'use server'

/**
 * @file plan-generator.ts
 * 
 * @description Server actions for the "One Sentence to Full Plan" feature.
 * Takes a single sentence and generates a complete strategic plan preview
 * using AI. The plan is NOT saved until the user confirms.
 * 
 * @security All actions require authentication and enforce foundry isolation
 * @audit Plan generation events logged via console
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'
import { withAIGate } from '@/lib/ai/with-ai-gate'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { buildAIContext } from '@/lib/ai-context/builder'
import { callGemini } from '@/lib/cad-lab/api-helpers'
import type { Json } from '@/types/database.types'

// ─── Types ────────────────────────────────────────────────────────

/** A single task within a generated plan phase */
export interface GeneratedTask {
  title: string
  description: string
  durationDays: number
  suggestedRole: string
  riskLevel: 'Low' | 'Medium' | 'High'
}

/** A phase within the generated plan */
export interface GeneratedPhase {
  title: string
  description: string
  tasks: GeneratedTask[]
  startWeek: number
  endWeek: number
}

/** The full generated plan preview (not yet saved) */
export interface GeneratedPlan {
  title: string
  description: string
  suggestedDeadline: string
  totalWeeks: number
  phases: GeneratedPhase[]
  keyRisks: string[]
  quickWins: string[]
}

// ─── Generate Plan from Sentence ──────────────────────────────────

/**
 * Generates a complete strategic plan from a single sentence.
 * 
 * @description Takes a user's goal description and uses AI to create
 * a structured plan with phases, tasks, timeline, and risk analysis.
 * The plan is returned as a preview — NOT saved to the database.
 * 
 * @param sentence - The user's goal in natural language (e.g., "Launch a DTC coffee brand by September")
 * @returns Generated plan preview or error
 * 
 * @security Requires authenticated user with foundry membership
 * @audit Logs plan generation events
 */
export async function generatePlanFromSentence(
  sentence: string
): Promise<{ plan?: GeneratedPlan; error?: string }> {
  return withAIGate('plan_generator', async ({ supabase, user, foundryId }) => {
    // SECURITY: Rate limit AI calls
    const rateLimitError = await checkRateLimit('aiStrategicPlan', `ai:${user.id}`)
    if (rateLimitError) return { error: rateLimitError }

    // VALIDATION: Input bounds
    if (!sentence?.trim() || sentence.trim().length < 5) {
      return { error: 'Please describe your goal in a few words.' }
    }
    if (sentence.length > 500) {
      return { error: 'Please keep your description under 500 characters.' }
    }

    console.info('[PlanGenerator] Generating plan from sentence:', {
      userId: user.id,
      foundryId,
      sentenceLength: sentence.length,
    })

    // Build company context for personalization
    const companyContext = await buildAIContext(foundryId, user.id, {
      includeActivity: false,
      includeObjectives: true,
    })

    // Fetch team for role suggestions
    const { data: members } = await supabase
      .from('foundry_memberships')
      .select(`
        role,
        profiles!inner(full_name, role, skills, expertise_areas)
      `)
      .eq('foundry_id', foundryId)

    const teamRoles = members?.map((m) => {
      const p = m.profiles as unknown as {
        full_name: string | null
        role: string | null
        skills: string[] | null
      }
      return `${p.full_name || 'Unknown'} (${m.role})`
    }).join(', ') || 'No team members yet'

    const today = new Date().toISOString().split('T')[0]

    const systemPrompt = `You are a world-class strategic planning advisor. Given a single sentence describing someone's goal, create a complete, actionable plan.

Today's date is ${today}.
${companyContext}
Team: ${teamRoles}

Create a plan that is practical, well-sequenced, and achievable. Think like an experienced COO who has launched dozens of similar initiatives.

Respond with ONLY valid JSON (no markdown, no code fences) matching this schema:
{
  "title": "Clear, action-oriented plan title",
  "description": "2-3 sentence description of the plan and approach",
  "suggestedDeadline": "YYYY-MM-DD (realistic deadline based on scope)",
  "totalWeeks": number,
  "phases": [
    {
      "title": "Phase name",
      "description": "What this phase accomplishes",
      "startWeek": 1,
      "endWeek": 3,
      "tasks": [
        {
          "title": "Specific, actionable task",
          "description": "What needs to be done and why",
          "durationDays": 5,
          "suggestedRole": "Founder/Executive/Marketing Lead/Developer/etc.",
          "riskLevel": "Low" | "Medium" | "High"
        }
      ]
    }
  ],
  "keyRisks": ["Top 3-5 risks to watch for"],
  "quickWins": ["2-3 things they can do TODAY to start momentum"]
}

Rules:
- 3-5 phases, each with 2-5 tasks
- Total 10-20 tasks (enough to be useful, not overwhelming)
- Phases should be sequential with clear handoffs
- Each task must be concrete and actionable (not vague like "do research")
- QuickWins should be things completable in <1 hour
- suggestedRole should match common small-team roles
- Be opinionated about timeline — give a realistic estimate`

    try {
      const { text: content } = await callGemini(
        systemPrompt,
        `User goal: ${sentence}`,
        'google/gemini-flash-1.5-8b',
        3000,
        60_000,
      )
      if (!content) {
        return { error: 'AI returned empty response. Please try again.' }
      }

      const plan = JSON.parse(content) as GeneratedPlan

      // VALIDATION: Ensure plan structure
      if (!plan.phases || plan.phases.length === 0) {
        return { error: 'AI generated an empty plan. Please try with more detail.' }
      }

      console.info('[PlanGenerator] Plan generated:', {
        userId: user.id,
        title: plan.title,
        phases: plan.phases.length,
        totalTasks: plan.phases.reduce((sum, p) => sum + p.tasks.length, 0),
      })

      return { plan }
    } catch (err) {
      console.error('[PlanGenerator] AI generation failed:', {
        error: err instanceof Error ? err.message : 'Unknown error',
      })
      return { error: 'Failed to generate plan. Please try again.' }
    }
  }) as Promise<{ plan?: GeneratedPlan; error?: string }>
}

// ─── Apply Generated Plan ─────────────────────────────────────────

/**
 * Takes a generated plan preview and creates objectives + tasks in the database.
 * 
 * @description Converts the AI-generated plan into real objectives and tasks,
 * creating a strategic goal with child phase objectives and their tasks.
 * 
 * @param plan - The generated plan to apply
 * @returns The created strategic goal objective ID or error
 * 
 * @security Requires authenticated user with foundry membership
 * @audit Logs all created entities
 */
export async function applyGeneratedPlan(
  plan: GeneratedPlan
): Promise<{ objectiveId?: string; error?: string }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION
    if (!plan?.title?.trim()) {
      return { error: 'Plan title is required' }
    }
    if (!plan.phases?.length) {
      return { error: 'Plan must have at least one phase' }
    }

    console.info('[PlanGenerator] Applying plan:', {
      userId: user.id,
      foundryId,
      title: plan.title,
      phases: plan.phases.length,
    })

    // 1. Create the strategic goal (top-level objective)
    const { data: goalObj, error: goalError } = await supabase
      .from('objectives')
      .insert({
        title: plan.title,
        description: plan.description,
        is_strategic_goal: true,
        milestone_date: plan.suggestedDeadline,
        creator_id: user.id,
        foundry_id: foundryId,
        status: 'In Progress',
        progress: 0,
      })
      .select('id')
      .single()

    if (goalError || !goalObj) {
      console.error('[PlanGenerator] Failed to create goal:', goalError?.message)
      return { error: 'Failed to create plan. Please try again.' }
    }

    // 2. Create phases as child objectives with tasks
    let totalTasksCreated = 0
    for (const phase of plan.phases) {
      const { data: phaseObj, error: phaseError } = await supabase
        .from('objectives')
        .insert({
          title: phase.title,
          description: phase.description,
          parent_objective_id: goalObj.id,
          creator_id: user.id,
          foundry_id: foundryId,
          status: 'In Progress',
          progress: 0,
        })
        .select('id')
        .single()

      if (phaseError || !phaseObj) {
        console.error('[PlanGenerator] Failed to create phase:', {
          phase: phase.title,
          error: phaseError?.message,
        })
        continue
      }

      // Create tasks for this phase
      for (const task of phase.tasks) {
        const startDate = new Date()
        startDate.setDate(startDate.getDate() + ((phase.startWeek - 1) * 7))
        const endDate = new Date(startDate)
        endDate.setDate(endDate.getDate() + task.durationDays)

        const { error: taskError } = await supabase
          .from('tasks')
          .insert({
            title: task.title,
            description: task.description,
            objective_id: phaseObj.id,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
            risk_level: task.riskLevel,
            creator_id: user.id,
            foundry_id: foundryId,
            status: 'Pending',
          })

        if (taskError) {
          console.error('[PlanGenerator] Failed to create task:', {
            task: task.title,
            error: taskError.message,
          })
          continue
        }
        totalTasksCreated++
      }
    }

    console.info('[PlanGenerator] Plan applied:', {
      objectiveId: goalObj.id,
      tasksCreated: totalTasksCreated,
    })

    revalidatePath('/new-objectives')
    revalidatePath('/new-tasks')
    revalidatePath('/canvas')

    return { objectiveId: goalObj.id }
  }) as Promise<{ objectiveId?: string; error?: string }>
}
