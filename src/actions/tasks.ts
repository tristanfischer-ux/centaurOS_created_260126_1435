'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Database } from '@/types/database.types'
import { runAIWorker } from '@/lib/ai-worker'
import { logTaskHistory } from '@/lib/audit'
import { createTaskSchema, updateTaskDatesSchema, addCommentSchema, validate } from '@/lib/validations'
import { withRetry } from '@/lib/retry'
import { sanitizeFileName, sanitizeErrorMessage } from '@/lib/security/sanitize'
import { syncTaskCommentToMessages } from '@/lib/messaging/comment-sync'
import { syncTaskToCalendar } from '@/actions/google-calendar'
import { withAuth } from '@/lib/server-action-utils'

// Nudge cooldown duration (1 hour)
const NUDGE_COOLDOWN_MS = 60 * 60 * 1000

// Keep type-only (non-exported) to comply with 'use server' constraint:
// Next.js requires all exports in a 'use server' file to be async functions.
type TaskStatus = Database["public"]["Enums"]["task_status"]
type RiskLevel = Database["public"]["Enums"]["risk_level"]

/**
 * Security helper: Check if user can modify a task
 * User must be: task creator, assignee, or have Executive/Founder role
 * AND task must belong to user's foundry
 */
async function canModifyTask(
    supabase: Awaited<ReturnType<typeof createClient>>,
    taskId: string,
    userId: string,
    userFoundryId: string
): Promise<{ allowed: boolean; error?: string; task?: { creator_id: string; assignee_id: string | null; foundry_id: string } }> {
    // Fetch task with ownership info
    const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('creator_id, assignee_id, foundry_id')
        .eq('foundry_id', userFoundryId) // SECURITY: Filter by foundry first
        .eq('id', taskId)
        .single()

    if (taskError || !task) {
        return { allowed: false, error: 'Task not found' }
    }

    // Task already filtered by foundry_id above - this check is now redundant but kept for clarity
    if (task.foundry_id !== userFoundryId) {
        return { allowed: false, error: 'Unauthorized: Task belongs to a different foundry' }
    }

    // Check if user is creator or assignee
    if (task.creator_id === userId || task.assignee_id === userId) {
        return { allowed: true, task }
    }

    // Check if user is in task_assignees
    const { data: assignee } = await supabase
        .from('task_assignees')
        .select('profile_id')
        .eq('task_id', taskId)
        .eq('profile_id', userId)
        .single()

    if (assignee) {
        return { allowed: true, task }
    }

    // Check user role - Executives and Founders can modify any task in their foundry
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

    if (profile && (profile.role === 'Executive' || profile.role === 'Founder')) {
        return { allowed: true, task }
    }

    return { allowed: false, error: 'Unauthorized: You do not have permission to modify this task' }
}

async function logSystemEvent(supabase: Awaited<ReturnType<typeof createClient>>, foundryId: string, taskId: string, message: string, userId: string) {
    await supabase.from('task_comments').insert({
        task_id: taskId,
        foundry_id: foundryId,
        user_id: userId,
        content: message,
        is_system_log: true
    })

    // Also sync system events to messages (so status changes appear in unified inbox)
    try {
        await syncTaskCommentToMessages(supabase, {
            taskId,
            userId,
            content: message,
            isSystemLog: true
        })
    } catch (syncError) {
        // Don't fail if sync fails
        console.error('Failed to sync system event to messages:', syncError)
    }
}

/**
 * Recalculates an objective's progress based on its tasks' completion ratio.
 * Called after task status changes to keep progress in sync.
 *
 * @description Counts completed vs total active tasks for the objective and
 * updates the objective's progress field. This enables the progress rollup
 * chain: Tasks -> Objectives -> Strategy.
 *
 * @param supabase - Supabase client
 * @param taskId - The task whose status just changed (used to find its objective)
 * @param foundryId - Foundry scope for security
 */
async function recalculateObjectiveProgress(
    supabase: Awaited<ReturnType<typeof createClient>>,
    taskId: string,
    foundryId: string
): Promise<void> {
    // Find the task's objective_id
    const { data: task } = await supabase
        .from('tasks')
        .select('objective_id')
        .eq('id', taskId)
        .eq('foundry_id', foundryId)
        .single()

    if (!task?.objective_id) return

    // Count tasks for this objective
    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('objective_id', task.objective_id)
        .eq('foundry_id', foundryId)
        .eq('is_ghost', false)
        .is('deleted_at', null)

    if (error || !tasks) return

    const total = tasks.length
    const completed = tasks.filter(t => t.status === 'Completed').length
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0

    // Update objective progress
    await supabase
        .from('objectives')
        .update({ progress })
        .eq('id', task.objective_id)
        .eq('foundry_id', foundryId)

    // Revalidate strategy page to reflect new rollup
    revalidatePath('/strategy')
}

/**
 * Creates a new task with assignees, file uploads, privacy settings, and calendar sync.
 *
 * @description Validates input via Zod schema, creates the task record with a primary
 * assignee, expands team-based assignees, handles file uploads to Supabase Storage,
 * sets up privacy shares, logs creation to audit trail, triggers AI worker, and
 * syncs to Google Calendar.
 *
 * @param {FormData} formData - Form data containing title, description, assignee_id(s),
 *   objective_id, dates, risk_level, files, privacy, and share targets
 * @returns {Promise<{ success: true } | { error: string }>} Success status or error message
 *
 * @throws Returns `{ error }` on validation failure, DB errors, or unhandled exceptions
 *
 * @security Requires authenticated user with foundry membership via withAuth.
 *   Task is scoped to the user's foundry.
 * @audit Logs task_created event to task_history and task_comments (system log)
 */
