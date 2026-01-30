'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Database } from '@/types/database.types'
import { runAIWorker } from '@/lib/ai-worker'
import { logTaskHistory } from '@/lib/audit'
import { createTaskSchema, updateTaskDatesSchema, addCommentSchema, validate } from '@/lib/validations'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { withRetry } from '@/lib/retry'
import { sanitizeFileName, sanitizeErrorMessage } from '@/lib/security/sanitize'

// Nudge cooldown duration (1 hour)
const NUDGE_COOLDOWN_MS = 60 * 60 * 1000

export type TaskStatus = Database["public"]["Enums"]["task_status"]
export type RiskLevel = Database["public"]["Enums"]["risk_level"]

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
        .eq('id', taskId)
        .single()

    if (taskError || !task) {
        return { allowed: false, error: 'Task not found' }
    }

    // Verify task belongs to user's foundry
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

async function logSystemEvent(taskId: string, message: string, userId: string) {
    const supabase = await createClient()
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return

    await supabase.from('task_comments').insert({
        task_id: taskId,
        foundry_id: foundry_id,
        user_id: userId,
        content: message,
        is_system_log: true
    })
}

export async function createTask(formData: FormData) {
    const supabase = await createClient()
    const foundry_id = await getFoundryIdCached()
    const { data: { user } } = await supabase.auth.getUser()
    if (!foundry_id || !user) return { error: 'Unauthorized' }

    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const objectiveId = formData.get('objective_id') as string
    const assigneeId = formData.get('assignee_id') as string
    const assigneeIdsJson = formData.get('assignee_ids') as string
    const startDate = formData.get('start_date') as string
    const endDate = formData.get('end_date') as string
    const riskLevelRaw = formData.get('risk_level') as string
    const fileCountRaw = formData.get('file_count') as string || '0'

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

        } catch {
            // Fall back to single assignee
            assigneeIds = [assigneeId]
        }
    }

    // Validate using Zod schema
    // Convert empty strings to null/undefined for optional fields
    const rawData = {
        title: title || '',
        description: description?.trim() || undefined,
        objectiveId: objectiveId?.trim() || undefined,
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

    // Ensure we have at least one assignee after validation
    if (validatedAssigneeIds.length === 0 || !validatedAssigneeIds[0]) {
        return { error: 'At least one assignee is required' }
    }

    // Create the task (with primary assignee for backward compatibility)
    let data
    try {
        data = await withRetry(async () => {
            const result = await supabase.from('tasks').insert({
                foundry_id,
                title: validatedTitle.trim(),
                description: validatedDescription || null,
                objective_id: validatedObjectiveId || null,
                creator_id: user.id,
                assignee_id: validatedAssigneeIds[0], // Primary assignee
                start_date: startDate || null,
                end_date: deadline || null,
                status: 'Pending',
                risk_level: riskLevel,
                client_visible: false // Always hidden initially
            }).select().single()
            if (result.error) throw result.error
            return result.data
        })
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create task' }
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
            console.error('Failed to assign task assignees:', assigneeError)
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
            const filePath = `${foundry_id}/${data.id}/${Date.now()}_${safeFileName}`
            const { error: uploadError } = await supabase.storage
                .from('task-files')
                .upload(filePath, file)

            if (uploadError) {
                console.error('File upload error:', uploadError)
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
                console.error('Failed to record file in database:', fileRecordError)
                // Continue - file is uploaded but record failed
            }
        }
    }

    // Log Creation
    try {
        await logSystemEvent(data.id, `Task created by User (Risk: ${riskLevel})`, user.id)
    } catch (error) {
        console.error('Failed to log system event:', error)
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
        console.error('Failed to log task history:', error)
        // Continue - logging failure shouldn't fail task creation
    }

    // Trigger AI Worker for primary assignee
    try {
        await runAIWorker(data.id, validatedAssigneeIds[0])
    } catch (error) {
        console.error('Failed to trigger AI worker:', error)
        // Continue - AI worker failure shouldn't fail task creation
    }

    revalidatePath('/tasks')
    return { success: true }
}

