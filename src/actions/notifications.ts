'use server'
// @ts-nocheck - Database types out of sync

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

// Types
export interface Notification {
    id: string
    user_id: string
    foundry_id: string
    type: string
    title: string
    message: string | null
    link: string | null
    is_read: boolean
    metadata: Record<string, unknown> | null
    created_at: string
    read_at: string | null
}

export type NotificationType = 
    | 'task_assigned'
    | 'task_completed'
    | 'task_amended'
    | 'task_approved'
    | 'task_rejected'
    | 'delegation_created'
    | 'delegation_revoked'
    | 'advisory_answer'
    | 'advisory_verified'
    | 'standup_reminder'
    | 'event_reminder'
    | 'system'

// ==========================================
// NOTIFICATION CREATION
// ==========================================

/**
 * Create a notification using the database function
 */
export async function createNotification(data: {
    userId: string
    type: NotificationType | string
    title: string
    message?: string
    link?: string
    metadata?: Record<string, unknown>
}): Promise<{ id: string | null; error: string | null }> {
    try {
        const supabase = await createClient()

        const { data: notificationId, error } = await supabase.rpc('create_notification', {
            p_user_id: data.userId,
            p_type: data.type,
            p_title: data.title,
            p_message: data.message || null,
            p_link: data.link || null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            p_metadata: (data.metadata || null) as any
        })

        if (error) {
            console.error('Error creating notification:', error)
            return { id: null, error: error.message }
        }

        return { id: notificationId, error: null }
    } catch (err) {
        console.error('Failed to create notification:', err)
        return { id: null, error: 'Failed to create notification' }
    }
}

/**
 * Create notifications for multiple users
 */
export async function createBulkNotifications(data: {
    userIds: string[]
    type: NotificationType | string
    title: string
    message?: string
    link?: string
    metadata?: Record<string, unknown>
}): Promise<{ count: number; error: string | null }> {
    try {
        const supabase = await createClient()
        const foundryId = await getFoundryIdCached()
        
        if (!foundryId) {
            return { count: 0, error: 'No foundry context' }
        }

        const notifications = data.userIds.map(userId => ({
            user_id: userId,
            foundry_id: foundryId,
            type: data.type,
            title: data.title,
            message: data.message || null,
            link: data.link || null,
            metadata: data.metadata || null
        }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
            .from('notifications')
            .insert(notifications)

        if (error) {
            console.error('Error creating bulk notifications:', error)
            return { count: 0, error: error.message }
        }

        return { count: data.userIds.length, error: null }
    } catch (err) {
        console.error('Failed to create bulk notifications:', err)
        return { count: 0, error: 'Failed to create notifications' }
    }
}

// ==========================================
// NOTIFICATION RETRIEVAL
// ==========================================

/**
 * Get notifications for the current user
 */
export async function getMyNotifications(options?: {
    unreadOnly?: boolean
    limit?: number
    offset?: number
}): Promise<{ data: Notification[]; error: string | null; unreadCount: number }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { data: [], error: 'Not authenticated', unreadCount: 0 }
        }

        let query = supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })

        if (options?.unreadOnly) {
            query = query.eq('is_read', false)
        }

        if (options?.limit) {
            query = query.limit(options.limit)
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
        }

        const { data, error } = await query

        if (error) {
            console.error('Error fetching notifications:', error)
            return { data: [], error: error.message, unreadCount: 0 }
        }

        // Get unread count
        const { count: unreadCount } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_read', false)

        return { 
            data: (data || []) as Notification[], 
            error: null, 
            unreadCount: unreadCount || 0 
        }
    } catch (err) {
        console.error('Failed to fetch notifications:', err)
        return { data: [], error: 'Failed to fetch notifications', unreadCount: 0 }
    }
}