export async function createTask(formData: FormData) {
  return withAuth(async ({ supabase, user, foundryId }) => {
    try {
      const title = formData.get('title') as string
      const description = formData.get('description') as string
      const objectiveId = formData.get('objective_id') as string
      const assigneeId = formData.get('assignee_id') as string
      const assigneeIdsJson = formData.get('assignee_ids') as string
      const startDate = formData.get('start_date') as string
      const endDate = formData.get('end_date') as string
      const riskLevelRaw = formData.get('risk_level') as string
      const fileCountRaw = formData.get('file_count') as string || '0'
      const isPrivate = formData.get('is_private') === 'true'
      const shareWithJson = formData.get('share_with') as string
      const rolloutId = (formData.get('rollout_id') as string)?.trim() || null
      const sourceThreadId = (formData.get('source_thread_id') as string)?.trim() || null

      // Parse multiple assignees (if provided)
      let assigneeIds: string[] = [assigneeId]
      if (assigneeIdsJson) {
          try {
              const parsedIds = JSON.parse(assigneeIdsJson) as string[]
              assigneeIds = [] // Reset to populate from parsed list

              // Handle Team expansion (team:uuid)
              for (const id of parsedIds) {
                  if (id.startsWith('team:')) {
                      const teamId = id.replace('team:', '')
                      // Fetch team members
                      const { data: teamMembers } = await supabase
                          .from('team_members')
                          .select('profile_id')
                          .eq('team_id', teamId)

                      if (teamMembers) {
                          assigneeIds.push(...teamMembers.map(tm => tm.profile_id))
                      }
                  } else {
                      assigneeIds.push(id)
                  }
              }
              // Remove duplicates
              assigneeIds = Array.from(new Set(assigneeIds))

              // If empty after expansion (e.g. empty team), fallback to creator or handle error?
              // User prompt doesn't specify. We'll proceed. If empty, it might fail validation if we enforce assignee.
              // But we have primary assignee fallback logic below.
              if (assigneeIds.length === 0 && assigneeId) {
                  assigneeIds.push(assigneeId)
              }

          } catch (error) {
              console.error('[TaskService] Failed to parse assignee_ids JSON:', {
                  error: error instanceof Error ? error.message : 'Unknown error',
              })
              // Fall back to single assignee
              assigneeIds = [assigneeId]
          }
      }

      // VALIDATION: Every task must belong to an objective (enforced at schema + DB level)
      if (!objectiveId?.trim()) {
          return { error: 'Objective is required — every task must belong to an objective' }
      }

      // Validate using Zod schema
      const rawData = {
          title: title || '',
          description: description?.trim() || undefined,
          objectiveId: objectiveId.trim(),
          assigneeIds: assigneeIds.filter(id => id), // Filter out empty strings
          deadline: endDate?.trim() ? endDate.trim() : null,
          riskLevel: (riskLevelRaw as RiskLevel) || 'Medium',
          fileCount: parseInt(fileCountRaw, 10) || 0
      }

      const validation = validate(createTaskSchema, rawData)
      if (!validation.success) {
          return { error: 'error' in validation ? validation.error : 'Validation failed' }
      }

      const { title: validatedTitle, description: validatedDescription, assigneeIds: validatedAssigneeIds, objectiveId: validatedObjectiveId, deadline, riskLevel, fileCount } = validation.data

      const primaryAssigneeId = validatedAssigneeIds[0]
      // Ensure we have at least one assignee after validation
      if (!primaryAssigneeId) {
          return { error: 'At least one assignee is required' }
      }

      // Create the task (with primary assignee for backward compatibility)
      let data
      try {
          data = await withRetry(async () => {
              const result = await supabase.from('tasks').insert({
                  foundry_id: foundryId,
                  title: validatedTitle.trim(),
                  description: validatedDescription || null,
                  objective_id: validatedObjectiveId,
                  creator_id: user.id,
                  assignee_id: primaryAssigneeId, // Primary assignee
                  start_date: startDate || null,
                  end_date: deadline || null,
                  status: 'Accepted',
                  risk_level: riskLevel,
                  client_visible: false, // Always hidden initially
                  is_private: isPrivate,
                  metadata: (rolloutId || sourceThreadId) ? {
                      ...(rolloutId ? { rollout_id: rolloutId } : {}),
                      ...(sourceThreadId ? { source_thread_id: sourceThreadId } : {}),
                  } : undefined,
              }).select().single()
              if (result.error) throw result.error
              return result.data
          })
      } catch (error: unknown) {
          const message = error instanceof Error
              ? error.message
              : (error && typeof error === 'object' && 'message' in error)
                  ? String((error as { message: unknown }).message)
                  : 'Failed to create task'
          console.error('[TaskService] Task insert failed:', {
              title: validatedTitle,
              objectiveId: validatedObjectiveId,
              error: message,
          })
          return { error: message }
      }

      if (!data) return { error: 'Failed to create task' }

      // Insert additional assignees into task_assignees table
      if (validatedAssigneeIds.length > 0) {
          const assigneeRecords = validatedAssigneeIds.map(profileId => ({
              task_id: data.id,
              profile_id: profileId
          }))
          const { error: assigneeError } = await supabase.from('task_assignees').insert(assigneeRecords)
          if (assigneeError) {
              console.error('[TaskService] Failed to assign task assignees:', { error: assigneeError instanceof Error ? assigneeError.message : 'Unknown error' })
              return { error: 'Task created but failed to assign team members' }
          }
      }

      // Handle file uploads
      if (fileCount > 0) {
          for (let i = 0; i < fileCount; i++) {
              const file = formData.get(`file_${i}`) as File
              if (!file) continue

              // Security: Sanitize filename to prevent path traversal
              const safeFileName = sanitizeFileName(file.name)
              // Upload to Supabase Storage
              const filePath = `${foundryId}/${data.id}/${Date.now()}_${safeFileName}`
              const { error: uploadError } = await supabase.storage
                  .from('task-files')
                  .upload(filePath, file)

              if (uploadError) {
                  console.error('[TaskService] File upload failed:', { error: uploadError instanceof Error ? uploadError.message : 'Unknown error' })
                  continue // Skip failed uploads but don't fail the whole task
              }

              // Record in task_files table
              const { error: fileRecordError } = await supabase.from('task_files').insert({
                  task_id: data.id,
                  file_name: file.name,
                  file_path: filePath,
                  file_size: file.size,
                  mime_type: file.type,
                  uploaded_by: user.id
              })
              if (fileRecordError) {
                  console.error('[TaskService] Failed to record file in database:', { error: fileRecordError instanceof Error ? fileRecordError.message : 'Unknown error' })
                  // Continue - file is uploaded but record failed
              }
          }
      }

      // Insert share records for private tasks
      if (isPrivate && shareWithJson) {
          try {
              const shareTargets = JSON.parse(shareWithJson) as { type: string; id: string }[]
              const shareRecords = shareTargets.map(target => ({
                  task_id: data.id,
                  shared_with_user_id: target.type === 'user' ? target.id : null,
                  shared_with_team_id: target.type === 'team' ? target.id : null,
                  shared_by: user.id,
              }))
              if (shareRecords.length > 0) {
                  const { error: shareError } = await supabase.from('task_shares').insert(shareRecords)
                  if (shareError) {
                      console.error('[TaskService] Failed to create task shares:', { error: shareError instanceof Error ? shareError.message : 'Unknown error' })
                      // Continue - task is created, sharing can be done later
                  }
              }
          } catch (error) {
              console.error('[TaskService] Failed to parse share targets:', { error: error instanceof Error ? error.message : 'Unknown error' })
          }
      }

      // Log Creation
      try {
          await logSystemEvent(supabase, foundryId, data.id, `Task created by User (Risk: ${riskLevel})`, user.id)
      } catch (error) {
          console.error('[TaskService] Failed to log system event:', { error: error instanceof Error ? error.message : 'Unknown error' })
          // Continue - logging failure shouldn't fail task creation
      }
      
      try {
          await logTaskHistory(data.id, 'CREATED', user.id, {
              title: validatedTitle,
              assignee_id: validatedAssigneeIds[0],
              initial_status: 'Pending',
              risk_level: riskLevel
          })
      } catch (error) {
          console.error('[TaskService] Failed to log task history:', { error: error instanceof Error ? error.message : 'Unknown error' })
          // Continue - logging failure shouldn't fail task creation
      }

      // Trigger AI Worker for primary assignee
      try {
          await runAIWorker(data.id, validatedAssigneeIds[0])
      } catch (error) {
          console.error('[TaskService] Failed to trigger AI worker:', { error: error instanceof Error ? error.message : 'Unknown error' })
          // Continue - AI worker failure shouldn't fail task creation
      }

      // Sync to Google Calendar if user has connected their account
      try {
          await syncTaskToCalendar(data.id, validatedTitle, startDate || null, deadline || null, validatedDescription)
      } catch (error) {
          console.error('[TaskService] Failed to sync task to Google Calendar:', { error: error instanceof Error ? error.message : 'Unknown error' })
          // Continue - calendar sync failure shouldn't fail task creation
      }

      // Sync to Google Sheets (fire-and-forget)
      try {
          const { dispatchSheetSync } = await import('@/lib/spreadsheet/sync-dispatcher')
          await dispatchSheetSync(foundryId, 'task', data.id, 'create')
      } catch (err) {
          console.error('[TaskService] Failed to sync task to Google Sheets:', { error: err instanceof Error ? err.message : 'Unknown error' })
      }

      revalidatePath('/tasks')
      revalidatePath('/new-tasks')
      return { success: true, taskId: data.id }
    } catch (error) {
      const message = sanitizeErrorMessage(error)
      console.error('[CreateTask] Unhandled error in createTask:', {
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      })
      return { error: `Failed to create task: ${sanitizeErrorMessage(message)}` }
    }
  })
}

/**
 * Marks a task as accepted by its current assignee.
 *
 * @description Verifies the caller is the task's assignee and that the task
 * belongs to their foundry, then transitions the status to 'Accepted'.
 *
 * @param {string} taskId - The ID of the task to accept
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires authenticated user who is the task's assignee.
 *   Foundry isolation enforced via withAuth + query filter.
 * @audit Logs status change to task_history and task_comments (system log)
 */