export async function acceptTask(taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Verify user is the assignee
    const { data: task, error: fetchError } = await supabase
        .from('tasks')
        .select('assignee_id')
        .eq('id', taskId)
        .single()

    if (fetchError || !task) return { error: 'Task not found' }

    if (task.assignee_id !== user.id) {
        return { error: 'Unauthorized: You are not the assignee of this task' }
    }

    const { error } = await supabase.from('tasks')
        .update({ status: 'Accepted' })
        .eq('id', taskId)

    if (error) return { error: sanitizeErrorMessage(error) }

    try {
        await logSystemEvent(taskId, 'Task Accepted', user.id)
    } catch (logError) {
        console.error('Failed to log system event:', logError)
    }
    
    try {
        await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
            old_status: 'Pending', // Assumption, or we could fetch
            new_status: 'Accepted'
        })
    } catch (logError) {
        console.error('Failed to log task history:', logError)
    }
    revalidatePath('/tasks')
    return { success: true }
}

export async function rejectTask(taskId: string, reason: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    if (!reason) return { error: 'Reason required for rejection' }

    // Security: Verify user has permission to modify this task
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    const authCheck = await canModifyTask(supabase, taskId, user.id, foundry_id)
    if (!authCheck.allowed) {
        return { error: authCheck.error || 'Unauthorized' }
    }

    const { error } = await supabase.from('tasks')
        .update({ status: 'Rejected' })
        .eq('id', taskId)

    if (error) return { error: sanitizeErrorMessage(error) }

    try {
        await logSystemEvent(taskId, `Task Rejected. Reason: ${reason}`, user.id)
    } catch (logError) {
        console.error('Failed to log system event:', logError)
    }
    
    try {
        await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
            new_status: 'Rejected',
            reason
        })
    } catch (logError) {
        console.error('Failed to log task history:', logError)
    }
    revalidatePath('/tasks')
    return { success: true }
}

export async function forwardTask(taskId: string, newAssigneeId: string, reason: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    if (!reason) return { error: 'Reason required for forwarding' }

    // Fetch current task for history
    const { data: task } = await supabase.from('tasks').select('forwarding_history, assignee_id').eq('id', taskId).single()
    if (!task) return { error: 'Task not found' }

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
            forwarding_history: newHistory as unknown as Database['public']['Tables']['tasks']['Update']['forwarding_history']
            // Status remains Pending or whatever it was? Usually Forwarding resets to Pending for the new person to Accept? 
            // "The recipient can send the task to a third user... The task remains Pending but the assignee updates." (User Prompt)
        })
        .eq('id', taskId)

    if (error) return { error: sanitizeErrorMessage(error) }

    // Sync task_assignees table: delete old assignees and insert new one
    const { error: deleteError } = await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', taskId)
    
    if (deleteError) {
        console.error('Failed to delete old task assignees:', deleteError)
    }

    const { error: insertError } = await supabase
        .from('task_assignees')
        .insert({ task_id: taskId, profile_id: newAssigneeId })
    
    if (insertError) {
        console.error('Failed to insert new task assignee:', insertError)
        return { error: 'Failed to update task assignees' }
    }

    // Log with names ideally, but IDs for now
    try {
        await logSystemEvent(taskId, `Task forwarded to new assignee. Reason: ${reason}`, user.id)
    } catch (logError) {
        console.error('Failed to log system event:', logError)
    }
    
    try {
        await logTaskHistory(taskId, 'FORWARDED', user.id, {
            previous_assignee: task.assignee_id,
            new_assignee: newAssigneeId,
            reason
        })
    } catch (logError) {
        console.error('Failed to log task history:', logError)
    }

    // Trigger AI Worker
    try {
        await runAIWorker(taskId, newAssigneeId)
    } catch (workerError) {
        console.error('Failed to trigger AI worker:', workerError)
        // Continue - AI worker failure shouldn't fail forwarding
    }

    revalidatePath('/tasks')
    return { success: true }
}

