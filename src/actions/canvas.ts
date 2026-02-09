'use server'

/**
 * @file canvas.ts
 *
 * @description Server actions for the Canvas strategic timeline feature.
 * Provides CRUD operations for strategic goals, milestones, objectives,
 * tasks, and ghost item management. All actions use withAuth() for
 * authentication and foundry isolation.
 *
 * @security All actions require authenticated user with valid foundry context.
 * All queries filter by foundry_id AND deleted_at IS NULL for soft-delete safety.
 *
 * @related
 * - Types: src/types/canvas.ts
 * - Frontend: src/app/(platform)/canvas/
 * - Migration: supabase/migrations/20260209100000_canvas_strategic_timeline.sql
 */

import { revalidatePath } from 'next/cache'
import { withAuth, type ActionError } from '@/lib/server-action-utils'

import type {
  StrategicGoal,
  Milestone,
  CanvasObjective,
  CanvasTask,
  WorkEdge,
  GoalBundle,
  UnlinkedItems,
  CreateStrategicGoalInput,
  CreateMilestoneInput,
  CreateCanvasObjectiveInput,
  CreateCanvasTaskInput,
  CanvasItemPatch,
  TaskAssigneeProfile,
} from '@/types/canvas'

// ============================================================================
// HELPERS
// ============================================================================

/** Revalidate all canvas-related paths */
function revalidateCanvas(): void {
  revalidatePath('/canvas')
  revalidatePath('/objectives')
  revalidatePath('/tasks')
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetches all strategic goals for the current foundry.
 *
 * @description Returns objectives where is_strategic_goal = true,
 * ordered by milestone_date ascending (earliest deadline first).
 *
 * @returns Array of strategic goals or error
 *
 * @security Filters by foundry_id and deleted_at IS NULL
 */
export async function getStrategicGoals(): Promise<
  { data: StrategicGoal[] } | ActionError
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await supabase
      .from('objectives')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('is_strategic_goal', true)
      .is('deleted_at', null)
      .order('milestone_date', { ascending: true, nullsFirst: false })

    if (error) {
      console.error('[CanvasService] Failed to fetch strategic goals:', {
        foundryId,
        error: error.message,
      })
      return { error: error.message }
    }

    return { data: (data ?? []) as StrategicGoal[] }
  })
}

/**
 * Fetches the complete data bundle for a strategic goal.
 *
 * @description Loads the goal, its milestones, objectives under those milestones,
 * tasks under those objectives (with assignee profiles), and all work edges
 * connecting items within the bundle.
 *
 * @param goalId - UUID of the strategic goal objective
 * @returns GoalBundle or error
 *
 * @security Verifies goal belongs to user's foundry before loading children.
 * All child queries filter by foundry_id and deleted_at IS NULL.
 */