// ==========================================
// NOTIFICATION MANAGEMENT
// ==========================================

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()

        const { error } = await supabase
            .from('notifications')
            .update({
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq('id', notificationId)

        if (error) {
            console.error('Error marking notification as read:', error)
            return { success: false, error: error.message }
        }

        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to mark notification as read:', err)
        return { success: false, error: 'Failed to mark as read' }
    }
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsAsRead(): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        const { error } = await supabase
            .from('notifications')
            .update({
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .eq('is_read', false)

        if (error) {
            console.error('Error marking all notifications as read:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to mark all notifications as read:', err)
        return { success: false, error: 'Failed to mark all as read' }
    }
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()

        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', notificationId)

        if (error) {
            console.error('Error deleting notification:', error)
            return { success: false, error: error.message }
        }

        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to delete notification:', err)
        return { success: false, error: 'Failed to delete notification' }
    }
}

/**
 * Delete all read notifications
 */
export async function deleteReadNotifications(): Promise<{ count: number; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { count: 0, error: 'Not authenticated' }
        }

        const { data, error } = await supabase
            .from('notifications')
            .delete()
            .eq('user_id', user.id)
            .eq('is_read', true)
            .select('id')

        if (error) {
            console.error('Error deleting read notifications:', error)
            return { count: 0, error: error.message }
        }

        return { count: data?.length || 0, error: null }
    } catch (err) {
        console.error('Failed to delete read notifications:', err)
        return { count: 0, error: 'Failed to delete notifications' }
    }
}

// ==========================================
// NOTIFICATION HELPERS
// ==========================================

/**
 * Notify task assignee when task is assigned
 */
export async function notifyTaskAssigned(data: {
    taskId: string
    taskTitle: string
    assigneeId: string
    assignedByName: string
}): Promise<{ id: string | null; error: string | null }> {
    return createNotification({
        userId: data.assigneeId,
        type: 'task_assigned',
        title: 'New Task Assigned',
        message: `${data.assignedByName} assigned you to "${data.taskTitle}"`,
        link: `/tasks?taskId=${data.taskId}`,
        metadata: {
            task_id: data.taskId,
            assigned_by: data.assignedByName
        }
    })
}

/**
 * Notify task creator when task is completed
 */
export async function notifyTaskCompleted(data: {
    taskId: string
    taskTitle: string
    creatorId: string
    completedByName: string
}): Promise<{ id: string | null; error: string | null }> {
    return createNotification({
        userId: data.creatorId,
        type: 'task_completed',
        title: 'Task Completed',
        message: `${data.completedByName} completed "${data.taskTitle}"`,
        link: `/tasks?taskId=${data.taskId}`,
        metadata: {
            task_id: data.taskId,
            completed_by: data.completedByName
        }
    })
}

/**
 * Notify about delegation changes
 */
export async function notifyDelegationChange(data: {
    delegateId: string
    delegatorName: string
    action: 'created' | 'revoked'
    reason?: string
}): Promise<{ id: string | null; error: string | null }> {
    return createNotification({
        userId: data.delegateId,
        type: data.action === 'created' ? 'delegation_created' : 'delegation_revoked',
        title: data.action === 'created' ? 'Approval Authority Delegated' : 'Delegation Revoked',
        message: data.action === 'created' 
            ? `${data.delegatorName} delegated approval authority to you${data.reason ? `: ${data.reason}` : ''}`
            : `${data.delegatorName} revoked your approval delegation`,
        link: '/settings/delegations',
        metadata: {
            delegator_name: data.delegatorName,
            action: data.action,
            reason: data.reason
        }
    })
}

/**
 * Notify about advisory forum activity
 */
export async function notifyAdvisoryAnswer(data: {
    userId: string
    questionTitle: string
    questionId: string
    answererName: string
    isAI?: boolean
}): Promise<{ id: string | null; error: string | null }> {
    return createNotification({
        userId: data.userId,
        type: 'advisory_answer',
        title: 'New Answer to Your Question',
        message: `${data.isAI ? 'AI Assistant' : data.answererName} answered "${data.questionTitle}"`,
        link: `/advisory/${data.questionId}`,
        metadata: {
            question_id: data.questionId,
            answerer_name: data.answererName,
            is_ai: data.isAI
        }
    })
}