export async function amendTask(taskId: string, updates: {
    start_date?: string,
    end_date?: string,
    amendment_notes: string
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    if (!updates.amendment_notes) return { error: 'Amendment notes required' }

    // Security: Verify user has permission to modify this task
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    const authCheck = await canModifyTask(supabase, taskId, user.id, foundry_id)
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

    if (error) return { error: sanitizeErrorMessage(error) }

    // Fire-and-forget logging - errors shouldn't fail the main operation
    try {
        await logSystemEvent(taskId, `Task Amended. Notes: ${updates.amendment_notes}`, user.id)
    } catch (logError) {
        console.error('Failed to log system event:', logError)
    }
    
    try {
        await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
            new_status: 'Amended_Pending_Approval',
            amendment_notes: updates.amendment_notes,
            new_dates: { start: updates.start_date, end: updates.end_date }
        })
    } catch (logError) {
        console.error('Failed to log task history:', logError)
    }
    
    revalidatePath('/tasks')
    return { success: true }
}

export async function approveAmendment(taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Security: Verify user has permission to approve amendments
    // Should be the task creator or assignee who requested the amendment
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    const authCheck = await canModifyTask(supabase, taskId, user.id, foundry_id)
    if (!authCheck.allowed) {
        return { error: authCheck.error || 'Unauthorized' }
    }

    const { error } = await supabase.from('tasks')
        .update({ status: 'Accepted' }) // "Once User A accepts... automatically changes to Accepted"
        .eq('id', taskId)

    if (error) return { error: sanitizeErrorMessage(error) }

    // Fire-and-forget logging - errors shouldn't fail the main operation
    try {
        await logSystemEvent(taskId, 'Amendment Approved. Task is now Accepted.', user.id)
    } catch (logError) {
        console.error('Failed to log system event:', logError)
    }
    
    try {
        await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
            old_status: 'Amended_Pending_Approval',
            new_status: 'Accepted'
        })
    } catch (logError) {
        console.error('Failed to log task history:', logError)
    }
    
    revalidatePath('/tasks')
    return { success: true }
}

export async function addTaskComment(taskId: string, content: string) {
    const supabase = await createClient()
    const foundry_id = await getFoundryIdCached()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !foundry_id) return { error: 'Unauthorized' }

    // Validate using Zod schema
    const validation = validate(addCommentSchema, { taskId, content })
    if (!validation.success) {
        return { error: 'error' in validation ? validation.error : 'Validation failed' }
    }

    const { content: validatedContent } = validation.data

    const { error } = await supabase.from('task_comments').insert({
        task_id: taskId,
        foundry_id: foundry_id,
        user_id: user.id,
        content: validatedContent,
        is_system_log: false
    })

    if (error) return { error: sanitizeErrorMessage(error) }

    revalidatePath('/tasks')
    return { success: true }
}

export async function completeTask(taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Fetch Risk Level
    const { data: task, error: fetchError } = await supabase
        .from('tasks')
        .select('risk_level, status')
        .eq('id', taskId)
        .single()

    if (fetchError || !task) return { error: 'Task not found' }

    let nextStatus: TaskStatus = 'Completed'
    let clientVisible = true

    if (task.risk_level === 'Medium') {
        nextStatus = 'Pending_Peer_Review'
        clientVisible = false
    } else if (task.risk_level === 'High') {
        nextStatus = 'Pending_Executive_Approval'
        clientVisible = false
    }

    const updates: Partial<Database['public']['Tables']['tasks']['Update']> = { status: nextStatus }
    // Only set end_date if actually fully completed
    if (nextStatus === 'Completed') {
        updates.end_date = new Date().toISOString()
        updates.client_visible = true // Explicitly set visible
    }

    const { error } = await supabase.from('tasks')
        .update(updates)
        .eq('id', taskId)

    if (error) return { error: sanitizeErrorMessage(error) }

    try {
        await logSystemEvent(taskId, `Task marked as ${nextStatus} (Risk: ${task.risk_level})`, user.id)
    } catch (logError) {
        console.error('Failed to log system event:', logError)
    }
    
    try {
        await logTaskHistory(taskId, nextStatus === 'Completed' ? 'COMPLETED' : 'STATUS_CHANGE', user.id, {
            new_status: nextStatus,
            risk_level: task.risk_level,
            completed_at: nextStatus === 'Completed' ? new Date().toISOString() : undefined
        })
    } catch (logError) {
        console.error('Failed to log task history:', logError)
    }
    revalidatePath('/tasks')
    return { success: true, newStatus: nextStatus }
}