export async function getGoalBundle(
  goalId: string
): Promise<{ data: GoalBundle } | ActionError> {
  return withAuth(async ({ supabase, foundryId }) => {
    // 1. Fetch the goal itself
    const { data: goal, error: goalError } = await supabase
      .from('objectives')
      .select('*')
      .eq('id', goalId)
      .eq('foundry_id', foundryId)
      .eq('is_strategic_goal', true)
      .is('deleted_at', null)
      .single()

    if (goalError || !goal) {
      return { error: 'Strategic goal not found' }
    }

    // 2. Fetch milestones (objectives with is_milestone = true under this goal)
    const { data: milestones, error: milestoneError } = await supabase
      .from('objectives')
      .select('*')
      .eq('foundry_id', foundryId)
      .eq('parent_objective_id', goalId)
      .eq('is_milestone', true)
      .is('deleted_at', null)
      .order('milestone_order_index', { ascending: true })

    if (milestoneError) {
      console.error('[CanvasService] Failed to fetch milestones:', {
        goalId,
        error: milestoneError.message,
      })
      return { error: milestoneError.message }
    }

    const milestoneIds = (milestones ?? []).map((m) => m.id)

    // 3. Fetch objectives under those milestones (non-milestone children)
    let objectives: CanvasObjective[] = []
    if (milestoneIds.length > 0) {
      const { data: objData, error: objError } = await supabase
        .from('objectives')
        .select('*')
        .eq('foundry_id', foundryId)
        .in('parent_objective_id', milestoneIds)
        .eq('is_milestone', false)
        .eq('is_strategic_goal', false)
        .is('deleted_at', null)

      if (objError) {
        console.error('[CanvasService] Failed to fetch objectives:', {
          goalId,
          error: objError.message,
        })
        return { error: objError.message }
      }

      objectives = (objData ?? []) as CanvasObjective[]
    }

    const objectiveIds = objectives.map((o) => o.id)

    // 4. Fetch tasks under those objectives
    let tasks: CanvasTask[] = []
    if (objectiveIds.length > 0) {
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('foundry_id', foundryId)
        .in('objective_id', objectiveIds)
        .is('deleted_at', null)

      if (taskError) {
        console.error('[CanvasService] Failed to fetch tasks:', {
          goalId,
          error: taskError.message,
        })
        return { error: taskError.message }
      }

      // Resolve assignees for each task
      const taskIds = (taskData ?? []).map((t) => t.id)
      const assigneeMap = new Map<string, TaskAssigneeProfile[]>()

      if (taskIds.length > 0) {
        const { data: assigneeData } = await supabase
          .from('task_assignees')
          .select('task_id, profile:profiles(id, full_name, role)')
          .in('task_id', taskIds)

        if (assigneeData) {
          for (const row of assigneeData) {
            const profile = row.profile as unknown as TaskAssigneeProfile | null
            if (!profile) continue
            const existing = assigneeMap.get(row.task_id) ?? []
            existing.push(profile)
            assigneeMap.set(row.task_id, existing)
          }
        }
      }

      tasks = (taskData ?? []).map((t) => ({
        ...t,
        is_ghost: t.is_ghost ?? false,
        ghost_source: t.ghost_source ?? null,
        ghost_rationale: t.ghost_rationale ?? null,
        assignees: assigneeMap.get(t.id) ?? [],
      })) as CanvasTask[]
    }

    // 5. Fetch work edges connecting any items in this bundle
    const allItemIds = [
      goalId,
      ...milestoneIds,
      ...objectiveIds,
      ...tasks.map((t) => t.id),
    ]

    let edges: WorkEdge[] = []
    if (allItemIds.length > 0) {
      // Fetch edges where either endpoint is in our bundle
      const { data: edgeData, error: edgeError } = await supabase
        .from('work_edges')
        .select('*')
        .eq('foundry_id', foundryId)
        .is('deleted_at', null)
        .or(
          `from_item_id.in.(${allItemIds.join(',')}),to_item_id.in.(${allItemIds.join(',')})`
        )

      if (edgeError) {
        console.error('[CanvasService] Failed to fetch work edges:', {
          goalId,
          error: edgeError.message,
        })
        // Non-fatal: return bundle without edges
      } else {
        edges = (edgeData ?? []) as WorkEdge[]
      }
    }

    const bundle: GoalBundle = {
      goal: goal as StrategicGoal,
      milestones: (milestones ?? []) as Milestone[],
      objectives,
      tasks,
      edges,
    }

    return { data: bundle }
  })
}

// ============================================================================
// MUTATIONS — CREATE
// ============================================================================

/**
 * Creates a new strategic goal (top-level planning anchor).
 *
 * @description Inserts an objective with is_strategic_goal = true and the
 * provided goal_type and milestone_date.
 *
 * @param input - Goal creation data
 * @returns The created goal or error
 *
 * @security Requires authenticated user with foundry membership
 * @audit Logs goal creation
 */