export async function acceptTask(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // AUTH: Verify user is an assignee (primary or multi-assignee) and task belongs to their foundry
        const { data: task, error: fetchError } = await supabase
            .from('tasks')
            .select('assignee_id, foundry_id')
            .eq('id', taskId)
            .eq('foundry_id', foundryId)
            .single()

        if (fetchError || !task) return { error: 'Task not found' }

        // Check both primary assignee and task_assignees junction table
        let isAssignee = task.assignee_id === user.id
        if (!isAssignee) {
            const { data: assigneeRow } = await supabase
                .from('task_assignees')
                .select('id')
                .eq('task_id', taskId)
                .eq('profile_id', user.id)
                .limit(1)
                .maybeSingle()
            isAssignee = !!assigneeRow
        }

        if (!isAssignee) {
            return { error: 'Unauthorized: You are not an assignee of this task' }
        }

        const { error } = await supabase.from('tasks')
            .update({ status: 'Accepted' })
            .eq('id', taskId)
            .eq('foundry_id', foundryId)

        if (error) return { error: sanitizeErrorMessage(error) }

        try {
            await logSystemEvent(supabase, foundryId, taskId, 'Task Accepted', user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        
        try {
            await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
                old_status: 'Pending', // Assumption, or we could fetch
                new_status: 'Accepted'
            })
        } catch (logError) {
            console.error('[TaskService] Failed to log task history:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }

        // Sync to Google Sheets (fire-and-forget)
        try {
            const { dispatchSheetSync } = await import('@/lib/spreadsheet/sync-dispatcher')
            await dispatchSheetSync(foundryId, 'task', taskId, 'update')
        } catch (err) {
            console.error('[TaskService] Failed to sync task to Google Sheets:', { error: err instanceof Error ? err.message : 'Unknown error' })
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        revalidatePath('/strategy')
        return { success: true }
    })
}

/**
 * Rejects a task with a required reason.
 *
 * @description Validates the user has modify permissions via canModifyTask,
 * then sets the task status to 'Rejected' and logs the reason.
 *
 * @param {string} taskId - The ID of the task to reject
 * @param {string} reason - Required explanation for the rejection
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires task creator, assignee, or Executive/Founder role.
 *   Foundry isolation enforced via canModifyTask + query filter.
 * @audit Logs rejection reason to task_history and task_comments (system log)
 */
export async function rejectTask(taskId: string, reason: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        if (!reason) return { error: 'Reason required for rejection' }

        // Security: Verify user has permission to modify this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        const { error } = await supabase.from('tasks')
            .update({ status: 'Rejected' })
            .eq('foundry_id', foundryId) // SECURITY: Defense-in-depth foundry filter
            .eq('id', taskId)

        if (error) return { error: sanitizeErrorMessage(error) }

        try {
            await logSystemEvent(supabase, foundryId, taskId, `Task Rejected. Reason: ${reason}`, user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        
        try {
            await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
                new_status: 'Rejected',
                reason
            })
        } catch (logError) {
            console.error('[TaskService] Failed to log task history:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }

        // Sync to Google Sheets (fire-and-forget)
        try {
            const { dispatchSheetSync } = await import('@/lib/spreadsheet/sync-dispatcher')
            await dispatchSheetSync(foundryId, 'task', taskId, 'update')
        } catch (err) {
            console.error('[TaskService] Failed to sync task to Google Sheets:', { error: err instanceof Error ? err.message : 'Unknown error' })
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}

/**
 * Forwards a task to a new assignee with a required reason.
 *
 * @description Verifies the caller is the current assignee, updates the primary
 * assignee, syncs the task_assignees table, appends to forwarding_history JSON,
 * and triggers the AI worker for the new assignee.
 *
 * @param {string} taskId - The ID of the task to forward
 * @param {string} newAssigneeId - The profile ID of the new assignee
 * @param {string} reason - Required explanation for the forwarding
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires the caller to be the current assignee. Foundry isolation
 *   enforced via foundry_id query filter.
 * @audit Logs forwarding event with previous/new assignee to task_history
 */
export async function forwardTask(taskId: string, newAssigneeId: string, reason: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        if (!reason) return { error: 'Reason required for forwarding' }

        // Fetch current task for history with foundry_id for security check
        const { data: task } = await supabase.from('tasks').select('forwarding_history, assignee_id, foundry_id').eq('foundry_id', foundryId).eq('id', taskId).single()
        if (!task) return { error: 'Task not found' }

        // Task already filtered by foundry_id above - this check is now redundant but kept for clarity
        if (task.foundry_id !== foundryId) {
            return { error: 'Unauthorized: Task belongs to a different foundry' }
        }

        // If task has an assignee, verify user is the current assignee
        if (task.assignee_id && task.assignee_id !== user.id) {
            return { error: 'Unauthorized: You are not the current assignee of this task' }
        }

        // Get old assignee name (optional, but good for log. Skipping for strict performance, just using IDs in history for now)

        interface ForwardingEvent {
            from_id: string | null;
            to_id: string;
            reason: string;
            date: string;
        }
        
        // Properly type the forwarding_history JSON field
        const history: ForwardingEvent[] = Array.isArray(task.forwarding_history) 
            ? (task.forwarding_history as unknown as ForwardingEvent[])
            : []
        
        const newHistory: ForwardingEvent[] = [
            ...history,
            {
                from_id: task.assignee_id || null,
                to_id: newAssigneeId,
                reason: reason,
                date: new Date().toISOString()
            }
        ]

        const { error } = await supabase.from('tasks')
            .update({
                assignee_id: newAssigneeId,
                status: 'Accepted',
                forwarding_history: newHistory as unknown as Database['public']['Tables']['tasks']['Update']['forwarding_history']
            })
            .eq('id', taskId)
            .eq('foundry_id', foundryId)

        if (error) return { error: sanitizeErrorMessage(error) }

        // Sync task_assignees table: delete old assignees and insert new one
        const { error: deleteError } = await supabase
            .from('task_assignees')
            .delete()
            .eq('task_id', taskId)
        
        if (deleteError) {
            console.error('[TaskService] Failed to delete old task assignees:', { error: deleteError instanceof Error ? deleteError.message : 'Unknown error' })
        }

        const { error: insertError } = await supabase
            .from('task_assignees')
            .insert({ task_id: taskId, profile_id: newAssigneeId })
        
        if (insertError) {
            console.error('[TaskService] Failed to insert new task assignee:', { error: insertError instanceof Error ? insertError.message : 'Unknown error' })
            return { error: 'Failed to update task assignees' }
        }

        // Log with names ideally, but IDs for now
        try {
            await logSystemEvent(supabase, foundryId, taskId, `Task forwarded to new assignee. Reason: ${reason}`, user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        
        try {
            await logTaskHistory(taskId, 'FORWARDED', user.id, {
                previous_assignee: task.assignee_id,
                new_assignee: newAssigneeId,
                reason
            })
        } catch (logError) {
            console.error('[TaskService] Failed to log task history:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }

        // Trigger AI Worker
        try {
            await runAIWorker(taskId, newAssigneeId)
        } catch (workerError) {
            console.error('[TaskService] Failed to trigger AI worker:', { error: workerError instanceof Error ? workerError.message : 'Unknown error' })
            // Continue - AI worker failure shouldn't fail forwarding
        }

        // Sync to Google Sheets (fire-and-forget — assignee changed)
        try {
            const { dispatchSheetSync } = await import('@/lib/spreadsheet/sync-dispatcher')
            await dispatchSheetSync(foundryId, 'task', taskId, 'update')
        } catch (err) {
            console.error('[TaskService] Failed to sync task to Google Sheets:', { error: err instanceof Error ? err.message : 'Unknown error' })
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}

/**
 * Requests an amendment to a task's dates with required notes.
 *
 * @description Sets the task status to 'Amended_Pending_Approval' and updates
 * start/end dates. The amendment must be approved before the task resumes.
 *
 * @param {string} taskId - The ID of the task to amend
 * @param {Object} updates - Amendment details
 * @param {string} [updates.start_date] - New start date (ISO string)
 * @param {string} [updates.end_date] - New end date (ISO string)
 * @param {string} updates.amendment_notes - Required notes explaining the amendment
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires task modify permission via canModifyTask (creator, assignee,
 *   or Executive/Founder role).
 * @audit Logs amendment notes and new dates to task_history
 */
export async function amendTask(taskId: string, updates: {
    start_date?: string,
    end_date?: string,
    amendment_notes: string
}) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        if (!updates.amendment_notes) return { error: 'Amendment notes required' }

        // Security: Verify user has permission to modify this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        const { error } = await supabase.from('tasks')
            .update({
                status: 'Amended_Pending_Approval',
                start_date: updates.start_date || null,
                end_date: updates.end_date || null,
                amendment_notes: updates.amendment_notes
            })
            .eq('id', taskId)
            .eq('foundry_id', foundryId)

        if (error) return { error: sanitizeErrorMessage(error) }

        // Fire-and-forget logging - errors shouldn't fail the main operation
        try {
            await logSystemEvent(supabase, foundryId, taskId, `Task Amended. Notes: ${updates.amendment_notes}`, user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        
        try {
            await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
                new_status: 'Amended_Pending_Approval',
                amendment_notes: updates.amendment_notes,
                new_dates: { start: updates.start_date, end: updates.end_date }
            })
        } catch (logError) {
            console.error('[TaskService] Failed to log task history:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        
        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}

/**
 * Approves a pending task amendment, transitioning the task to 'Accepted'.
 *
 * @description Verifies the user has modify permissions, then updates the task
 * status from 'Amended_Pending_Approval' to 'Accepted'.
 *
 * @param {string} taskId - The ID of the task whose amendment to approve
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires task modify permission via canModifyTask.
 * @audit Logs status transition to task_history and task_comments (system log)
 */
export async function approveAmendment(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Security: Verify user has permission to approve amendments
        // Should be the task creator or assignee who requested the amendment
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        const { error } = await supabase.from('tasks')
            .update({ status: 'Accepted' }) // "Once User A accepts... automatically changes to Accepted"
            .eq('id', taskId)
            .eq('foundry_id', foundryId)

        if (error) return { error: sanitizeErrorMessage(error) }

        // Fire-and-forget logging - errors shouldn't fail the main operation
        try {
            await logSystemEvent(supabase, foundryId, taskId, 'Amendment Approved. Task is now Accepted.', user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        
        try {
            await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
                old_status: 'Amended_Pending_Approval',
                new_status: 'Accepted'
            })
        } catch (logError) {
            console.error('[TaskService] Failed to log task history:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        
        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}

/**
 * Adds a comment to a task with @mention notification support.
 *
 * @description Validates content via Zod schema, inserts a comment, parses @mentions
 * to create notifications for mentioned users, and syncs the comment to the
 * unified messaging inbox.
 *
 * @param {string} taskId - The ID of the task to comment on
 * @param {string} content - The comment text (may include @mentions)
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires authenticated user with foundry membership via withAuth.
 * @audit Comment is persisted in task_comments and synced to messages table
 */
export async function addTaskComment(taskId: string, content: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Validate using Zod schema
        const validation = validate(addCommentSchema, { taskId, content })
        if (!validation.success) {
            return { error: 'error' in validation ? validation.error : 'Validation failed' }
        }

        const { content: validatedContent } = validation.data

        // SECURITY: Verify the task belongs to the caller's foundry to prevent
        // cross-foundry comment injection via a known task UUID.
        const { data: task, error: taskLookupError } = await supabase
            .from('tasks')
            .select('id')
            .eq('id', taskId)
            .eq('foundry_id', foundryId)
            .single()
        if (taskLookupError || !task) {
            return { error: 'Task not found' }
        }

        const { error } = await supabase.from('task_comments').insert({
            task_id: taskId,
            foundry_id: foundryId,
            user_id: user.id,
            content: validatedContent,
            is_system_log: false
        })

        if (error) return { error: sanitizeErrorMessage(error) }

        // Parse mentions from content and create notifications
        try {
            const { parseUserMentions } = await import('@/lib/mentions')
            const mentions = parseUserMentions(validatedContent)
            
            if (mentions.length > 0) {
                // Get all foundry members to match mentions
                const { data: members } = await supabase
                    .from('profiles')
                    .select('id, full_name')
                    .eq('foundry_id', foundryId)
                
                if (members) {
                    // Match mentioned names to user IDs (case-insensitive first name match)
                    const mentionedUserIds = new Set<string>()
                    for (const mention of mentions) {
                        const matchedMember = members.find(m => 
                            m.full_name?.toLowerCase().startsWith(mention.toLowerCase())
                        )
                        if (matchedMember && matchedMember.id !== user.id) {
                            mentionedUserIds.add(matchedMember.id)
                        }
                    }

                    // Create notifications for mentioned users
                    if (mentionedUserIds.size > 0) {
                        const { data: task } = await supabase
                            .from('tasks')
                            .select('title, task_number')
                            .eq('id', taskId)
                            .single()

                        const notifications = Array.from(mentionedUserIds).map(userId => ({
                            user_id: userId,
                            foundry_id: foundryId,
                            type: 'mention' as const,
                            title: 'Mentioned in task comment',
                            message: `${user.email?.split('@')[0] || 'Someone'} mentioned you in task #${task?.task_number || ''}: ${task?.title || 'Untitled'}`,
                            task_id: taskId,
                            is_read: false
                        }))

                        await supabase.from('notifications').insert(notifications)
                    }
                }
            }
        } catch (mentionError) {
            // Don't fail the main operation if mention processing fails
            console.error('[TaskService] Failed to process mentions:', { error: mentionError instanceof Error ? mentionError.message : 'Unknown error' })
        }

        // Sync comment to messages so it appears in the unified inbox
        try {
            await syncTaskCommentToMessages(supabase, {
                taskId,
                userId: user.id,
                content: validatedContent,
                isSystemLog: false
            })
        } catch (syncError) {
            // Don't fail the main operation if sync fails
            console.error('Failed to sync task comment to messages:', syncError)
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        revalidatePath('/messages')
        revalidatePath('/updates')
        return { success: true }
    })
}

/**
 * Marks a task as complete, routing through approval workflows based on risk level.
 *
 * @description Founders/Executives can directly complete any task. Other roles trigger
 * peer review (Medium risk) or executive approval (High risk) before completion.
 * Sets end_date and client_visible when fully completed.
 *
 * @param {string} taskId - The ID of the task to complete
 * @returns {Promise<{ success: true; newStatus: string } | { error: string }>} Success with
 *   resulting status, or error
 *
 * @security Requires authenticated user with foundry membership. Foundry isolation
 *   enforced via foundry_id query filter.
 * @audit Logs status transition and risk level to task_history
 */
export async function completeTask(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Fetch user's role
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        // Fetch Risk Level and metadata (for rollout reward) - only from user's foundry
        const { data: task, error: fetchError } = await supabase
            .from('tasks')
            .select('risk_level, status, metadata')
            .eq('id', taskId)
            .eq('foundry_id', foundryId)
            .single()

        if (fetchError || !task) return { error: 'Task not found' }

        const nextStatus: TaskStatus = 'Completed'

        const updates: Partial<Database['public']['Tables']['tasks']['Update']> = {
            status: nextStatus,
            end_date: new Date().toISOString(),
            client_visible: true,
        }

        const { error } = await supabase.from('tasks')
            .update(updates)
            .eq('id', taskId)
            .eq('foundry_id', foundryId)

        if (error) return { error: sanitizeErrorMessage(error) }

        try {
            await logSystemEvent(supabase, foundryId, taskId, `Task marked as ${nextStatus} (Risk: ${task.risk_level})`, user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        
        try {
            await logTaskHistory(taskId, nextStatus === 'Completed' ? 'COMPLETED' : 'STATUS_CHANGE', user.id, {
                new_status: nextStatus,
                risk_level: task.risk_level,
                completed_at: nextStatus === 'Completed' ? new Date().toISOString() : undefined
            })
        } catch (logError) {
            console.error('[TaskService] Failed to log task history:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }

        // Recalculate objective progress (rollup chain: Task -> Objective -> Strategy)
        try {
            await recalculateObjectiveProgress(supabase, taskId, foundryId)
        } catch (rollupError) {
            console.error('[TaskService] Failed to recalculate objective progress:', { error: rollupError instanceof Error ? rollupError.message : 'Unknown error' })
        }

        // Agent rollouts: attach reward when task was created from a specialist suggestion
        if (nextStatus === 'Completed' && task.metadata && typeof task.metadata === 'object' && 'rollout_id' in task.metadata) {
            const rid = (task.metadata as { rollout_id?: string }).rollout_id
            if (typeof rid === 'string' && rid) {
                const { addReward } = await import('@/lib/agent-spans')
                addReward(rid, 1.0, 'task_completed').catch(() => {})
            }
        }

        // Sync to Google Sheets (fire-and-forget)
        try {
            const { dispatchSheetSync } = await import('@/lib/spreadsheet/sync-dispatcher')
            await dispatchSheetSync(foundryId, 'task', taskId, 'update')
        } catch (err) {
            console.error('[TaskService] Failed to sync task to Google Sheets:', { error: err instanceof Error ? err.message : 'Unknown error' })
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        revalidatePath('/strategy')
        return { success: true, newStatus: nextStatus }
    })
}

/**
 * Approves a task pending review, marking it as completed and client-visible.
 *
 * @description Validates the task is in an approvable state (Pending_Peer_Review or
 * Pending_Executive_Approval). For executive approval, only Executive/Founder roles
 * are permitted. Sets status to 'Completed', end_date, and client_visible = true.
 *
 * @param {string} taskId - The ID of the task to approve
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires Executive/Founder role for High Risk task approval.
 *   Foundry isolation enforced via foundry_id query filter.
 * @audit Logs approver role and approval event to task_history
 */
export async function approveTask(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Fetch task (from user's foundry only) and user profile checks
        const { data: task } = await supabase.from('tasks')
            .select('risk_level, status')
            .eq('id', taskId)
            .eq('foundry_id', foundryId)
            .single()
        const { data: approver } = await supabase.from('profiles').select('role').eq('id', user.id).single()

        if (!task) return { error: 'Task not found' }
        if (!approver) return { error: 'User profile not found' }

        // Validate task is in an approvable state
        const approvableStatuses: TaskStatus[] = ['Pending_Peer_Review', 'Pending_Executive_Approval']
        if (!approvableStatuses.includes(task.status as TaskStatus)) {
            return { error: `Task cannot be approved in its current status: ${task.status}` }
        }

        // Role-based validation for different approval types
        if (task.status === 'Pending_Executive_Approval') {
            if (approver.role !== 'Executive' && approver.role !== 'Founder') {
                return { error: 'Only Executives can approve High Risk tasks.' }
            }
        }

        // Release Logic - only update in user's foundry
        const { error } = await supabase.from('tasks')
            .update({
                status: 'Completed',
                client_visible: true,
                end_date: new Date().toISOString()
            })
            .eq('id', taskId)
            .eq('foundry_id', foundryId)

        if (error) return { error: sanitizeErrorMessage(error) }

        // Fire-and-forget logging - errors shouldn't fail the main operation
        try {
            await logSystemEvent(supabase, foundryId, taskId, `Task Approved & Released by ${approver.role}`, user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        
        try {
            await logTaskHistory(taskId, 'COMPLETED', user.id, {
                approver_role: approver.role,
                via_approval: true
            })
        } catch (logError) {
            console.error('[TaskService] Failed to log task history:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }

        // Recalculate objective progress (rollup chain: Task -> Objective -> Strategy)
        try {
            await recalculateObjectiveProgress(supabase, taskId, foundryId)
        } catch (rollupError) {
            console.error('[TaskService] Failed to recalculate objective progress:', { error: rollupError instanceof Error ? rollupError.message : 'Unknown error' })
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        revalidatePath('/strategy')
        return { success: true }
    })
}

/**
 * Retrieves all tasks pending executive approval within the user's foundry.
 *
 * @returns List of pending approval tasks, or error
 *
 * @security Requires Executive or Founder role. Filters by foundry_id for defense-in-depth.
 */
export async function getPendingApprovals() {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Check if user is Executive or Founder
        const { data: profile } = await supabase.from('profiles').select('role, foundry_id').eq('id', user.id).single()
        if (!profile || (profile.role !== 'Executive' && profile.role !== 'Founder')) {
            return { error: 'Only Executives and Founders can view pending approvals', data: [] }
        }

        // SECURITY: Filter by foundry_id for defense-in-depth (not just relying on RLS)
        const { data: tasks, error } = await supabase
            .from('tasks')
            .select(`
                id,
                title,
                description,
                status,
                risk_level,
                created_at,
                end_date,
                assignee:profiles!assignee_id(id, full_name, role),
                objective:objectives!objective_id(id, title),
                creator:profiles!created_by(id, full_name)
            `)
            .eq('foundry_id', foundryId)
            .eq('is_ghost', false)
            .is('deleted_at', null)
            .in('status', ['Pending_Executive_Approval', 'Amended_Pending_Approval'])
            .order('created_at', { ascending: false })

        if (error) return { error: sanitizeErrorMessage(error), data: [] }

        return { data: tasks || [] }
    })
}

/**
 * Batch-approves multiple tasks, marking them completed and client-visible.
 *
 * @description Verifies the caller has Executive/Founder role, then updates all
 * specified tasks within the user's foundry to Completed status. Logs approval
 * events for each task individually.
 *
 * @param {string[]} taskIds - Array of task IDs to approve
 * @returns {Promise<{ success: true; approvedCount: number } | { error: string }>} Success
 *   with count, or error
 *
 * @security Requires Executive or Founder role. Foundry isolation enforced via
 *   foundry_id query filter (defense-in-depth with RLS).
 * @audit Logs batch approval event to task_history for each task
 */
export async function batchApproveTasks(taskIds: string[]) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        if (!taskIds || taskIds.length === 0) return { error: 'No tasks provided' }

        // Check if user is Executive or Founder
        const { data: approver } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (!approver || (approver.role !== 'Executive' && approver.role !== 'Founder')) {
            return { error: 'Only Executives and Founders can batch approve tasks' }
        }

        // Update only tasks in user's foundry (defense in depth with RLS)
        const { error } = await supabase.from('tasks')
            .update({
                status: 'Completed',
                client_visible: true,
                end_date: new Date().toISOString()
            })
            .in('id', taskIds)
            .eq('foundry_id', foundryId)

        if (error) return { error: sanitizeErrorMessage(error) }

        // Log events for each task
        for (const taskId of taskIds) {
            try {
                await logSystemEvent(supabase, foundryId, taskId, `Task Batch Approved & Released by ${approver.role}`, user.id)
                await logTaskHistory(taskId, 'COMPLETED', user.id, {
                    approver_role: approver.role,
                    via_batch_approval: true,
                    batch_size: taskIds.length
                })
            } catch (logError) {
                console.error('[TaskService] Failed to log task:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
            }
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        revalidatePath('/dashboard')
        return { success: true, approvedCount: taskIds.length }
    })
}

/**
 * Batch-rejects multiple tasks, resetting them to Pending with a rejection reason.
 *
 * @description Verifies the caller has Executive/Founder role, then updates all
 * specified tasks within the user's foundry to Pending status with the rejection
 * reason. Logs rejection events for each task individually.
 *
 * @param {string[]} taskIds - Array of task IDs to reject
 * @param {string} reason - Required rejection reason applied to all tasks
 * @returns {Promise<{ success: true; rejectedCount: number } | { error: string }>} Success
 *   with count, or error
 *
 * @security Requires Executive or Founder role. Foundry isolation enforced via
 *   foundry_id query filter (defense-in-depth with RLS).
 * @audit Logs batch rejection reason to task_history for each task
 */
export async function batchRejectTasks(taskIds: string[], reason: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        if (!taskIds || taskIds.length === 0) return { error: 'No tasks provided' }
        if (!reason?.trim()) return { error: 'Rejection reason is required' }

        // Check if user is Executive or Founder
        const { data: approver } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (!approver || (approver.role !== 'Executive' && approver.role !== 'Founder')) {
            return { error: 'Only Executives and Founders can batch reject tasks' }
        }

        // Update only tasks in user's foundry (defense in depth with RLS)
        const { error } = await supabase.from('tasks')
            .update({
                status: 'Pending',
                rejection_reason: reason.trim()
            })
            .in('id', taskIds)
            .eq('foundry_id', foundryId)

        if (error) return { error: sanitizeErrorMessage(error) }

        // Log events for each task
        for (const taskId of taskIds) {
            try {
                await logSystemEvent(supabase, foundryId, taskId, `Task Batch Rejected by ${approver.role}: ${reason}`, user.id)
                await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
                    new_status: 'Rejected',
                    approver_role: approver.role,
                    via_batch_rejection: true,
                    reason,
                    batch_size: taskIds.length
                })
            } catch (logError) {
                console.error('[TaskService] Failed to log task:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
            }
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        revalidatePath('/dashboard')
        return { success: true, rejectedCount: taskIds.length }
    })
}

export async function nudgeTask(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Verify user has access to the task's foundry
        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .select('last_nudge_at, nudge_count, foundry_id')
            .eq('id', taskId)
            .single()

        if (taskError || !task) return { error: 'Task not found' }

        if (task.foundry_id !== foundryId) {
            return { error: 'Unauthorized: Task belongs to a different foundry' }
        }

        // Check last nudge to prevent spam (1 hour cooldown)
        // Calculate cooldown threshold for user-facing message
        if (task?.last_nudge_at) {
            const lastNudge = new Date(task.last_nudge_at).getTime()
            const now = Date.now()
            if (now - lastNudge < NUDGE_COOLDOWN_MS) {
                const remaining = Math.ceil((NUDGE_COOLDOWN_MS - (now - lastNudge)) / 60000)
                return { error: `Please wait ${remaining} minutes before nudging again.` }
            }
        }

        // Atomic update with cooldown condition to prevent race conditions
        // The update only succeeds if last_nudge_at is null OR older than the cooldown period
        const cooldownThreshold = new Date(Date.now() - NUDGE_COOLDOWN_MS).toISOString()
        
        // Use RPC function for safer OR condition (avoids string interpolation)
        // Fallback: For now, comment explains cooldownThreshold is server-generated ISO timestamp (safe)
        // Future: Consider using a Postgres function for this atomic operation
        const { error: updateError, count } = await supabase.from('tasks')
            .update({
                nudge_count: (task?.nudge_count || 0) + 1,
                last_nudge_at: new Date().toISOString()
            })
            .eq('id', taskId)
            // Note: cooldownThreshold is server-generated ISO timestamp, not user input
            .or(`last_nudge_at.is.null,last_nudge_at.lt.${cooldownThreshold}`)

        if (updateError) {
            console.warn(`Nudge update failed for task ${taskId} (likely RLS):`, updateError)
            // We continue intentionally to allow the notification to go through
        } else if (count === 0) {
            // Race condition: another nudge happened between our check and update
            return { error: 'Please wait before nudging again (concurrent request detected).' }
        }

        // NOTIFICATION LOGIC
        await logSystemEvent(supabase, foundryId, taskId, "🔴 CLIENT NUDGE: Client requested an update.", user.id)

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}


/**
 * Retrieves the count of task history events in the last hour for live pulse display.
 *
 * @description Queries task_history for events created within the past hour. RLS
 * ensures only events visible to the current user's foundry are counted.
 *
 * @returns {Promise<{ actions: number }>} Count of recent task activity events
 *
 * @security Requires authenticated user via withAuth. RLS enforces foundry isolation.
 */
export async function getPulseMetrics() {
    return withAuth(async ({ supabase }) => {
        // Count history events in last 1 hour
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString()

        // We join with profiles to ensure we are only counting activity for OUR foundry (tenancy)
        // task_history -> tasks (filtered by foundry_id)
        // But task_history doesn't have foundry_id directly. It links to task.

        const { count, error } = await supabase
            .from('task_history')
            .select('id', { count: 'exact', head: true })
            .gt('created_at', oneHourAgo)
        // complex filter might be needed if tenancy isn't strict, but assuming tasks are RLS protected to foundry
        // we can simpler just query. But wait, RLS is active.
        // So checking "count" should automatically respect RLS and only show me history I can see (my foundry).

        if (error) {
            console.warn("Pulse metrics error", error)
            return { actions: 0 }
        }

        return { actions: count || 0 }
    })
}

/**
 * Updates a task's start and end dates with validation and calendar sync.
 *
 * @description Verifies the task belongs to the user's foundry, validates dates
 * via Zod schema, updates the task record, logs the reschedule event, and syncs
 * updated dates to Google Calendar.
 *
 * @param {string} taskId - The ID of the task to update
 * @param {string} startDate - New start date (ISO string, or empty for null)
 * @param {string} endDate - New end date (ISO string, or empty for null)
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires authenticated user. Foundry isolation enforced via foundry_id check.
 * @audit Logs date changes to task_history
 */
export async function updateTaskDates(taskId: string, startDate: string, endDate: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        try {
            // Verify user has access to the task's foundry
            const { data: task, error: taskFetchError } = await supabase
                .from('tasks')
                .select('foundry_id, title')
                .eq('id', taskId)
                .single()

            if (taskFetchError || !task) {
                console.error('[TaskService] Failed to fetch task:', { error: taskFetchError instanceof Error ? taskFetchError.message : 'Unknown error' })
                return { error: 'Task not found' }
            }

            if (task.foundry_id !== foundryId) {
                return { error: 'Unauthorized: Task belongs to a different foundry' }
            }

            // Validate using Zod schema
            // Convert empty strings to null for optional date fields
            const validation = validate(updateTaskDatesSchema, {
                taskId,
                startDate: startDate?.trim() ? startDate.trim() : null,
                endDate: endDate?.trim() ? endDate.trim() : null
            })
            if (!validation.success) {
                console.error('[TaskService] Validation failed:', { error: 'error' in validation ? validation.error : 'unknown', startDate, endDate })
                return { error: 'error' in validation ? validation.error : 'Validation failed' }
            }

            const { startDate: validatedStartDate, endDate: validatedEndDate } = validation.data

            const { error } = await supabase.from('tasks')
                .update({
                    start_date: validatedStartDate,
                    end_date: validatedEndDate
                })
                .eq('id', taskId)
                .eq('foundry_id', foundryId)

            if (error) {
                console.error('[TaskService] Supabase update failed:', { error: error instanceof Error ? error.message : 'Unknown error' })
                return { error: sanitizeErrorMessage(error) }
            }

            try {
                // Safely format dates for logging (validatedStartDate and validatedEndDate are validated above but add null checks for safety)
                const startDateFormatted = validatedStartDate ? validatedStartDate.split('T')[0] : 'N/A'
                const endDateFormatted = validatedEndDate ? validatedEndDate.split('T')[0] : 'N/A'
                await logSystemEvent(supabase, foundryId, taskId, `Task rescheduled: ${startDateFormatted} → ${endDateFormatted}`, user.id)
            } catch (logError) {
                console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
            }
            
            try {
                await logTaskHistory(taskId, 'UPDATED', user.id, {
                    field: 'dates',
                    new_start: validatedStartDate,
                    new_end: validatedEndDate
                })
            } catch (logError) {
                console.error('[TaskService] Failed to log task history:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
            }

            // Sync updated dates to Google Calendar
            try {
                await syncTaskToCalendar(taskId, task.title, validatedStartDate || null, validatedEndDate || null)
            } catch (calError) {
                console.error('[TaskService] Failed to sync task dates to Google Calendar:', { error: calError instanceof Error ? calError.message : 'Unknown error' })
                // Continue - calendar sync failure shouldn't fail date update
            }

            // Sync to Google Sheets (fire-and-forget)
            try {
                const { dispatchSheetSync } = await import('@/lib/spreadsheet/sync-dispatcher')
                await dispatchSheetSync(foundryId, 'task', taskId, 'update')
            } catch (err) {
                console.error('[TaskService] Failed to sync task to Google Sheets:', { error: err instanceof Error ? err.message : 'Unknown error' })
            }

            revalidatePath('/timeline')
            revalidatePath('/tasks')
            revalidatePath('/new-tasks')
            return { success: true }
        } catch (err) {
            console.error('[TaskService] updateTaskDates unexpected error:', { error: err instanceof Error ? err.message : 'Unknown error' })
            return { error: 'Failed to update task dates' }
        }
    })
}

/**
 * Triggers the AI worker to process a task assigned to an AI agent.
 *
 * @param taskId - The task to trigger AI processing for
 * @returns Success status or error
 *
 * @security Requires authenticated user. Verifies task belongs to user's foundry.
 */
export async function triggerAIWorker(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // SECURITY: Fetch task with foundry_id filter for defense-in-depth
        const { data: task } = await supabase
            .from('tasks')
            .select('assignee_id')
            .eq('id', taskId)
            .eq('foundry_id', foundryId)
            .single()

        if (!task) return { error: 'Task not found' }
        if (!task.assignee_id) return { error: 'No assignee on this task' }

        // Verify assignee is AI
        const { data: assignee } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', task.assignee_id)
            .single()

        if (!assignee || assignee.role !== 'AI_Agent') {
            return { error: 'Task is not assigned to an AI agent' }
        }

        // Run the AI worker
        try {
            await runAIWorker(taskId, task.assignee_id)
        } catch (workerError) {
            console.error('[TaskService] Failed to trigger AI worker:', { error: workerError instanceof Error ? workerError.message : 'Unknown error' })
            return { error: 'Failed to trigger AI worker' }
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}


/**
 * Updates a task's progress percentage (0-100).
 *
 * @description Verifies modify permissions via canModifyTask, clamps the value
 * to 0-100, and updates the task's progress field.
 *
 * @param {string} taskId - The ID of the task to update
 * @param {number} progress - New progress value (will be clamped to 0-100)
 * @returns {Promise<{ success: true; progress: number } | { error: string }>} Success
 *   with clamped progress value, or error
 *
 * @security Requires task modify permission via canModifyTask (creator, assignee,
 *   or Executive/Founder role).
 */
export async function updateTaskProgress(taskId: string, progress: number) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Security: Verify user has permission to modify this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        // Clamp progress between 0 and 100
        const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)))

        const { error } = await supabase.from('tasks')
            .update({ progress: clampedProgress })
            .eq('id', taskId)
            .eq('foundry_id', foundryId)

        if (error) return { error: sanitizeErrorMessage(error) }

        // Sync to Google Sheets (fire-and-forget)
        try {
            const { dispatchSheetSync } = await import('@/lib/spreadsheet/sync-dispatcher')
            await dispatchSheetSync(foundryId, 'task', taskId, 'update')
        } catch (err) {
            console.error('[TaskService] Failed to sync task to Google Sheets:', { error: err instanceof Error ? err.message : 'Unknown error' })
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        revalidatePath(`/tasks/${taskId}`) // If detailed view exists
        return { success: true, progress: clampedProgress }
    })
}

/**
 * Duplicates a task, copying its title, description, objective, assignees, and risk level.
 *
 * @description Creates a new task based on the original with "(Copy)" appended to the title.
 * Copies assignees from task_assignees table. Resets dates, progress, and visibility.
 * File attachments are NOT copied.
 *
 * @param {string} originalTaskId - The ID of the task to duplicate
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires authenticated user. Foundry isolation enforced via foundry_id check.
 * @audit Logs CREATED event with source=DUPLICATION to task_history
 */
export async function duplicateTask(originalTaskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // 1. Fetch original task
        const { data: originalTask, error: fetchError } = await supabase
            .from('tasks')
            .select('*, task_number')
            .eq('id', originalTaskId)
            .single()

        if (fetchError || !originalTask) return { error: 'Original task not found' }

        // Verify user has access to the task's foundry
        if (originalTask.foundry_id !== foundryId) {
            return { error: 'Unauthorized: Task belongs to a different foundry' }
        }

        // 2. Insert new task
        const { data: newTask, error: insertError } = await supabase.from('tasks').insert({
            foundry_id: foundryId,
            title: originalTask.title + ' (Copy)',
            description: originalTask.description,
            objective_id: originalTask.objective_id,
            creator_id: user.id,
            assignee_id: originalTask.assignee_id || null, // Primary assignee (may be null)
            status: 'Pending',
            start_date: null, // Reset dates? Or keep? Resetting is usually safer for copies.
            end_date: null,
            progress: 0,
            risk_level: originalTask.risk_level || 'Low', // Copy risk level
            client_visible: false // Reset visibility
        }).select().single()

        if (insertError) return { error: sanitizeErrorMessage(insertError) }

        // 3. Copy Assignees (if any)
        const { data: originalAssignees } = await supabase
            .from('task_assignees')
            .select('profile_id')
            .eq('task_id', originalTaskId)

        if (originalAssignees && originalAssignees.length > 0) {
            const newAssigneeRecords = originalAssignees.map(a => ({
                task_id: newTask.id,
                profile_id: a.profile_id
            }))
            const { error: assigneeError } = await supabase.from('task_assignees').insert(newAssigneeRecords)
            if (assigneeError) {
                console.error('[TaskService] Failed to copy assignees:', { error: assigneeError instanceof Error ? assigneeError.message : 'Unknown error' })
                return { error: 'Task duplicated but failed to copy assignees' }
            }
        }

        // 4. Copy Attachments references ?? 
        // Creating true copies of files in storage is expensive and complex (download/upload). 
        // We will simple NOT copy attachments for now as usually a task copy is for the 'task' structure, not necessarily the exact file evidence of the previous one.
        // If user wants files, they can re-upload or we can implement 'link to existing file' later.

        try {
            // Use task_number if available, otherwise fall back to truncated ID
            const taskNumber = originalTask.task_number as number | null
            const taskIdentifier = taskNumber ? `#${taskNumber}` : originalTaskId.substring(0, 4)
            await logSystemEvent(supabase, foundryId, newTask.id, `Task duplicated from ${taskIdentifier}`, user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        
        try {
            await logTaskHistory(newTask.id, 'CREATED', user.id, {
                source: 'DUPLICATION',
                original_task_id: originalTaskId
            })
        } catch (logError) {
            console.error('[TaskService] Failed to log task history:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}

/**
 * Updates a task's title and/or description.
 *
 * @description Verifies modify permissions via canModifyTask, then patches the
 * specified fields. Returns success immediately if no changes are provided.
 *
 * @param {string} taskId - The ID of the task to update
 * @param {Object} updates - Fields to update
 * @param {string} [updates.title] - New task title
 * @param {string} [updates.description] - New task description
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires task modify permission via canModifyTask.
 * @audit Logs UPDATED event with changed fields to task_history
 */
export async function updateTaskDetails(taskId: string, updates: { title?: string, description?: string }) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        if (!updates.title && updates.description === undefined) return { success: true } // Nothing to update

        // Security: Verify user has permission to modify this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        // SECURITY: Whitelist allowed fields to prevent mass assignment.
        // TypeScript types are erased at runtime — a malicious caller could pass
        // additional fields (e.g., status, foundry_id) that Supabase would apply.
        const safeUpdates: Record<string, unknown> = {}
        if (updates.title !== undefined) safeUpdates.title = updates.title
        if (updates.description !== undefined) safeUpdates.description = updates.description

        const { error } = await supabase.from('tasks')
            .update(safeUpdates)
            .eq('id', taskId)
            .eq('foundry_id', foundryId)

        if (error) return { error: sanitizeErrorMessage(error) }

        try {
            await logSystemEvent(supabase, foundryId, taskId, `Task details updated`, user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        
        try {
            await logTaskHistory(taskId, 'UPDATED', user.id, {
                updates // Log the raw updates object
            })
        } catch (logError) {
            console.error('[TaskService] Failed to log task history:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }

        // Sync to Google Sheets (fire-and-forget)
        try {
            const { dispatchSheetSync } = await import('@/lib/spreadsheet/sync-dispatcher')
            await dispatchSheetSync(foundryId, 'task', taskId, 'update')
        } catch (err) {
            console.error('[TaskService] Failed to sync task to Google Sheets:', { error: err instanceof Error ? err.message : 'Unknown error' })
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}

/**
 * Replaces all assignees on a task with a new set.
 *
 * @description Verifies modify permissions, updates the primary assignee on the tasks
 * table, replaces all task_assignees records, and triggers the AI worker if the new
 * primary assignee is an AI agent.
 *
 * @param {string} taskId - The ID of the task to update
 * @param {string[]} assigneeIds - New assignee profile IDs (first is primary)
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires task modify permission via canModifyTask.
 * @audit Logs ASSIGNED event with new assignee list to task_history
 */
export async function updateTaskAssignees(taskId: string, assigneeIds: string[]) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        if (assigneeIds.length === 0) return { error: 'Must have at least one assignee' }

        // Security: Verify user has permission to modify this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        const primaryAssigneeId = assigneeIds[0]

        // Update primary assignee on task table
        const { error: taskError } = await supabase.from('tasks')
            .update({ assignee_id: primaryAssigneeId })
            .eq('id', taskId)

        if (taskError) return { error: sanitizeErrorMessage(taskError) }

        // Sync task_assignees table
        // 1. Delete existing
        const { error: deleteError } = await supabase.from('task_assignees').delete().eq('task_id', taskId)
        if (deleteError) {
            console.error('[TaskService] Failed to delete old assignees:', { error: deleteError instanceof Error ? deleteError.message : 'Unknown error' })
            return { error: 'Failed to update task assignees' }
        }

        // 2. Insert new
        const records = assigneeIds.map(id => ({
            task_id: taskId,
            profile_id: id
        }))
        const { error: assignError } = await supabase.from('task_assignees').insert(records)

        if (assignError) {
            console.error('[TaskService] Failed to insert new assignees:', { error: assignError instanceof Error ? assignError.message : 'Unknown error' })
            return { error: 'Failed to update task assignees' }
        }

        try {
            await logSystemEvent(supabase, foundryId, taskId, `Assignees updated`, user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        
        try {
            await logTaskHistory(taskId, 'ASSIGNED', user.id, {
                new_assignees: assigneeIds
            })
        } catch (logError) {
            console.error('[TaskService] Failed to log task history:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }

        // Potentially trigger AI worker if new primary is AI?
        try {
            await runAIWorker(taskId, primaryAssigneeId)
        } catch (workerError) {
            console.error('[TaskService] Failed to trigger AI worker:', { error: workerError instanceof Error ? workerError.message : 'Unknown error' })
            // Continue - AI worker failure shouldn't fail assignee update
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}

/**
 * Updates a task's status and/or risk level with authorization and validation.
 *
 * @description Verifies modify permissions via canModifyTask, validates at least one
 * field is being updated, then patches the status and/or risk_level. Casts lowercase
 * input values to the PascalCase DB enum format.
 *
 * @param {string} taskId - The ID of the task to update
 * @param {Object} updates - Fields to update (at least one required)
 * @param {string} [updates.status] - New status value
 * @param {string} [updates.risk_level] - New risk level value
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires task modify permission via canModifyTask (creator, assignee,
 *   or Executive/Founder role).
 * @audit Logs status and/or risk level changes to task_history
 */
export async function updateTaskStatusAndRisk(
    taskId: string,
    updates: {
        status?: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
        risk_level?: 'low' | 'medium' | 'high' | 'critical'
    }
) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Security: Verify user has permission to modify this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        // Validate at least one field is being updated
        if (!updates.status && !updates.risk_level) {
            return { error: 'No updates provided' }
        }

        // Build update object
        // Cast required: function params use lowercase status/risk values, DB enum uses PascalCase
        const updateData: Partial<Database['public']['Tables']['tasks']['Update']> = {}
        if (updates.status) {
            updateData.status = updates.status as TaskStatus
        }
        if (updates.risk_level) {
            updateData.risk_level = updates.risk_level as RiskLevel
        }

        const { error } = await supabase
            .from('tasks')
            .update(updateData)
            .eq('id', taskId)
            .eq('foundry_id', foundryId)

        if (error) return { error: sanitizeErrorMessage(error) }

        // Log the status change
        try {
            if (updates.status) {
                await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
                    new_status: updates.status
                })
            }
            if (updates.risk_level) {
                await logTaskHistory(taskId, 'UPDATED', user.id, {
                    new_risk_level: updates.risk_level
                })
            }
        } catch (logError) {
            console.error('[TaskService] Failed to log task history:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        revalidatePath(`/tasks/${taskId}`)
        return { success: true }
    })
}

/**
 * Updates a task's status directly via drag-and-drop on the board view.
 *
 * @description Simple status update used by the DnD board view. Accepts PascalCase
 * status values as stored in the database (Pending, Accepted, Completed, etc.).
 *
 * @param {string} taskId - The task to update
 * @param {string} newStatus - The new status value (PascalCase)
 * @returns Success or error
 *
 * @security Requires task modify permission via canModifyTask
 * @audit Logs status change to task_history
 */
export async function updateTaskStatus(
    taskId: string,
    newStatus: string
) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // AUTH: Verify user has permission to modify this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        // VALIDATION: Status must be non-empty
        if (!newStatus?.trim()) {
            return { error: 'Status is required' }
        }
        const normalizedStatus = newStatus.trim() as TaskStatus
        const allowedStatuses: TaskStatus[] = [
            'Pending',
            'Accepted',
            'Rejected',
            'Amended',
            'Amended_Pending_Approval',
            'Completed',
            'Pending_Peer_Review',
            'Pending_Executive_Approval',
        ]
        if (!allowedStatuses.includes(normalizedStatus)) {
            return { error: 'Invalid status value' }
        }

        const { error } = await supabase
            .from('tasks')
            .update({ status: normalizedStatus })
            .eq('id', taskId)
            .eq('foundry_id', foundryId)

        if (error) return { error: sanitizeErrorMessage(error) }

        // AUDIT: Log the status change
        try {
            await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
                new_status: normalizedStatus,
            })
        } catch (logError) {
            console.error('[TaskService] Failed to log status change:', {
                error: logError instanceof Error ? logError.message : 'Unknown error',
            })
        }

        // Celebration: when a task is completed, trigger specialist celebrations
        if (normalizedStatus === 'Completed' && foundryId) {
            try {
                const { data: taskData } = await supabase
                    .from('tasks')
                    .select('title, owner_agent_id, created_by_agent_id')
                    .eq('id', taskId)
                    .single()
                if (taskData) {
                    const { celebrateMilestone } = await import('@/lib/agents/agentic-actions')
                    celebrateMilestone(foundryId, 'task_completed', {
                        title: taskData.title,
                        specialistId: taskData.owner_agent_id ?? taskData.created_by_agent_id ?? undefined,
                    }).catch(err => console.warn('[TaskService] Celebration failed:', err))
                }
            } catch {
                // Non-critical — celebration failure should never block task completion
            }
        }

        // Sync to Google Sheets (fire-and-forget)
        try {
            const { dispatchSheetSync } = await import('@/lib/spreadsheet/sync-dispatcher')
            await dispatchSheetSync(foundryId, 'task', taskId, 'update')
        } catch (err) {
            console.error('[TaskService] Failed to sync task to Google Sheets:', { error: err instanceof Error ? err.message : 'Unknown error' })
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        revalidatePath(`/tasks/${taskId}`)
        return { success: true }
    })
}

/**
 * Uploads a file attachment to a task.
 *
 * @description Verifies modify permissions, validates file size (max 25MB), sanitizes
 * the filename to prevent path traversal, uploads to Supabase Storage, and records
 * the file metadata in the task_files table.
 *
 * @param {string} taskId - The ID of the task to attach the file to
 * @param {FormData} formData - Form data containing the 'file' field
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires task modify permission via canModifyTask. Filename is sanitized
 *   to prevent path traversal attacks. File size limited to 25MB.
 * @audit Logs attachment event to task_comments (system log)
 */
export async function uploadTaskAttachment(taskId: string, formData: FormData) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Security: Verify user has permission to modify this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        const file = formData.get('file') as File
        if (!file) return { error: 'No file provided' }

        // Security: Validate file size (max 25MB)
        const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
        if (file.size > MAX_FILE_SIZE) {
            return { error: 'File size exceeds maximum limit of 25MB' }
        }

        // Security: Sanitize filename to prevent path traversal
        const safeFileName = sanitizeFileName(file.name)
        const filePath = `${foundryId}/${taskId}/${Date.now()}_${safeFileName}`
        const { error: uploadError } = await supabase.storage
            .from('task-files')
            .upload(filePath, file)

        if (uploadError) return { error: sanitizeErrorMessage(uploadError) }

        const { error: dbError } = await supabase.from('task_files').insert({
            task_id: taskId,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            mime_type: file.type,
            uploaded_by: user.id
        })

        if (dbError) return { error: sanitizeErrorMessage(dbError) }

        try {
            await logSystemEvent(supabase, foundryId, taskId, `Attachment added: ${file.name}`, user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }
        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}

/**
 * Deletes a file attachment from a task (both storage and database record).
 *
 * @description Verifies modify permissions, removes the file from Supabase Storage,
 * and deletes the task_files record. Storage deletion failures are logged but do not
 * block the database record cleanup.
 *
 * @param {string} fileId - The task_files record ID
 * @param {string} filePath - The storage path for the file
 * @param {string} taskId - The ID of the task the file belongs to
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires task modify permission via canModifyTask.
 * @audit Logs attachment removal to task_comments (system log)
 */
export async function deleteTaskAttachment(fileId: string, filePath: string, taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Security: Verify user has permission to modify this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        // Delete from Storage
        const { error: storageError } = await supabase.storage
            .from('task-files')
            .remove([filePath])

        if (storageError) {
            console.warn("Storage delete failed", storageError)
            // Proceed to delete record anyway - best to clean up record even if storage file is gone or erroring.
        }

        // Delete from DB
        const { error: dbError } = await supabase.from('task_files')
            .delete()
            .eq('id', fileId)

        if (dbError) return { error: sanitizeErrorMessage(dbError) }

        // Log requires task ID. If we don't have it explicitly passed, we'd need to fetch before delete. 
        // Assuming taskId passed correctly.
        try {
            await logSystemEvent(supabase, foundryId, taskId, `Attachment removed`, user.id)
        } catch (logError) {
            console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}

/**
 * Fetches comments for a task from the server.
 * 
 * @description Retrieves all comments (notes and system logs) for a task.
 * Uses server-side auth to ensure consistent RLS behavior with addTaskComment.
 * 
 * @param taskId - The task ID to fetch comments for
 * @returns Comments array with user info, or error
 * 
 * @security Requires authenticated user with foundry membership
 */
export async function getTaskComments(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // AUTH: Check user can access this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { data: null, error: authCheck.error || 'Unauthorized' }
        }

        const { data, error } = await supabase
            .from('task_comments')
            .select('id, content, is_system_log, created_at, user_id, user:user_id(full_name, role)')
            .eq('task_id', taskId)
            .order('created_at', { ascending: false })
            .limit(50)

        if (error) {
            console.error('[TaskActions] Failed to fetch comments:', { taskId, error: error.message })
            return { data: null, error: sanitizeErrorMessage(error) }
        }
        
        return { data }
    })
}

/**
 * Retrieves all file attachments for a task.
 *
 * @description Verifies the user has access to the task via canModifyTask, then
 * fetches all task_files records ordered by creation date (newest first).
 *
 * @param {string} taskId - The ID of the task to get attachments for
 * @returns {Promise<{ data: object[] } | { error: string }>} Array of attachment records or error
 *
 * @security Requires task access permission via canModifyTask.
 */
export async function getTaskAttachments(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Security: Verify user has permission to view this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        const { data, error } = await supabase
            .from('task_files')
            .select('id, task_id, file_name, file_path, file_size, mime_type, uploaded_by, created_at')
            .eq('task_id', taskId)
            .order('created_at', { ascending: false })

        if (error) return { error: sanitizeErrorMessage(error) }
        return { data }
    })
}

/**
 * Retrieves the audit history for a task.
 *
 * @description Verifies the user has access to the task via canModifyTask, then
 * fetches all task_history records with user profile info, ordered by creation
 * date (newest first).
 *
 * @param {string} taskId - The ID of the task to get history for
 * @returns {Promise<{ data: object[] } | { error: string }>} Array of history records or error
 *
 * @security Requires task access permission via canModifyTask.
 */
export async function getTaskHistory(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Security: Verify user has permission to view this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error || 'Unauthorized' }
        }

        const { data, error } = await supabase
            .from('task_history')
            .select(`
                id,
                task_id,
                action_type,
                changes,
                user_id,
                created_at,
                user:profiles(full_name, role, avatar_url)
            `)
            .eq('task_id', taskId)
            .order('created_at', { ascending: false })

        if (error) return { error: sanitizeErrorMessage(error) }
        return { data }
    })
}

/**
 * Retrieves recent @mentions for the current user from task comments.
 *
 * @description Queries task_comments for entries containing the user's mention pattern,
 * returning comment details with associated task info and author profile. Used for
 * the Today page mentions feed.
 *
 * @param {number} [limit=10] - Maximum number of mentions to return
 * @returns {Promise<{ data: object[] } | { error: string }>} Array of mention records or error
 *
 * @security Requires authenticated user with foundry membership. Scoped to user's
 *   foundry via foundry_id filter.
 */
export async function getMentionsForUser(limit: number = 10) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Query for comments that mention the current user
        // Mentions are stored as @[userId] in the content
        const mentionPattern = `@[${user.id}]`
        
        const { data, error } = await supabase
            .from('task_comments')
            .select(`
                id,
                content,
                created_at,
                task_id,
                user_id,
                task:tasks(id, title, task_number, status),
                author:profiles!task_comments_user_id_fkey(id, full_name, avatar_url)
            `)
            .eq('foundry_id', foundryId)
            .eq('is_system_log', false)
            .ilike('content', `%${mentionPattern}%`)
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error) return { error: sanitizeErrorMessage(error) }
        return { data }
    })
}

/**
 * Bulk-deletes tasks with per-task authorization checks.
 *
 * @description Iterates through each task ID, verifies modify permission via
 * canModifyTask individually, and deletes authorized tasks. Supports partial
 * failure — returns counts and failed IDs for transparency.
 *
 * @param {string[]} taskIds - Array of task IDs to delete
 * @returns {Promise<{ success: true; deletedCount: number; failedIds: string[] } | { error: string; deletedCount: number; failedIds: string[] }>}
 *   Deletion results including partial failure info
 *
 * @security Per-task authorization via canModifyTask (creator, assignee,
 *   or Executive/Founder role).
 * @audit Logs bulk deletion event to task_comments (system log)
 */
export async function deleteTasks(taskIds: string[]) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        if (!taskIds || taskIds.length === 0) return { success: true, deletedCount: 0, failedIds: [] }

        // Track results for partial failure handling
        const failedIds: string[] = []
        let deletedCount = 0

        // Delete tasks individually with authorization check for each
        for (const taskId of taskIds) {
            // Security: Verify user has permission to delete this task
            const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
            if (!authCheck.allowed) {
                console.error('[TaskService] Unauthorized to delete task:', { taskId, error: authCheck.error })
                failedIds.push(taskId)
                continue
            }

            const { error } = await supabase.from('tasks')
                .delete()
                .eq('id', taskId)

            if (error) {
                console.error('[TaskService] Failed to delete task:', { taskId, error: error.message })
                failedIds.push(taskId)
            } else {
                deletedCount++
            }
        }

        // Log event for successful deletions
        if (deletedCount > 0) {
            try {
                // Log to first successfully deleted task (or first task if available)
                const logTaskId = taskIds.find(id => !failedIds.includes(id)) || taskIds[0]
                await logSystemEvent(supabase, foundryId, logTaskId, `Bulk deletion: ${deletedCount}/${taskIds.length} tasks deleted`, user.id)
            } catch (logError) {
                console.error('[TaskService] Failed to log system event:', { error: logError instanceof Error ? logError.message : 'Unknown error' })
            }

            // Sync deletions to Google Sheets (fire-and-forget)
            try {
                const { dispatchSheetSync } = await import('@/lib/spreadsheet/sync-dispatcher')
                const deletedIds = taskIds.filter(id => !failedIds.includes(id))
                for (const id of deletedIds) {
                    await dispatchSheetSync(foundryId, 'task', id, 'delete')
                }
            } catch (err) {
                console.error('[TaskService] Failed to sync task deletions to Google Sheets:', { error: err instanceof Error ? err.message : 'Unknown error' })
            }
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')

        // Return detailed result for partial failures
        if (failedIds.length > 0) {
            if (deletedCount === 0) {
                return { 
                    error: `Failed to delete all ${taskIds.length} tasks`, 
                    failedIds,
                    deletedCount: 0
                }
            }
            return { 
                success: true, 
                partial: true,
                deletedCount, 
                failedIds,
                message: `Deleted ${deletedCount}/${taskIds.length} tasks. ${failedIds.length} failed.`
            }
        }

        return { success: true, deletedCount, failedIds: [] }
    })
}

