'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Database } from '@/types/database.types'
import { runAIWorker } from '@/lib/ai-worker'
import { logTaskHistory } from '@/lib/audit'

export type TaskStatus = Database["public"]["Enums"]["task_status"]
export type RiskLevel = Database["public"]["Enums"]["risk_level"]


async function getFoundryId() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // First try metadata
    if (user.app_metadata.foundry_id) return user.app_metadata.foundry_id

    // Fallback: Fetch from public.profiles
    const { data: profile } = await supabase.from('profiles').select('foundry_id').eq('id', user.id).single()
    return profile?.foundry_id
}

async function logSystemEvent(taskId: string, message: string, userId: string) {
    const supabase = await createClient()
    const foundry_id = await getFoundryId()
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
    const foundry_id = await getFoundryId()
    const { data: { user } } = await supabase.auth.getUser()
    if (!foundry_id || !user) return { error: 'Unauthorized' }

    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const objectiveId = formData.get('objective_id') as string
    const assigneeId = formData.get('assignee_id') as string
    const assigneeIdsJson = formData.get('assignee_ids') as string
    const startDate = formData.get('start_date') as string
    const endDate = formData.get('end_date') as string
    const riskLevel = (formData.get('risk_level') as RiskLevel) || 'Low' // Default to Low
    const fileCount = parseInt(formData.get('file_count') as string || '0')

    if (!title || !objectiveId || !assigneeId) {
        return { error: 'Missing required fields' }
    }

    // Parse multiple assignees (if provided)
    let assigneeIds: string[] = [assigneeId]
    if (assigneeIdsJson) {
        try {
            assigneeIds = JSON.parse(assigneeIdsJson)
        } catch {
            // Fall back to single assignee
        }
    }

    // Create the task (with primary assignee for backward compatibility)
    const { data, error } = await supabase.from('tasks').insert({
        foundry_id,
        title,
        description,
        objective_id: objectiveId,
        creator_id: user.id,
        assignee_id: assigneeIds[0], // Primary assignee
        start_date: startDate || null,
        end_date: endDate || null,
        status: 'Pending',
        risk_level: riskLevel,
        client_visible: false // Always hidden initially
    }).select().single()

    if (error) return { error: error.message }

    // Insert additional assignees into task_assignees table
    if (assigneeIds.length > 0) {
        const assigneeRecords = assigneeIds.map(profileId => ({
            task_id: data.id,
            profile_id: profileId
        }))
        await supabase.from('task_assignees').insert(assigneeRecords)
    }

    // Handle file uploads
    if (fileCount > 0) {
        for (let i = 0; i < fileCount; i++) {
            const file = formData.get(`file_${i}`) as File
            if (!file) continue

            // Upload to Supabase Storage
            const filePath = `${foundry_id}/${data.id}/${Date.now()}_${file.name}`
            const { error: uploadError } = await supabase.storage
                .from('task-files')
                .upload(filePath, file)

            if (uploadError) {
                console.error('File upload error:', uploadError)
                continue // Skip failed uploads but don't fail the whole task
            }

            // Record in task_files table
            await supabase.from('task_files').insert({
                task_id: data.id,
                file_name: file.name,
                file_path: filePath,
                file_size: file.size,
                mime_type: file.type,
                uploaded_by: user.id
            })
        }
    }

    // Log Creation
    await logSystemEvent(data.id, `Task created by User (Risk: ${riskLevel})`, user.id)
    await logTaskHistory(data.id, 'CREATED', user.id, {
        title,
        assignee_id: assigneeIds[0],
        initial_status: 'Pending',
        risk_level: riskLevel
    })

    // Trigger AI Worker for primary assignee
    await runAIWorker(data.id, assigneeIds[0])

    revalidatePath('/tasks')
    return { success: true }
}

export async function acceptTask(taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase.from('tasks')
        .update({ status: 'Accepted' })
        .eq('id', taskId)

    if (error) return { error: error.message }

    await logSystemEvent(taskId, 'Task Accepted', user.id)
    await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
        old_status: 'Pending', // Assumption, or we could fetch
        new_status: 'Accepted'
    })
    revalidatePath('/tasks')
    return { success: true }
}