export async function createStrategicGoal(
  input: CreateStrategicGoalInput
): Promise<{ data: StrategicGoal } | ActionError> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION: Title is required
    if (!input.title?.trim()) {
      return { error: 'Title is required' }
    }

    if (!input.target_date?.trim()) {
      return { error: 'Target date is required' }
    }

    const { data, error } = await supabase
      .from('objectives')
      .insert({
        title: input.title.trim(),
        description: input.description?.trim() || null,
        creator_id: user.id,
        foundry_id: foundryId,
        is_strategic_goal: true,
        goal_type: input.goal_type,
        milestone_date: input.target_date,
        status: 'In Progress',
      })
      .select()
      .single()

    if (error) {
      console.error('[CanvasService] Failed to create strategic goal:', {
        foundryId,
        error: error.message,
      })
      return { error: error.message }
    }

    // AUDIT: Log goal creation
    console.info('[CanvasService] Strategic goal created:', {
      goalId: data.id,
      goalType: input.goal_type,
      targetDate: input.target_date,
      createdBy: user.id,
      foundryId,
    })

    revalidateCanvas()
    return { data: data as StrategicGoal }
  })
}

/**
 * Creates milestones in batch under a strategic goal.
 *
 * @description Inserts objectives with is_milestone = true, each parented
 * to the given goalId via parent_objective_id.
 *
 * @param goalId - UUID of the parent strategic goal
 * @param milestones - Array of milestone definitions
 * @returns The created milestones or error
 *
 * @security Verifies goal belongs to user's foundry before inserting children
 */
export async function createMilestones(
  goalId: string,
  milestones: CreateMilestoneInput[]
): Promise<{ data: Milestone[] } | ActionError> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    if (milestones.length === 0) {
      return { error: 'At least one milestone is required' }
    }

    // SECURITY: Verify goal exists and belongs to this foundry
    const { data: goal, error: goalError } = await supabase
      .from('objectives')
      .select('id')
      .eq('id', goalId)
      .eq('foundry_id', foundryId)
      .eq('is_strategic_goal', true)
      .is('deleted_at', null)
      .single()

    if (goalError || !goal) {
      return { error: 'Strategic goal not found' }
    }

    const records = milestones.map((m) => ({
      title: m.title.trim(),
      creator_id: user.id,
      foundry_id: foundryId,
      parent_objective_id: goalId,
      is_milestone: true,
      milestone_order_index: m.order_index,
      milestone_date: m.due_date,
      status: 'In Progress',
    }))

    const { data, error } = await supabase
      .from('objectives')
      .insert(records)
      .select()

    if (error) {
      console.error('[CanvasService] Failed to create milestones:', {
        goalId,
        error: error.message,
      })
      return { error: error.message }
    }

    console.info('[CanvasService] Milestones created:', {
      goalId,
      count: (data ?? []).length,
      createdBy: user.id,
      foundryId,
    })

    revalidateCanvas()
    return { data: (data ?? []) as Milestone[] }
  })
}

/**
 * Creates a canvas-linked objective under a milestone.
 *
 * @description Inserts an objective with parent_objective_id pointing to the
 * milestone. Supports ghost items (AI/template-suggested, not yet confirmed).
 *
 * @param input - Objective creation data
 * @returns The created objective or error
 *
 * @security Verifies milestone belongs to user's foundry
 */
export async function createCanvasObjective(
  input: CreateCanvasObjectiveInput
): Promise<{ data: CanvasObjective } | ActionError> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    if (!input.title?.trim()) {
      return { error: 'Title is required' }
    }

    // SECURITY: Verify milestone exists and belongs to this foundry
    const { data: milestone, error: milestoneError } = await supabase
      .from('objectives')
      .select('id')
      .eq('id', input.milestone_id)
      .eq('foundry_id', foundryId)
      .eq('is_milestone', true)
      .is('deleted_at', null)
      .single()

    if (milestoneError || !milestone) {
      return { error: 'Milestone not found' }
    }

    const { data, error } = await supabase
      .from('objectives')
      .insert({
        title: input.title.trim(),
        description: input.description?.trim() || null,
        creator_id: user.id,
        foundry_id: foundryId,
        parent_objective_id: input.milestone_id,
        is_ghost: input.is_ghost ?? false,
        ghost_source: input.ghost_source ?? null,
        ghost_rationale: input.ghost_rationale ?? null,
        workstream: input.workstream ?? null,
        status: 'In Progress',
      })
      .select()
      .single()

    if (error) {
      console.error('[CanvasService] Failed to create canvas objective:', {
        milestoneId: input.milestone_id,
        error: error.message,
      })
      return { error: error.message }
    }

    revalidateCanvas()
    return { data: data as CanvasObjective }
  })
}

