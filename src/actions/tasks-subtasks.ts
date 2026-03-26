'use server'

/**
 * @file tasks-subtasks.ts — Subtask/checklist and task sharing actions.
 *
 * @description Extracted from tasks.ts to reduce file size. Contains:
 * createSubtask, toggleSubtaskComplete, getSubtasks, getSubtaskCounts, getTaskShares.
 *
 * @security All queries filter by foundry_id. Uses withAuth() for multi-tenant isolation.
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { canModifyTask, recalculateObjectiveProgress } from '@/actions/tasks'

// ─── Subtask / Checklist Actions ─────────────────────────────────

/**
 * Creates a subtask under a parent task.
 *
 * @description Inherits foundry_id and objective_id from the parent task.
 * The subtask is a regular task with parent_task_id set.
 *
 * @param parentTaskId - The parent task ID
 * @param title - Subtask title
 * @returns The created subtask or error
 *
 * @security Requires permission to modify the parent task via canModifyTask.
 */
export async function createSubtask(parentTaskId: string, title: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        if (!title?.trim()) return { error: 'Title is required' }

        // AUTH: Check user can modify the parent task
        const authCheck = await canModifyTask(supabase, parentTaskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        // Fetch parent to inherit objective_id
        const { data: parent, error: parentError } = await supabase
            .from('tasks')
            .select('objective_id, foundry_id')
            .eq('id', parentTaskId)
            .eq('foundry_id', foundryId)
            .single()

        if (parentError || !parent) return { error: 'Parent task not found' }

        const { data, error } = await supabase
            .from('tasks')
            .insert({
                title: title.trim(),
                foundry_id: foundryId,
                objective_id: parent.objective_id,
                creator_id: user.id,
                parent_task_id: parentTaskId,
                status: 'Pending',
                risk_level: 'Low',
            })
            .select('id, title, status, assignee_id, end_date, parent_task_id, assignee:profiles!assignee_id(id, full_name, role)')
            .single()

        if (error) return { error: sanitizeErrorMessage(error) }

        revalidatePath('/new-tasks')
        return { data }
    })
}

/**
 * Toggles a subtask between 'Completed' and 'Pending' status.
 *
 * @param taskId - The subtask ID to toggle
 * @returns Updated status or error
 *
 * @security Requires permission to modify the task via canModifyTask.
 */
export async function toggleSubtaskComplete(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        const { data: task, error: fetchError } = await supabase
            .from('tasks')
            .select('status, parent_task_id')
            .eq('id', taskId)
            .eq('foundry_id', foundryId)
            .single()

        if (fetchError || !task) return { error: 'Task not found' }

        const newStatus = task.status === 'Completed' ? 'Pending' : 'Completed'
        const updates: Record<string, unknown> = { status: newStatus }
        if (newStatus === 'Completed') {
            updates.end_date = new Date().toISOString()
        }

        const { error: updateError } = await supabase
            .from('tasks')
            .update(updates)
            .eq('id', taskId)
            .eq('foundry_id', foundryId)

        if (updateError) return { error: sanitizeErrorMessage(updateError) }

        // Recalculate objective progress
        try {
            await recalculateObjectiveProgress(supabase, taskId, foundryId)
        } catch (e) {
            console.error('[TaskService] Failed to recalculate after subtask toggle:', e)
        }

        revalidatePath('/new-tasks')
        return { data: { status: newStatus } }
    })
}

/**
 * Fetches all subtasks for a parent task.
 *
 * @param parentTaskId - The parent task ID
 * @returns Array of subtasks with assignee info
 *
 * @security Scoped to user's foundry via withAuth.
 */
export async function getSubtasks(parentTaskId: string) {
    return withAuth(async ({ supabase, foundryId }) => {
        const { data, error } = await supabase
            .from('tasks')
            .select('id, title, status, assignee_id, end_date, parent_task_id, assignee:profiles!assignee_id(id, full_name, role)')
            .eq('parent_task_id', parentTaskId)
            .eq('foundry_id', foundryId)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })

        if (error) return { data: null, error: sanitizeErrorMessage(error) }
        return { data }
    })
}

/**
 * Gets subtask counts for multiple parent tasks in a single query.
 * Used by the kanban board to show progress indicators on cards.
 *
 * @param taskIds - Array of task IDs to check for subtasks
 * @returns Map of taskId -> { total, completed }
 *
 * @security Scoped to user's foundry via withAuth.
 */
export async function getSubtaskCounts(taskIds: string[]) {
    return withAuth(async ({ supabase, foundryId }) => {
        if (!taskIds.length) return { data: {} }

        const { data, error } = await supabase
            .from('tasks')
            .select('parent_task_id, status')
            .in('parent_task_id', taskIds)
            .eq('foundry_id', foundryId)
            .is('deleted_at', null)

        if (error) return { data: null, error: sanitizeErrorMessage(error) }

        const counts: Record<string, { total: number; completed: number }> = {}
        for (const row of data || []) {
            if (!row.parent_task_id) continue
            if (!counts[row.parent_task_id]) {
                counts[row.parent_task_id] = { total: 0, completed: 0 }
            }
            counts[row.parent_task_id].total++
            if (row.status === 'Completed') {
                counts[row.parent_task_id].completed++
            }
        }

        return { data: counts }
    })
}

export async function getTaskShares(taskId: string) {
    return withAuth(async ({ supabase, foundryId }) => {
        // AUTH: Verify task belongs to user's foundry before returning shares
        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('id')
            .eq('id', taskId)
            .eq('foundry_id', foundryId)
            .single()

        if (taskError || !task) return { data: [], error: 'Task not found or access denied' }

        const { data: shares, error } = await supabase
            .from('task_shares')
            .select(`
                shared_with_user_id,
                shared_with_team_id,
                user:profiles!shared_with_user_id(id, full_name),
                team:teams!shared_with_team_id(id, name)
            `)
            .eq('task_id', taskId)

        if (error) return { data: [], error: 'Failed to fetch shares' }

        const targets = (shares || []).map(s => {
            if (s.shared_with_user_id && s.user) {
                return { type: 'user' as const, id: s.shared_with_user_id, name: (s.user as { full_name: string }).full_name || 'Unknown' }
            }
            if (s.shared_with_team_id && s.team) {
                return { type: 'team' as const, id: s.shared_with_team_id, name: (s.team as { name: string }).name || 'Unknown' }
            }
            return null
        }).filter(Boolean) as { type: 'user' | 'team'; id: string; name: string }[]

        return { data: targets }
    })
}