export async function approveTask(taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Fetch task and user profile checks
    const { data: task } = await supabase.from('tasks').select('risk_level, status').eq('id', taskId).single()
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

    // Release Logic
    const { error } = await supabase.from('tasks')
        .update({
            status: 'Completed',
            client_visible: true,
            end_date: new Date().toISOString()
        })
        .eq('id', taskId)

    if (error) return { error: sanitizeErrorMessage(error) }

    // Fire-and-forget logging - errors shouldn't fail the main operation
    try {
        await logSystemEvent(taskId, `Task Approved & Released by ${approver.role}`, user.id)
    } catch (logError) {
        console.error('Failed to log system event:', logError)
    }
    
    try {
        await logTaskHistory(taskId, 'COMPLETED', user.id, {
            approver_role: approver.role,
            via_approval: true
        })
    } catch (logError) {
        console.error('Failed to log task history:', logError)
    }

    revalidatePath('/tasks')
    return { success: true }
}

// Get all tasks pending executive approval
export async function getPendingApprovals() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized', data: [] }

    // Check if user is Executive or Founder
    const { data: profile } = await supabase.from('profiles').select('role, foundry_id').eq('id', user.id).single()
    if (!profile || (profile.role !== 'Executive' && profile.role !== 'Founder')) {
        return { error: 'Only Executives and Founders can view pending approvals', data: [] }
    }

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
        .in('status', ['Pending_Executive_Approval', 'Amended_Pending_Approval'])
        .order('created_at', { ascending: false })

    if (error) return { error: sanitizeErrorMessage(error), data: [] }

    return { data: tasks || [] }
}

// Batch approve multiple tasks
export async function batchApproveTasks(taskIds: string[]) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    if (!taskIds || taskIds.length === 0) return { error: 'No tasks provided' }

    // Check if user is Executive or Founder
    const { data: approver } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!approver || (approver.role !== 'Executive' && approver.role !== 'Founder')) {
        return { error: 'Only Executives and Founders can batch approve tasks' }
    }

    // Update all tasks at once
    const { error } = await supabase.from('tasks')
        .update({
            status: 'Completed',
            client_visible: true,
            end_date: new Date().toISOString()
        })
        .in('id', taskIds)

    if (error) return { error: sanitizeErrorMessage(error) }

    // Log events for each task
    for (const taskId of taskIds) {
        try {
            await logSystemEvent(taskId, `Task Batch Approved & Released by ${approver.role}`, user.id)
            await logTaskHistory(taskId, 'COMPLETED', user.id, {
                approver_role: approver.role,
                via_batch_approval: true,
                batch_size: taskIds.length
            })
        } catch (logError) {
            console.error('Failed to log task:', logError)
        }
    }

    revalidatePath('/tasks')
    revalidatePath('/dashboard')
    return { success: true, approvedCount: taskIds.length }
}