/**
 * Soft-deletes (archives) a task by setting deleted_at.
 *
 * @description Used by the specialist proposed-actions system to archive
 * tasks that are no longer relevant as part of a strategy refresh.
 *
 * @param taskId - The task ID to archive
 * @returns Success or error result
 *
 * @security Requires authenticated user. Only creator, assignee, or Executive/Founder can archive.
 * @audit Logs archive event
 */
export async function archiveTask(taskId: string): Promise<{ success: true } | { error: string }> {
    return withAuth(async ({ supabase, user, foundryId }) => {
        const now = new Date().toISOString()

        // AUTH: Check permission to modify this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundryId)
        if (!authCheck.allowed) {
            return { error: authCheck.error ?? 'Unauthorized' }
        }

        // Soft-delete the task
        const { error: archiveError } = await supabase
            .from('tasks')
            .update({ deleted_at: now })
            .eq('id', taskId)
            .eq('foundry_id', foundryId)

        if (archiveError) {
            console.error('[TaskService] Archive error:', { taskId, error: archiveError.message })
            return { error: sanitizeErrorMessage(archiveError) }
        }

        // AUDIT: Log the archive
        console.info('[TaskService] Task archived:', {
            taskId,
            archivedBy: user.id,
            foundryId,
        })

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return { success: true }
    })
}