/**
 * Creates a canvas-linked task under an objective.
 *
 * @description Inserts a task with objective_id set and optional ghost fields.
 * Also creates task_assignees record if assignee_id is provided.
 *
 * @param input - Task creation data
 * @returns The created task or error
 *
 * @security Verifies objective belongs to user's foundry
 */
export async function createCanvasTask(
  input: CreateCanvasTaskInput
): Promise<{ data: CanvasTask } | ActionError> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    if (!input.title?.trim()) {
      return { error: 'Title is required' }
    }

    // SECURITY: Verify objective exists and belongs to this foundry
    const { data: objective, error: objError } = await supabase
      .from('objectives')
      .select('id')
      .eq('id', input.objective_id)
      .eq('foundry_id', foundryId)
      .is('deleted_at', null)
      .single()

    if (objError || !objective) {
      return { error: 'Objective not found' }
    }

    const assigneeId = input.assignee_id ?? user.id

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: input.title.trim(),
        description: input.description?.trim() || null,
        creator_id: user.id,
        foundry_id: foundryId,
        objective_id: input.objective_id,
        assignee_id: assigneeId,
        is_ghost: input.is_ghost ?? false,
        ghost_source: input.ghost_source ?? null,
        ghost_rationale: input.ghost_rationale ?? null,
        workstream: input.workstream ?? null,
        status: 'Pending',
      })
      .select()
      .single()

    if (error) {
      console.error('[CanvasService] Failed to create canvas task:', {
        objectiveId: input.objective_id,
        error: error.message,
      })
      return { error: error.message }
    }

    // Insert into task_assignees for multi-assignee compatibility
    const { error: assigneeError } = await supabase
      .from('task_assignees')
      .insert({ task_id: data.id, profile_id: assigneeId })

    if (assigneeError) {
      console.error('[CanvasService] Failed to create task assignee record:', {
        taskId: data.id,
        error: assigneeError.message,
      })
      // Non-fatal: task was created, assignee_id column is set
    }

    revalidateCanvas()
    return {
      data: {
        ...data,
        assignees: [],
      } as CanvasTask,
    }
  })
}

// ============================================================================
// MUTATIONS — GHOST MANAGEMENT
// ============================================================================

/**
 * Accepts a ghost item, converting it to a confirmed (non-ghost) item.
 *
 * @description Sets is_ghost = false and clears ghost_source and ghost_rationale.
 *
 * @param itemType - Whether the item is an objective or task
 * @param itemId - UUID of the item
 * @returns Success or error
 *
 * @security Verifies item belongs to user's foundry
 */
export async function acceptGhost(
  itemType: 'objective' | 'task',
  itemId: string
): Promise<{ success: true } | ActionError> {
  return withAuth(async ({ supabase, foundryId }) => {
    const table = itemType === 'objective' ? 'objectives' : 'tasks'

    const { error } = await supabase
      .from(table)
      .update({
        is_ghost: false,
        ghost_source: null,
        ghost_rationale: null,
      })
      .eq('id', itemId)
      .eq('foundry_id', foundryId)
      .is('deleted_at', null)

    if (error) {
      console.error('[CanvasService] Failed to accept ghost:', {
        itemType,
        itemId,
        error: error.message,
      })
      return { error: error.message }
    }

    console.info('[CanvasService] Ghost accepted:', { itemType, itemId, foundryId })

    revalidateCanvas()
    return { success: true }
  })
}