export async function rejectTask(taskId: string, reason: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    if (!reason) return { error: 'Reason required for rejection' }

    const { error } = await supabase.from('tasks')
        .update({ status: 'Rejected' })
        .eq('id', taskId)

    if (error) return { error: error.message }

    await logSystemEvent(taskId, `Task Rejected. Reason: ${reason}`, user.id)
    await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
        new_status: 'Rejected',
        reason
    })
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

    // Get old assignee name (optional, but good for log. Skipping for strict performance, just using IDs in history for now)

    interface ForwardingEvent {
        from_id: string;
        to_id: string;
        reason: string;
        date: string;
    }
    const history = (task.forwarding_history as unknown as ForwardingEvent[]) || []
    const newHistory = [
        ...history,
        {
            from_id: task.assignee_id,
            to_id: newAssigneeId,
            reason: reason,
            date: new Date().toISOString()
        }
    ]

    const { error } = await supabase.from('tasks')
        .update({
            assignee_id: newAssigneeId,
            forwarding_history: newHistory
            // Status remains Pending or whatever it was? Usually Forwarding resets to Pending for the new person to Accept? 
            // "The recipient can send the task to a third user... The task remains Pending but the assignee updates." (User Prompt)
        })
        .eq('id', taskId)

    if (error) return { error: error.message }

    // Log with names ideally, but IDs for now
    await logSystemEvent(taskId, `Task forwarded to new assignee. Reason: ${reason}`, user.id)
    await logTaskHistory(taskId, 'FORWARDED', user.id, {
        previous_assignee: task.assignee_id,
        new_assignee: newAssigneeId,
        reason
    })

    // Trigger AI Worker
    await runAIWorker(taskId, newAssigneeId)

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

    const { error } = await supabase.from('tasks')
        .update({
            status: 'Amended_Pending_Approval',
            start_date: updates.start_date || null,
            end_date: updates.end_date || null,
            amendment_notes: updates.amendment_notes
        })
        .eq('id', taskId)

    if (error) return { error: error.message }

    await logSystemEvent(taskId, `Task Amended. Notes: ${updates.amendment_notes}`, user.id)
    await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, { // Or UPDATED? It changes status too.
        new_status: 'Amended_Pending_Approval',
        amendment_notes: updates.amendment_notes,
        new_dates: { start: updates.start_date, end: updates.end_date }
    })
    revalidatePath('/tasks')
    return { success: true }
}

export async function approveAmendment(taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase.from('tasks')
        .update({ status: 'Accepted' }) // "Once User A accepts... automatically changes to Accepted"
        .eq('id', taskId)

    if (error) return { error: error.message }

    await logSystemEvent(taskId, 'Amendment Approved. Task is now Accepted.', user.id)
    await logTaskHistory(taskId, 'STATUS_CHANGE', user.id, {
        old_status: 'Amended_Pending_Approval',
        new_status: 'Accepted'
    })
    revalidatePath('/tasks')
    return { success: true }
}

