'use server'

/**
 * Execution Plan Server Actions
 *
 * @description Coordinates multi-specialist task execution from strategy
 * decomposition. Plans link to the existing task system via plan_id FK.
 * A strategist (Sage) produces a plan, which decomposes into tasks
 * assigned to specific specialists.
 *
 * @security All actions use authenticated Supabase client with RLS.
 * Foundry isolation enforced via getFoundryIdCached().
 *
 * @module actions/execution-plans
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

// ============================================================================
// TYPES
// ============================================================================

// INTENT: Keep types non-exported to comply with 'use server' constraint.
// Next.js requires all exports in a 'use server' file to be async functions.

type PlanStatus = 'planning' | 'active' | 'paused' | 'completed'
type TaskType = 'general' | 'content' | 'configuration' | 'code_change' | 'external_action'

interface DecomposeTaskInput {
  title: string
  description: string
  specialistId: string
  taskType: TaskType
  objectiveId?: string
  estimatedDays?: number
}

interface PlanProgress {
  total: number
  completed: number
  in_progress: number
  pending: number
  plan_status: PlanStatus
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Standard auth + foundry check used by every action in this file.
 *
 * @returns Authenticated supabase client, user, and foundryId
 * @throws Returns { error } if auth or foundry lookup fails
 */
async function getAuthContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { error: 'No active foundry' as const }

  return { supabase, user, foundryId, error: null }
}

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Create a new execution plan in 'planning' status.
 *
 * @param title - Plan title (required)
 * @param description - Plan description (optional)
 * @param sourceArtifactId - Links to the strategy artifact that spawned this plan (optional)
 * @returns The new plan's ID, or { error }
 */