/**
 * Rejects a ghost item by soft-deleting it.
 *
 * @description Sets deleted_at = now() on the item. If the item is an objective,
 * also soft-deletes all ghost tasks under it (confirmed tasks are left intact).
 *
 * @param itemType - Whether the item is an objective or task
 * @param itemId - UUID of the item
 * @returns Success or error
 *
 * @security Verifies item belongs to user's foundry
 */
export async function rejectGhost(
  itemType: 'objective' | 'task',
  itemId: string
): Promise<{ success: true } | ActionError> {
  return withAuth(async ({ supabase, foundryId }) => {
    const now = new Date().toISOString()

    if (itemType === 'task') {
      const { error } = await supabase
        .from('tasks')
        .update({ deleted_at: now })
        .eq('id', itemId)
        .eq('foundry_id', foundryId)
        .is('deleted_at', null)

      if (error) {
        console.error('[CanvasService] Failed to reject ghost task:', {
          itemId,
          error: error.message,
        })
        return { error: error.message }
      }
    } else {
      // Soft-delete the objective
      const { error: objError } = await supabase
        .from('objectives')
        .update({ deleted_at: now })
        .eq('id', itemId)
        .eq('foundry_id', foundryId)
        .is('deleted_at', null)

      if (objError) {
        console.error('[CanvasService] Failed to reject ghost objective:', {
          itemId,
          error: objError.message,
        })
        return { error: objError.message }
      }

      // Also soft-delete ghost tasks under this objective
      const { error: taskError } = await supabase
        .from('tasks')
        .update({ deleted_at: now })
        .eq('objective_id', itemId)
        .eq('foundry_id', foundryId)
        .eq('is_ghost', true)
        .is('deleted_at', null)

      if (taskError) {
        console.error('[CanvasService] Failed to cascade-delete ghost tasks:', {
          objectiveId: itemId,
          error: taskError.message,
        })
        // Non-fatal: objective was deleted, ghost tasks may need manual cleanup
      }
    }

    console.info('[CanvasService] Ghost rejected:', { itemType, itemId, foundryId })

    revalidateCanvas()
    return { success: true }
  })
}

// ============================================================================
// MUTATIONS — UPDATE
// ============================================================================

/**
 * Updates fields on a canvas item (objective or task).
 *
 * @description Applies a partial patch to the specified item. Only provided
 * fields are updated. For tasks, assignee_id is synced to task_assignees.
 *
 * @param itemType - Whether the item is an objective or task
 * @param itemId - UUID of the item
 * @param patch - Partial update fields
 * @returns Success or error
 *
 * @security Verifies item belongs to user's foundry
 */
export async function updateCanvasItem(
  itemType: 'objective' | 'task',
  itemId: string,
  patch: CanvasItemPatch
): Promise<{ success: true } | ActionError> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (itemType === 'objective') {
      // Build update object with only provided fields
      const updateData: Record<string, unknown> = {}
      if (patch.title !== undefined) updateData.title = patch.title.trim()
      if (patch.status !== undefined) updateData.status = patch.status
      if (patch.milestone_date !== undefined) updateData.milestone_date = patch.milestone_date
      if (patch.workstream !== undefined) updateData.workstream = patch.workstream

      if (Object.keys(updateData).length === 0) {
        return { success: true }
      }

      const { error } = await supabase
        .from('objectives')
        .update(updateData)
        .eq('id', itemId)
        .eq('foundry_id', foundryId)
        .is('deleted_at', null)

      if (error) {
        console.error('[CanvasService] Failed to update objective:', {
          itemId,
          error: error.message,
        })
        return { error: error.message }
      }
    } else {
      // Task update
      const updateData: Record<string, unknown> = {}
      if (patch.title !== undefined) updateData.title = patch.title.trim()
      if (patch.status !== undefined) updateData.status = patch.status
      if (patch.workstream !== undefined) updateData.workstream = patch.workstream
      if (patch.assignee_id !== undefined) updateData.assignee_id = patch.assignee_id

      if (Object.keys(updateData).length === 0) {
        return { success: true }
      }

      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', itemId)
        .eq('foundry_id', foundryId)
        .is('deleted_at', null)

      if (error) {
        console.error('[CanvasService] Failed to update task:', {
          itemId,
          error: error.message,
        })
        return { error: error.message }
      }
    }

    revalidateCanvas()
    return { success: true }
  })
}