export async function addTaskComment(taskId: string, content: string) {
    const supabase = await createClient()
    const foundry_id = await getFoundryId()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !foundry_id) return { error: 'Unauthorized' }

    const { error } = await supabase.from('task_comments').insert({
        task_id: taskId,
        foundry_id: foundry_id,
        user_id: user.id,
        content,
        is_system_log: false
    })

    if (error) return { error: error.message }

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

    const updates: any = { status: nextStatus }
    // Only set end_date if actually fully completed
    if (nextStatus === 'Completed') {
        updates.end_date = new Date().toISOString()
        updates.client_visible = true // Explicitly set visible
    }

    const { error } = await supabase.from('tasks')
        .update(updates)
        .eq('id', taskId)

    if (error) return { error: error.message }

    await logSystemEvent(taskId, `Task marked as ${nextStatus} (Risk: ${task.risk_level})`, user.id)
    await logTaskHistory(taskId, nextStatus === 'Completed' ? 'COMPLETED' : 'STATUS_CHANGE', user.id, {
        new_status: nextStatus,
        risk_level: task.risk_level,
        completed_at: nextStatus === 'Completed' ? new Date().toISOString() : undefined
    })
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

    // Validation Logic
    if (task.status === 'Pending_Executive_Approval') {
        if (approver.role !== 'Executive' && approver.role !== 'Founder') {
            return { error: 'Only Executives can approve High Risk tasks.' } // Rubber stamp needed
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

    if (error) return { error: error.message }

    await logSystemEvent(taskId, `Task Approved & Released by ${approver.role}`, user.id)
    await logTaskHistory(taskId, 'COMPLETED', user.id, {
        approver_role: approver.role,
        via_approval: true
    })

    revalidatePath('/tasks')
    return { success: true }
}

export async function nudgeTask(taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' } // Assuming Client is an authenticated user?

    // Check last nudge to prevent spam? (1 hour cooldown)
    const { data: task } = await supabase.from('tasks').select('last_nudge_at, nudge_count').eq('id', taskId).single()

    if (task?.last_nudge_at) {
        const lastNudge = new Date(task.last_nudge_at).getTime()
        const now = Date.now()
        if (now - lastNudge < 3600000) { // 1 hour
            const remaining = Math.ceil((3600000 - (now - lastNudge)) / 60000)
            return { error: `Please wait ${remaining} minutes before nudging again.` }
        }
    }

    const { error } = await supabase.from('tasks')
        .update({
            nudge_count: (task?.nudge_count || 0) + 1,
            last_nudge_at: new Date().toISOString()
        })
        .eq('id', taskId)

    if (error) return { error: error.message }

    // NOTIFICATION LOGIC (Mock implementation for now)
    // In a real app, this would send an SMS/Slack webhook.
    console.log(`[RED PHONE] Client nudged Task ${taskId}!!`)
    await logSystemEvent(taskId, "🔴 CLIENT NUDGE: Client requested an update.", user.id)

    revalidatePath('/tasks')
    return { success: true }
}


// --- LIVE PULSE METRICS ---
export async function getPulseMetrics() {
    const supabase = await createClient()
    const foundry_id = await getFoundryId()

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
        console.error("Pulse error", error)
        return { actions: 0 }
    }

    return { actions: count || 0 }
}

export async function updateTaskDates(taskId: string, startDate: string, endDate: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase.from('tasks')
        .update({
            start_date: startDate,
            end_date: endDate
        })
        .eq('id', taskId)

    if (error) return { error: error.message }

    await logSystemEvent(taskId, `Task rescheduled: ${startDate.split('T')[0]} → ${endDate.split('T')[0]}`, user.id)
    await logTaskHistory(taskId, 'UPDATED', user.id, {
        field: 'dates',
        new_start: startDate,
        new_end: endDate
    })
    revalidatePath('/timeline')
    revalidatePath('/tasks')
    return { success: true }
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
    await runAIWorker(taskId, task.assignee_id)

    revalidatePath('/tasks')
    return { success: true }
}


export async function updateTaskProgress(taskId: string, progress: number) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Clamp progress between 0 and 100
    const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)))

    const { error } = await supabase.from('tasks')
        .update({ progress: clampedProgress })
        .eq('id', taskId)

    if (error) return { error: error.message }

    revalidatePath('/tasks')
    revalidatePath(`/tasks/${taskId}`) // If detailed view exists
    return { success: true, progress: clampedProgress }
}

export async function duplicateTask(originalTaskId: string) {
    const supabase = await createClient()
    const foundry_id = await getFoundryId()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !foundry_id) return { error: 'Unauthorized' }

    // 1. Fetch original task
    const { data: originalTask, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', originalTaskId)
        .single()

    if (fetchError || !originalTask) return { error: 'Original task not found' }

    // 2. Insert new task
    const { data: newTask, error: insertError } = await supabase.from('tasks').insert({
        foundry_id,
        title: originalTask.title + ' (Copy)',
        description: originalTask.description,
        objective_id: originalTask.objective_id,
        creator_id: user.id,
        assignee_id: originalTask.assignee_id, // Primary assignee
        status: 'Pending',
        start_date: null, // Reset dates? Or keep? Resetting is usually safer for copies.
        end_date: null,
        progress: 0,
        risk_level: originalTask.risk_level || 'Low', // Copy risk level
        client_visible: false // Reset visibility
    }).select().single()

    if (insertError) return { error: insertError.message }

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
        await supabase.from('task_assignees').insert(newAssigneeRecords)
    }

    // 4. Copy Attachments references ?? 
    // Creating true copies of files in storage is expensive and complex (download/upload). 
    // We will simple NOT copy attachments for now as usually a task copy is for the 'task' structure, not necessarily the exact file evidence of the previous one.
    // If user wants files, they can re-upload or we can implement 'link to existing file' later.

    await logSystemEvent(newTask.id, `Task duplicated from #${(originalTask as any).task_number || originalTaskId.substring(0, 4)}`, user.id)
    await logTaskHistory(newTask.id, 'CREATED', user.id, {
        source: 'DUPLICATION',
        original_task_id: originalTaskId
    })
    revalidatePath('/tasks')
    return { success: true }
}