// Batch reject multiple tasks
export async function batchRejectTasks(taskIds: string[], reason: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    if (!taskIds || taskIds.length === 0) return { error: 'No tasks provided' }
    if (!reason?.trim()) return { error: 'Rejection reason is required' }

    // Check if user is Executive or Founder
    const { data: approver } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!approver || (approver.role !== 'Executive' && approver.role !== 'Founder')) {
        return { error: 'Only Executives and Founders can batch reject tasks' }
    }

    // Update all tasks at once - send back to Pending status
    const { error } = await supabase.from('tasks')
        .update({
            status: 'Pending',
            rejection_reason: reason.trim()
        })
        .in('id', taskIds)

    if (error) return { error: sanitizeErrorMessage(error) }

    // Log events for each task
    for (const taskId of taskIds) {
        try {
            await logSystemEvent(taskId, `Task Batch Rejected by ${approver.role}: ${reason}`, user.id)
            await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
                new_status: 'Rejected',
                approver_role: approver.role,
                via_batch_rejection: true,
                reason,
                batch_size: taskIds.length
            })
        } catch (logError) {
            console.error('Failed to log task:', logError)
        }
    }

    revalidatePath('/tasks')
    revalidatePath('/dashboard')
    return { success: true, rejectedCount: taskIds.length }
}

export async function nudgeTask(taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Get user's foundry_id
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    // Verify user has access to the task's foundry
    const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('last_nudge_at, nudge_count, foundry_id')
        .eq('id', taskId)
        .single()

    if (taskError || !task) return { error: 'Task not found' }

    if (task.foundry_id !== foundry_id) {
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
    await logSystemEvent(taskId, "🔴 CLIENT NUDGE: Client requested an update.", user.id)

    revalidatePath('/tasks')
    return { success: true }
}


// --- LIVE PULSE METRICS ---
export async function getPulseMetrics() {
    const supabase = await createClient()
    const foundry_id = await getFoundryIdCached()

    if (!foundry_id) return { actions: 0 }

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
}

export async function updateTaskDates(taskId: string, startDate: string, endDate: string) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: 'Unauthorized' }

        // Get user's foundry_id
        const foundry_id = await getFoundryIdCached()
        if (!foundry_id) return { error: 'User not in a foundry' }

        // Verify user has access to the task's foundry
        const { data: task, error: taskFetchError } = await supabase
            .from('tasks')
            .select('foundry_id')
            .eq('id', taskId)
            .single()

        if (taskFetchError || !task) {
            console.error('Task fetch error:', taskFetchError)
            return { error: 'Task not found' }
        }

        if (task.foundry_id !== foundry_id) {
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
            console.error('Validation error:', 'error' in validation ? validation.error : 'unknown', { startDate, endDate })
            return { error: 'error' in validation ? validation.error : 'Validation failed' }
        }

        const { startDate: validatedStartDate, endDate: validatedEndDate } = validation.data

        const { error } = await supabase.from('tasks')
            .update({
                start_date: validatedStartDate,
                end_date: validatedEndDate
            })
            .eq('id', taskId)

        if (error) {
            console.error('Supabase update error:', error)
            return { error: sanitizeErrorMessage(error) }
        }

        try {
            // Safely format dates for logging (validatedStartDate and validatedEndDate are validated above but add null checks for safety)
            const startDateFormatted = validatedStartDate ? validatedStartDate.split('T')[0] : 'N/A'
            const endDateFormatted = validatedEndDate ? validatedEndDate.split('T')[0] : 'N/A'
            await logSystemEvent(taskId, `Task rescheduled: ${startDateFormatted} → ${endDateFormatted}`, user.id)
        } catch (logError) {
            console.error('Failed to log system event:', logError)
        }
        
        try {
            await logTaskHistory(taskId, 'UPDATED', user.id, {
                field: 'dates',
                new_start: validatedStartDate,
                new_end: validatedEndDate
            })
        } catch (logError) {
            console.error('Failed to log task history:', logError)
        }
        revalidatePath('/timeline')
        revalidatePath('/tasks')
        return { success: true }
    } catch (err) {
        console.error('updateTaskDates unexpected error:', err)
        return { error: 'Failed to update task dates' }
    }
}