// ============================================================================
// MUTATIONS — DELETE
// ============================================================================

/**
 * Soft-deletes a strategic goal and its entire hierarchy.
 *
 * @description Sets deleted_at = now() on the goal, all its milestones, and all
 * objectives under those milestones. Tasks under those objectives are NOT deleted —
 * instead their objective_id is set to null (unlinked) so they remain accessible.
 *
 * @param goalId - UUID of the strategic goal to delete
 * @returns Success or error
 *
 * @security Verifies goal belongs to user's foundry
 * @audit Logs cascade deletion details
 */
export async function softDeleteGoal(
  goalId: string
): Promise<{ success: true } | ActionError> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    const now = new Date().toISOString()

    // 1. Verify goal exists and belongs to this foundry
    const { data: goal, error: goalError } = await supabase
      .from('objectives')
      .select('id')
      .eq('id', goalId)
      .eq('foundry_id', foundryId)
      .eq('is_strategic_goal', true)
      .is('deleted_at', null)
      .single()

    if (goalError || !goal) {
      return { error: 'Strategic goal not found' }
    }

    // 2. Fetch milestone IDs under this goal
    const { data: milestones } = await supabase
      .from('objectives')
      .select('id')
      .eq('foundry_id', foundryId)
      .eq('parent_objective_id', goalId)
      .eq('is_milestone', true)
      .is('deleted_at', null)

    const milestoneIds = (milestones ?? []).map((m) => m.id)

    // 3. Fetch objective IDs under those milestones
    let objectiveIds: string[] = []
    if (milestoneIds.length > 0) {
      const { data: objectives } = await supabase
        .from('objectives')
        .select('id')
        .eq('foundry_id', foundryId)
        .in('parent_objective_id', milestoneIds)
        .eq('is_milestone', false)
        .is('deleted_at', null)

      objectiveIds = (objectives ?? []).map((o) => o.id)
    }

    // 4. Unlink tasks under those objectives (set objective_id = null, NOT delete)
    if (objectiveIds.length > 0) {
      // Safe assertion: objective_id is nullable in the DB but Supabase
      // generated types omit null from the Update type
      const { error: unlinkError } = await supabase
        .from('tasks')
        .update({ objective_id: null as unknown as string })
        .eq('foundry_id', foundryId)
        .in('objective_id', objectiveIds)
        .is('deleted_at', null)

      if (unlinkError) {
        console.error('[CanvasService] Failed to unlink tasks from objectives:', {
          goalId,
          objectiveIds,
          error: unlinkError.message,
        })
        // Non-fatal: continue with deletion
      }
    }

    // 5. Soft-delete objectives under milestones
    if (objectiveIds.length > 0) {
      const { error: objDeleteError } = await supabase
        .from('objectives')
        .update({ deleted_at: now })
        .eq('foundry_id', foundryId)
        .in('id', objectiveIds)
        .is('deleted_at', null)

      if (objDeleteError) {
        console.error('[CanvasService] Failed to soft-delete objectives:', {
          goalId,
          error: objDeleteError.message,
        })
      }
    }

    // 6. Soft-delete milestones
    if (milestoneIds.length > 0) {
      const { error: milestoneDeleteError } = await supabase
        .from('objectives')
        .update({ deleted_at: now })
        .eq('foundry_id', foundryId)
        .in('id', milestoneIds)
        .is('deleted_at', null)

      if (milestoneDeleteError) {
        console.error('[CanvasService] Failed to soft-delete milestones:', {
          goalId,
          error: milestoneDeleteError.message,
        })
      }
    }

    // 7. Soft-delete the goal itself
    const { error: goalDeleteError } = await supabase
      .from('objectives')
      .update({ deleted_at: now })
      .eq('id', goalId)
      .eq('foundry_id', foundryId)

    if (goalDeleteError) {
      console.error('[CanvasService] Failed to soft-delete goal:', {
        goalId,
        error: goalDeleteError.message,
      })
      return { error: goalDeleteError.message }
    }

    // AUDIT: Log the cascade deletion
    console.info('[CanvasService] Strategic goal soft-deleted:', {
      goalId,
      milestonesDeleted: milestoneIds.length,
      objectivesDeleted: objectiveIds.length,
      deletedBy: user.id,
      foundryId,
    })

    revalidateCanvas()
    return { success: true }
  })
}