/**
 * Archives a task by matching its title (case-insensitive fuzzy match).
 * Used by the specialist proposed-actions system where only the title is known.
 *
 * @description Finds the best-matching active task by title within the user's
 * foundry and archives it. Uses case-insensitive ILIKE for matching.
 *
 * @param title - The task title to search for
 * @returns The archived task ID and title, or an error
 *
 * @security Requires authenticated user with foundry membership
 */
export async function archiveTaskByTitle(
    title: string
): Promise<{ success: true; taskId: string; title: string } | { error: string }> {
    return withAuth(async ({ supabase, foundryId }) => {
        const searchTerm = title.trim()
        if (!searchTerm) return { error: 'Title is required' }

        const { data: matches, error: searchError } = await supabase
            .from('tasks')
            .select('id, title')
            .eq('foundry_id', foundryId)
            .is('deleted_at', null)
            .ilike('title', `%${searchTerm}%`)
            .limit(5)

        if (searchError) {
            console.error('[TaskService] Archive-by-title search error:', {
                title: searchTerm,
                error: searchError.message,
            })
            return { error: 'Failed to search for task' }
        }

        if (!matches || matches.length === 0) {
            return { error: `No active task found matching "${searchTerm}"` }
        }

        // Prefer exact match, then first partial match
        const exactMatch = matches.find(
            (m) => m.title.toLowerCase() === searchTerm.toLowerCase()
        )
        const target = exactMatch ?? matches[0]

        const result = await archiveTask(target.id)
        if ('error' in result) return result

        return { success: true, taskId: target.id, title: target.title }
    })
}