export async function triggerAIWorker(taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Fetch task to get assignee
    const { data: task } = await supabase
        .from('tasks')
        .select('assignee_id')
        .eq('id', taskId)
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
        console.error('Failed to trigger AI worker:', workerError)
        return { error: 'Failed to trigger AI worker' }
    }

    revalidatePath('/tasks')
    return { success: true }
}


export async function updateTaskProgress(taskId: string, progress: number) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Security: Verify user has permission to modify this task
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    const authCheck = await canModifyTask(supabase, taskId, user.id, foundry_id)
    if (!authCheck.allowed) {
        return { error: authCheck.error || 'Unauthorized' }
    }

    // Clamp progress between 0 and 100
    const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)))

    const { error } = await supabase.from('tasks')
        .update({ progress: clampedProgress })
        .eq('id', taskId)

    if (error) return { error: sanitizeErrorMessage(error) }

    revalidatePath('/tasks')
    revalidatePath(`/tasks/${taskId}`) // If detailed view exists
    return { success: true, progress: clampedProgress }
}

export async function duplicateTask(originalTaskId: string) {
    const supabase = await createClient()
    const foundry_id = await getFoundryIdCached()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !foundry_id) return { error: 'Unauthorized' }

    // 1. Fetch original task
    const { data: originalTask, error: fetchError } = await supabase
        .from('tasks')
        .select('*, task_number')
        .eq('id', originalTaskId)
        .single()

    if (fetchError || !originalTask) return { error: 'Original task not found' }

    // Verify user has access to the task's foundry
    if (originalTask.foundry_id !== foundry_id) {
        return { error: 'Unauthorized: Task belongs to a different foundry' }
    }

    // 2. Insert new task
    const { data: newTask, error: insertError } = await supabase.from('tasks').insert({
        foundry_id,
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
            console.error('Failed to copy assignees:', assigneeError)
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
        await logSystemEvent(newTask.id, `Task duplicated from ${taskIdentifier}`, user.id)
    } catch (logError) {
        console.error('Failed to log system event:', logError)
    }
    
    try {
        await logTaskHistory(newTask.id, 'CREATED', user.id, {
            source: 'DUPLICATION',
            original_task_id: originalTaskId
        })
    } catch (logError) {
        console.error('Failed to log task history:', logError)
    }
    revalidatePath('/tasks')
    return { success: true }
}

export async function updateTaskDetails(taskId: string, updates: { title?: string, description?: string }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    if (!updates.title && updates.description === undefined) return { success: true } // Nothing to update

    // Security: Verify user has permission to modify this task
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    const authCheck = await canModifyTask(supabase, taskId, user.id, foundry_id)
    if (!authCheck.allowed) {
        return { error: authCheck.error || 'Unauthorized' }
    }

    const { error } = await supabase.from('tasks')
        .update(updates)
        .eq('id', taskId)

    if (error) return { error: sanitizeErrorMessage(error) }

    try {
        await logSystemEvent(taskId, `Task details updated`, user.id)
    } catch (logError) {
        console.error('Failed to log system event:', logError)
    }
    
    try {
        await logTaskHistory(taskId, 'UPDATED', user.id, {
            updates // Log the raw updates object
        })
    } catch (logError) {
        console.error('Failed to log task history:', logError)
    }
    revalidatePath('/tasks')
    return { success: true }
}