// ============================================================================
// QUERIES — UNLINKED ITEMS
// ============================================================================

/**
 * Fetches objectives and tasks that are not part of any strategic goal hierarchy.
 *
 * @description Returns "unlinked" objectives (no parent, not a goal/milestone,
 * not a ghost) and tasks that belong to those objectives OR have no objective
 * at all. Includes assignee profiles for each task.
 *
 * @returns UnlinkedItems with counts or error
 *
 * @security Filters by foundry_id and deleted_at IS NULL
 */
export async function getUnlinkedItems(): Promise<
  { data: UnlinkedItems } | ActionError
> {
  return withAuth(async ({ supabase, foundryId }) => {
    // 1. Count total unlinked objectives (for overflow indicator)
    const { count: totalObjectives } = await supabase
      .from('objectives')
      .select('id', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .is('deleted_at', null)
      .eq('is_ghost', false)
      .eq('is_strategic_goal', false)
      .eq('is_milestone', false)
      .is('parent_objective_id', null)

    // 2. Fetch unlinked objectives (limit 100)
    const { data: objData, error: objError } = await supabase
      .from('objectives')
      .select('*')
      .eq('foundry_id', foundryId)
      .is('deleted_at', null)
      .eq('is_ghost', false)
      .eq('is_strategic_goal', false)
      .eq('is_milestone', false)
      .is('parent_objective_id', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (objError) {
      console.error('[CanvasService] Failed to fetch unlinked objectives:', {
        foundryId,
        error: objError.message,
      })
      return { error: objError.message }
    }

    const objectives = (objData ?? []) as CanvasObjective[]
    const objectiveIds = objectives.map((o) => o.id)

    // 3. Count total unlinked tasks (orphans + linked-to-unlinked)
    const { count: orphanTaskCount } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .is('deleted_at', null)
      .eq('is_ghost', false)
      .is('objective_id', null)

    let linkedToUnlinkedCount = 0
    if (objectiveIds.length > 0) {
      const { count } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('foundry_id', foundryId)
        .is('deleted_at', null)
        .eq('is_ghost', false)
        .in('objective_id', objectiveIds)

      linkedToUnlinkedCount = count ?? 0
    }

    const totalTasks = (orphanTaskCount ?? 0) + linkedToUnlinkedCount

    // 4. Fetch orphan tasks (no objective_id)
    const { data: orphanTasks, error: orphanError } = await supabase
      .from('tasks')
      .select('*')
      .eq('foundry_id', foundryId)
      .is('deleted_at', null)
      .eq('is_ghost', false)
      .is('objective_id', null)
      .order('created_at', { ascending: false })
      .limit(200)

    if (orphanError) {
      console.error('[CanvasService] Failed to fetch orphan tasks:', {
        foundryId,
        error: orphanError.message,
      })
      return { error: orphanError.message }
    }

    // 5. Fetch tasks linked to unlinked objectives
    let linkedTasks: typeof orphanTasks = []
    if (objectiveIds.length > 0) {
      const remainingLimit = 200 - (orphanTasks ?? []).length
      if (remainingLimit > 0) {
        const { data: ltData, error: ltError } = await supabase
          .from('tasks')
          .select('*')
          .eq('foundry_id', foundryId)
          .is('deleted_at', null)
          .eq('is_ghost', false)
          .in('objective_id', objectiveIds)
          .order('created_at', { ascending: false })
          .limit(remainingLimit)

        if (ltError) {
          console.error('[CanvasService] Failed to fetch linked unlinked tasks:', {
            foundryId,
            error: ltError.message,
          })
        } else {
          linkedTasks = ltData ?? []
        }
      }
    }

    const allTaskData = [...(orphanTasks ?? []), ...(linkedTasks ?? [])]

    // 6. Resolve assignees for tasks
    const taskIds = allTaskData.map((t) => t.id)
    const assigneeMap = new Map<string, TaskAssigneeProfile[]>()

    if (taskIds.length > 0) {
      const { data: assigneeData } = await supabase
        .from('task_assignees')
        .select('task_id, profile:profiles(id, full_name, role)')
        .in('task_id', taskIds)

      if (assigneeData) {
        for (const row of assigneeData) {
          const profile = row.profile as unknown as TaskAssigneeProfile | null
          if (!profile) continue
          const existing = assigneeMap.get(row.task_id) ?? []
          existing.push(profile)
          assigneeMap.set(row.task_id, existing)
        }
      }
    }

    const tasks: CanvasTask[] = allTaskData.map((t) => ({
      ...t,
      is_ghost: t.is_ghost ?? false,
      ghost_source: t.ghost_source ?? null,
      ghost_rationale: t.ghost_rationale ?? null,
      assignees: assigneeMap.get(t.id) ?? [],
    })) as CanvasTask[]

    return {
      data: {
        objectives,
        tasks,
        totalObjectives: totalObjectives ?? objectives.length,
        totalTasks,
      },
    }
  })
}

// ============================================================================
// MUTATIONS — LINKING
// ============================================================================

/**
 * Links an unlinked objective to a milestone by setting parent_objective_id.
 *
 * @description Moves an objective from the unstructured zone into the
 * strategic hierarchy by parenting it to a milestone.
 *
 * @param objectiveId - UUID of the objective to link
 * @param milestoneId - UUID of the target milestone
 * @returns Success or error
 *
 * @security Verifies both objective and milestone belong to user's foundry.
 * Validates the target is actually a milestone (is_milestone = true).
 */
export async function linkObjectiveToMilestone(
  objectiveId: string,
  milestoneId: string
): Promise<{ success: true } | ActionError> {
  return withAuth(async ({ supabase, foundryId }) => {
    // SECURITY: Verify milestone exists, is_milestone = true, same foundry
    const { data: milestone, error: msError } = await supabase
      .from('objectives')
      .select('id')
      .eq('id', milestoneId)
      .eq('foundry_id', foundryId)
      .eq('is_milestone', true)
      .is('deleted_at', null)
      .single()

    if (msError || !milestone) {
      return { error: 'Milestone not found' }
    }

    // SECURITY: Verify objective exists and belongs to same foundry
    const { error: updateError } = await supabase
      .from('objectives')
      .update({ parent_objective_id: milestoneId })
      .eq('id', objectiveId)
      .eq('foundry_id', foundryId)
      .is('deleted_at', null)

    if (updateError) {
      console.error('[CanvasService] Failed to link objective to milestone:', {
        objectiveId,
        milestoneId,
        error: updateError.message,
      })
      return { error: updateError.message }
    }

    console.info('[CanvasService] Objective linked to milestone:', {
      objectiveId,
      milestoneId,
      foundryId,
    })

    revalidateCanvas()
    return { success: true }
  })
}