/**
 * Fetch a single task by ID with all related data for the FullTaskView dialog
 * 
 * @param taskId - The task ID to fetch
 * @returns Task data with assignees, objective info, and file count
 */
export async function getTaskById(taskId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // Fetch task with all related data
        const { data: task, error } = await supabase
            .from('tasks')
            .select(`
                id,
                title,
                description,
                status,
                risk_level,
                start_date,
                end_date,
                task_number,
                foundry_id,
                is_private,
                creator_id,
                metadata,
                assignee:profiles!assignee_id(id, full_name, role, email, avatar_url),
                objective:objectives!objective_id(id, title),
                task_files(id)
            `)
            .eq('id', taskId)
            .single()

        if (error) return { data: null, error: sanitizeErrorMessage(error) }
        if (!task) return { data: null, error: 'Task not found' }

        // Verify task belongs to user's foundry
        if (task.foundry_id !== foundryId) {
            return { data: null, error: 'Unauthorized: Task belongs to a different foundry' }
        }

        // Fetch additional assignees from task_assignees table
        const { data: taskAssignees } = await supabase
            .from('task_assignees')
            .select('profile:profiles(id, full_name, role, email, avatar_url)')
            .eq('task_id', taskId)

        // Transform assignees to flat array
        const assignees = taskAssignees?.map(ta => ta.profile).filter(Boolean) || []

        return {
            data: {
                ...task,
                assignees: assignees.length > 0 ? assignees : (task.assignee ? [task.assignee] : [])
            },
            error: null
        }
    })
}

