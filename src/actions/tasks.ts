'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Database } from '@/types/database.types'

export type TaskStatus = Database["public"]["Enums"]["task_status"]

async function getFoundryId() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    return user.app_metadata.foundry_id
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
    const startDate = formData.get('start_date') as string
    const endDate = formData.get('end_date') as string

    if (!title || !objectiveId || !assigneeId) {
        return { error: 'Missing required fields' }
    }

    const { data, error } = await supabase.from('tasks').insert({
        foundry_id,
        title,
        description,
        objective_id: objectiveId,
        creator_id: user.id,
        assignee_id: assigneeId,
        start_date: startDate || null,
        end_date: endDate || null,
        status: 'Pending'
    }).select().single()

    if (error) return { error: error.message }

    // Log Creation
    await logSystemEvent(data.id, `Task created by User`, user.id)

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
