'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Database } from '@/types/database.types'
import { runAIWorker } from '@/lib/ai-worker'

export type TaskStatus = Database["public"]["Enums"]["task_status"]

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
        status: 'Pending'
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
    await logSystemEvent(data.id, `Task created by User`, user.id)

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

    const { error } = await supabase.from('tasks')
        .update({ status: 'Completed', end_date: new Date().toISOString() }) // Auto-set end date?
        .eq('id', taskId)

    if (error) return { error: error.message }

    await logSystemEvent(taskId, 'Task mark as Completed', user.id)
    revalidatePath('/tasks')
    return { success: true }
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
    return { success: true, progress: clampedProgress }
}