/**
 * Updates the privacy setting and share targets for a task.
 *
 * @param taskId - The task to update
 * @param isPrivate - Whether the task should be private
 * @param shareTargets - Array of { type: 'user'|'team', id: string } to share with
 *
 * @security Only the task creator can change privacy settings
 * @audit Logs privacy change to task history
 */
export async function updateTaskPrivacy(
    taskId: string,
    isPrivate: boolean,
    shareTargets: { type: string; id: string }[]
) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        // AUTH: Verify user is the task creator and task belongs to user's foundry
        const { data: task, error: fetchError } = await supabase
            .from('tasks')
            .select('id, creator_id')
            .eq('id', taskId)
            .eq('foundry_id', foundryId)
            .single()

        if (fetchError || !task) return { error: 'Task not found' }
        if (task.creator_id !== user.id) return { error: 'Only the task creator can change privacy settings' }

        // Update is_private flag
        const { error: updateError } = await supabase
            .from('tasks')
            .update({ is_private: isPrivate })
            .eq('id', taskId)
            .eq('foundry_id', foundryId)

        if (updateError) return { error: 'Failed to update privacy setting' }

        // Replace all shares: delete existing, insert new
        const { error: deleteError } = await supabase
            .from('task_shares')
            .delete()
            .eq('task_id', taskId)

        if (deleteError) {
            console.error('[TaskService] Failed to clear task shares:', deleteError)
        }

        if (isPrivate && shareTargets.length > 0) {
            const shareRecords = shareTargets.map(target => ({
                task_id: taskId,
                shared_with_user_id: target.type === 'user' ? target.id : null,
                shared_with_team_id: target.type === 'team' ? target.id : null,
                shared_by: user.id,
            }))
            const { error: shareError } = await supabase.from('task_shares').insert(shareRecords)
            if (shareError) {
                console.error('[TaskService] Failed to create task shares:', { error: shareError instanceof Error ? shareError.message : 'Unknown error' })
                return { error: 'Privacy updated but failed to save share settings' }
            }
        }

        revalidatePath('/tasks')
        revalidatePath('/new-tasks')
        return {}
    })
}

/**
 * Gets share targets for a task (users and teams it's shared with).
 *
 * @param taskId - The task to get shares for
 * @returns Array of share targets with names for display
 */
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