export async function createExecutionPlan(
  title: string,
  description?: string,
  sourceArtifactId?: string
): Promise<{ data: { id: string }; error: null } | { data: null; error: string }> {
  try {
    const auth = await getAuthContext()
    if (auth.error) return { data: null, error: auth.error }
    const { supabase, user, foundryId } = auth

    // VALIDATION: title is required and must be non-empty
    const trimmedTitle = title?.trim()
    if (!trimmedTitle) {
      return { data: null, error: 'Plan title is required' }
    }

    const { data, error } = await supabase
      .from('execution_plans')
      .insert({
        foundry_id: foundryId,
        title: trimmedTitle,
        description: description?.trim() || null,
        source_artifact_id: sourceArtifactId || null,
        status: 'planning',
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[ExecutionPlans] Failed to create plan:', sanitizeErrorMessage(error))
      return { data: null, error: sanitizeErrorMessage(error) }
    }

    return { data: { id: data.id }, error: null }
  } catch (err) {
    console.error('[ExecutionPlans] Unexpected error in createExecutionPlan:', err)
    return { data: null, error: sanitizeErrorMessage(err) }
  }
}

/**
 * Decompose a plan into specialist-assigned tasks.
 *
 * @description For each task input, creates a row in the tasks table linked
 * to the plan via plan_id. Prefixes each task title with the specialist name
 * (e.g. "[Mia] Write blog post"). After all tasks are created, updates the
 * plan status to 'active'.
 *
 * @param planId - The execution plan to decompose
 * @param tasks - Array of task definitions with specialist assignments and objective IDs
 * @returns Count of tasks created, or { error }
 */
export async function decomposePlanToTasks(
  planId: string,
  tasks: DecomposeTaskInput[]
): Promise<{ data: { tasksCreated: number }; error: null } | { data: null; error: string }> {
  try {
    const auth = await getAuthContext()
    if (auth.error) return { data: null, error: auth.error }
    const { supabase, user, foundryId } = auth

    // VALIDATION: planId and tasks are required
    if (!planId?.trim()) {
      return { data: null, error: 'Plan ID is required' }
    }
    if (!tasks || tasks.length === 0) {
      return { data: null, error: 'At least one task is required' }
    }

    // SECURITY: Verify plan belongs to this foundry before writing tasks
    const { data: plan, error: planError } = await supabase
      .from('execution_plans')
      .select('id, status')
      .eq('id', planId)
      .eq('foundry_id', foundryId)
      .single()

    if (planError || !plan) {
      return { data: null, error: 'Plan not found or access denied' }
    }

    // Resolve specialist names for task title prefixes
    const specialistIds = Array.from(new Set(tasks.map(t => t.specialistId).filter(Boolean)))
    const specialistNameMap: Record<string, string> = {}

    if (specialistIds.length > 0) {
      const { data: specialists } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', specialistIds)

      if (specialists) {
        for (const s of specialists) {
          specialistNameMap[s.id] = s.full_name || 'Agent'
        }
      }
    }

    // Insert tasks one by one to handle individual failures gracefully
    let tasksCreated = 0
    const errors: string[] = []

    for (const task of tasks) {
      const specialistName = specialistNameMap[task.specialistId] || 'Agent'
      const prefixedTitle = `[${specialistName}] ${task.title}`

      // GOTCHA: task_type and plan_id are new columns that may not be in generated
      // types yet. Use type assertion to bypass strict checking.
      const insertData = {
          foundry_id: foundryId,
          plan_id: planId,
          objective_id: task.objectiveId || null,
          title: prefixedTitle,
          description: task.description || null,
          task_type: task.taskType || 'general',
          status: 'Pending' as const,
          creator_id: user.id,
          specialist_id: task.specialistId, // TEXT column — stores 'growth-marketer', 'sales-lead', etc.
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await supabase
        .from('tasks')
        .insert(insertData as any)

      if (insertError) {
        console.error('[ExecutionPlans] Failed to create task:', sanitizeErrorMessage(insertError))
        errors.push(`Task "${task.title}": ${sanitizeErrorMessage(insertError)}`)
      } else {
        tasksCreated++
      }
    }

    if (tasksCreated === 0) {
      return { data: null, error: `All task inserts failed: ${errors.join('; ')}` }
    }

    // Update plan status to 'active' now that tasks exist
    const { error: updateError } = await supabase
      .from('execution_plans')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', planId)
      .eq('foundry_id', foundryId)

    if (updateError) {
      console.error('[ExecutionPlans] Failed to activate plan:', sanitizeErrorMessage(updateError))
      // Non-fatal: tasks were created, plan status is stale but recoverable
    }

    if (errors.length > 0) {
      console.warn(`[ExecutionPlans] ${errors.length} task(s) failed to create:`, errors)
    }

    return { data: { tasksCreated }, error: null }
  } catch (err) {
    console.error('[ExecutionPlans] Unexpected error in decomposePlanToTasks:', err)
    return { data: null, error: sanitizeErrorMessage(err) }
  }
}

/**
 * Get progress stats for an execution plan.
 *
 * @description Calls the get_plan_progress RPC which returns task counts
 * grouped by status (completed, in_progress, pending) and the plan's
 * overall status.
 *
 * @param planId - The execution plan to query
 * @returns Progress breakdown, or { error }
 */
export async function getPlanProgress(
  planId: string
): Promise<{ data: PlanProgress; error: null } | { data: null; error: string }> {
  try {
    const auth = await getAuthContext()
    if (auth.error) return { data: null, error: auth.error }
    const { supabase } = auth

    if (!planId?.trim()) {
      return { data: null, error: 'Plan ID is required' }
    }

    const { data, error } = await supabase.rpc('get_plan_progress', {
      p_plan_id: planId,
    })

    if (error) {
      console.error('[ExecutionPlans] Failed to get plan progress:', sanitizeErrorMessage(error))
      return { data: null, error: sanitizeErrorMessage(error) }
    }

    // GOTCHA: RPC returns JSONB — Supabase client parses it but the shape
    // needs to be cast since the generated types say Json (unknown).
    const progress = data as unknown as PlanProgress

    return {
      data: {
        total: progress.total ?? 0,
        completed: progress.completed ?? 0,
        in_progress: progress.in_progress ?? 0,
        pending: progress.pending ?? 0,
        plan_status: progress.plan_status ?? 'planning',
      },
      error: null,
    }
  } catch (err) {
    console.error('[ExecutionPlans] Unexpected error in getPlanProgress:', err)
    return { data: null, error: sanitizeErrorMessage(err) }
  }
}

/**
 * Advance a plan to 'completed' if all its tasks are done.
 *
 * @description Checks whether every task linked to the plan has status
 * 'Completed'. If so, updates the plan status. If not, returns the
 * current status unchanged.
 *
 * @param planId - The execution plan to check and potentially complete
 * @returns The plan's status after the check, or { error }
 */
export async function advancePlan(
  planId: string
): Promise<{ data: { status: PlanStatus }; error: null } | { data: null; error: string }> {
  try {
    const auth = await getAuthContext()
    if (auth.error) return { data: null, error: auth.error }
    const { supabase, foundryId } = auth

    if (!planId?.trim()) {
      return { data: null, error: 'Plan ID is required' }
    }

    // SECURITY: Verify plan belongs to this foundry
    const { data: plan, error: planError } = await supabase
      .from('execution_plans')
      .select('id, status')
      .eq('id', planId)
      .eq('foundry_id', foundryId)
      .single()

    if (planError || !plan) {
      return { data: null, error: 'Plan not found or access denied' }
    }

    // Already completed — no-op
    if (plan.status === 'completed') {
      return { data: { status: 'completed' }, error: null }
    }

    // Check all tasks for this plan
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, status')
      .eq('plan_id', planId)
      .is('deleted_at', null)

    if (tasksError) {
      console.error('[ExecutionPlans] Failed to fetch plan tasks:', sanitizeErrorMessage(tasksError))
      return { data: null, error: sanitizeErrorMessage(tasksError) }
    }

    // No tasks means nothing to complete
    if (!tasks || tasks.length === 0) {
      return { data: { status: plan.status as PlanStatus }, error: null }
    }

    const allCompleted = tasks.every(t => t.status === 'Completed')

    if (!allCompleted) {
      return { data: { status: plan.status as PlanStatus }, error: null }
    }

    // All tasks done — mark plan as completed
    const { error: updateError } = await supabase
      .from('execution_plans')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', planId)
      .eq('foundry_id', foundryId)

    if (updateError) {
      console.error('[ExecutionPlans] Failed to complete plan:', sanitizeErrorMessage(updateError))
      return { data: null, error: sanitizeErrorMessage(updateError) }
    }

    return { data: { status: 'completed' }, error: null }
  } catch (err) {
    console.error('[ExecutionPlans] Unexpected error in advancePlan:', err)
    return { data: null, error: sanitizeErrorMessage(err) }
  }
}

/**
 * List all execution plans for the current foundry with progress stats.
 *
 * @description Fetches all plans for the authenticated user's foundry,
 * then enriches each with task progress counts via get_plan_progress RPC.
 *
 * @returns Array of plans with progress, or { error }
 */
export async function getPlansForFoundry(): Promise<
  | { data: Array<{
      id: string
      title: string
      description: string | null
      status: PlanStatus
      sourceArtifactId: string | null
      createdAt: string
      updatedAt: string
      progress: PlanProgress
    }>; error: null }
  | { data: null; error: string }
> {
  try {
    const auth = await getAuthContext()
    if (auth.error) return { data: null, error: auth.error }
    const { supabase, foundryId } = auth

    const { data: plans, error: plansError } = await supabase
      .from('execution_plans')
      .select('id, title, description, status, source_artifact_id, created_at, updated_at')
      .eq('foundry_id', foundryId)
      .order('created_at', { ascending: false })

    if (plansError) {
      console.error('[ExecutionPlans] Failed to fetch plans:', sanitizeErrorMessage(plansError))
      return { data: null, error: sanitizeErrorMessage(plansError) }
    }

    if (!plans || plans.length === 0) {
      return { data: [], error: null }
    }

    // Enrich each plan with progress stats
    // DECISION: Parallel RPC calls for performance. Each call is lightweight
    // (single aggregate query with index on plan_id).
    const enriched = await Promise.all(
      plans.map(async (plan) => {
        const { data: progressData } = await supabase.rpc('get_plan_progress', {
          p_plan_id: plan.id,
        })

        const progress = (progressData as unknown as PlanProgress) || {
          total: 0,
          completed: 0,
          in_progress: 0,
          pending: 0,
          plan_status: plan.status,
        }

        return {
          id: plan.id,
          title: plan.title,
          description: plan.description,
          status: plan.status as PlanStatus,
          sourceArtifactId: plan.source_artifact_id,
          createdAt: plan.created_at,
          updatedAt: plan.updated_at,
          progress: {
            total: progress.total ?? 0,
            completed: progress.completed ?? 0,
            in_progress: progress.in_progress ?? 0,
            pending: progress.pending ?? 0,
            plan_status: (progress.plan_status ?? plan.status) as PlanStatus,
          },
        }
      })
    )

    return { data: enriched, error: null }
  } catch (err) {
    console.error('[ExecutionPlans] Unexpected error in getPlansForFoundry:', err)
    return { data: null, error: sanitizeErrorMessage(err) }
  }
}