export async function updateTaskAssignees(taskId: string, assigneeIds: string[]) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    if (assigneeIds.length === 0) return { error: 'Must have at least one assignee' }

    // Security: Verify user has permission to modify this task
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    const authCheck = await canModifyTask(supabase, taskId, user.id, foundry_id)
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
        console.error('Failed to delete old assignees:', deleteError)
        return { error: 'Failed to update task assignees' }
    }

    // 2. Insert new
    const records = assigneeIds.map(id => ({
        task_id: taskId,
        profile_id: id
    }))
    const { error: assignError } = await supabase.from('task_assignees').insert(records)

    if (assignError) {
        console.error('Failed to insert new assignees:', assignError)
        return { error: 'Failed to update task assignees' }
    }

    try {
        await logSystemEvent(taskId, `Assignees updated`, user.id)
    } catch (logError) {
        console.error('Failed to log system event:', logError)
    }
    
    try {
        await logTaskHistory(taskId, 'ASSIGNED', user.id, {
            new_assignees: assigneeIds
        })
    } catch (logError) {
        console.error('Failed to log task history:', logError)
    }

    // Potentially trigger AI worker if new primary is AI?
    try {
        await runAIWorker(taskId, primaryAssigneeId)
    } catch (workerError) {
        console.error('Failed to trigger AI worker:', workerError)
        // Continue - AI worker failure shouldn't fail assignee update
    }

    revalidatePath('/tasks')
    return { success: true }
}

export async function uploadTaskAttachment(taskId: string, formData: FormData) {
    const supabase = await createClient()
    const foundry_id = await getFoundryIdCached()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !foundry_id) return { error: 'Unauthorized' }

    // Security: Verify user has permission to modify this task
    const authCheck = await canModifyTask(supabase, taskId, user.id, foundry_id)
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
    const filePath = `${foundry_id}/${taskId}/${Date.now()}_${safeFileName}`
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
        await logSystemEvent(taskId, `Attachment added: ${file.name}`, user.id)
    } catch (logError) {
        console.error('Failed to log system event:', logError)
    }
    revalidatePath('/tasks')
    return { success: true }
}

export async function deleteTaskAttachment(fileId: string, filePath: string, taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Security: Verify user has permission to modify this task
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    const authCheck = await canModifyTask(supabase, taskId, user.id, foundry_id)
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
        await logSystemEvent(taskId, `Attachment removed`, user.id)
    } catch (logError) {
        console.error('Failed to log system event:', logError)
    }

    revalidatePath('/tasks')
    return { success: true }
}

export async function getTaskAttachments(taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Security: Verify user has permission to view this task
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    const authCheck = await canModifyTask(supabase, taskId, user.id, foundry_id)
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
}

export async function getTaskHistory(taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Security: Verify user has permission to view this task
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    const authCheck = await canModifyTask(supabase, taskId, user.id, foundry_id)
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
}

/**
 * Get recent mentions for the current user
 * Returns comments where the user was @mentioned, for displaying in the Today page
 */
export async function getMentionsForUser(limit: number = 10) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

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
        .eq('foundry_id', foundry_id)
        .eq('is_system_log', false)
        .ilike('content', `%${mentionPattern}%`)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) return { error: sanitizeErrorMessage(error) }
    return { data }
}

export async function deleteTasks(taskIds: string[]) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    if (!taskIds || taskIds.length === 0) return { success: true, deletedCount: 0, failedIds: [] }

    // Security: Verify user's foundry
    const foundry_id = await getFoundryIdCached()
    if (!foundry_id) return { error: 'User not in a foundry' }

    // Track results for partial failure handling
    const failedIds: string[] = []
    let deletedCount = 0

    // Delete tasks individually with authorization check for each
    for (const taskId of taskIds) {
        // Security: Verify user has permission to delete this task
        const authCheck = await canModifyTask(supabase, taskId, user.id, foundry_id)
        if (!authCheck.allowed) {
            console.error(`Unauthorized to delete task ${taskId}:`, authCheck.error)
            failedIds.push(taskId)
            continue
        }

        const { error } = await supabase.from('tasks')
            .delete()
            .eq('id', taskId)

        if (error) {
            console.error(`Failed to delete task ${taskId}:`, error.message)
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
            await logSystemEvent(logTaskId, `Bulk deletion: ${deletedCount}/${taskIds.length} tasks deleted`, user.id)
        } catch (logError) {
            console.error('Failed to log system event:', logError)
        }
    }

    revalidatePath('/tasks')

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
}