export async function updateTaskDetails(taskId: string, updates: { title?: string, description?: string }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    if (!updates.title && updates.description === undefined) return { success: true } // Nothing to update

    const { error } = await supabase.from('tasks')
        .update(updates)
        .eq('id', taskId)

    if (error) return { error: error.message }

    await logSystemEvent(taskId, `Task details updated`, user.id)
    await logTaskHistory(taskId, 'UPDATED', user.id, {
        updates // Log the raw updates object
    })
    revalidatePath('/tasks')
    return { success: true }
}

export async function updateTaskAssignees(taskId: string, assigneeIds: string[]) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    if (assigneeIds.length === 0) return { error: 'Must have at least one assignee' }

    const primaryAssigneeId = assigneeIds[0]

    // Update primary assignee on task table
    const { error: taskError } = await supabase.from('tasks')
        .update({ assignee_id: primaryAssigneeId })
        .eq('id', taskId)

    if (taskError) return { error: taskError.message }

    // Sync task_assignees table
    // 1. Delete existing
    await supabase.from('task_assignees').delete().eq('task_id', taskId)

    // 2. Insert new
    const records = assigneeIds.map(id => ({
        task_id: taskId,
        profile_id: id
    }))
    const { error: assignError } = await supabase.from('task_assignees').insert(records)

    if (assignError) return { error: assignError.message }

    await logSystemEvent(taskId, `Assignees updated`, user.id)
    await logTaskHistory(taskId, 'ASSIGNED', user.id, {
        new_assignees: assigneeIds
    })

    // Potentially trigger AI worker if new primary is AI?
    await runAIWorker(taskId, primaryAssigneeId)

    revalidatePath('/tasks')
    return { success: true }
}

export async function uploadTaskAttachment(taskId: string, formData: FormData) {
    const supabase = await createClient()
    const foundry_id = await getFoundryId()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !foundry_id) return { error: 'Unauthorized' }

    const file = formData.get('file') as File
    if (!file) return { error: 'No file provided' }

    const filePath = `${foundry_id}/${taskId}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage
        .from('task-files')
        .upload(filePath, file)

    if (uploadError) return { error: uploadError.message }

    const { error: dbError } = await supabase.from('task_files').insert({
        task_id: taskId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: user.id
    })

    if (dbError) return { error: dbError.message }

    await logSystemEvent(taskId, `Attachment added: ${file.name}`, user.id)
    revalidatePath('/tasks')
    return { success: true }
}

export async function deleteTaskAttachment(fileId: string, filePath: string, taskId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Delete from Storage
    const { error: storageError } = await supabase.storage
        .from('task-files')
        .remove([filePath])

    if (storageError) {
        console.error("Storage delete failed", storageError)
        // Proceed to delete record anyway? Or stop? 
        // Best to clean up record even if storage file is gone or erroring.
    }

    // Delete from DB
    const { error: dbError } = await supabase.from('task_files')
        .delete()
        .eq('id', fileId)

    if (dbError) return { error: dbError.message }

    // Log requires task ID. If we don't have it explicitly passed, we'd need to fetch before delete. 
    // Assuming taskId passed correctly.
    await logSystemEvent(taskId, `Attachment removed`, user.id)

    revalidatePath('/tasks')
    return { success: true }
}

export async function getTaskAttachments(taskId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('task_files')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })

    if (error) return { error: error.message }
    return { data }
}

export async function getTaskHistory(taskId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('task_history')
        .select(`
            *,
            user:profiles(full_name, email, role, avatar_url)
        `)
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })

    if (error) return { error: error.message }
    return { data }
}
