'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { z } from 'zod'
import { syncObjectiveCommentToMessages, syncTaskCommentToMessages } from '@/lib/messaging/comment-sync'

// Simple content validation schema
// DECISION: Aligned to 10,000 char limit matching messaging system
const contentSchema = z.object({
  content: z.string()
    .min(1, 'Comment cannot be empty')
    .max(10_000, 'Comment must be 10,000 characters or less')
})
import type { 
  ActivityItem, 
  ActivitySourceType,
  RawTaskComment, 
  RawObjectiveComment, 
  RawTaskHistory,
  TaskHistoryActionType
} from '@/types/activity'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

// Note: The following tables are created by migration 20260201300000_activity_stream_tables.sql
// and may not be in the generated types yet. We use type assertions for these tables:
// - objective_comments
// - task_comment_reads
// - objective_comment_reads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

/**
 * Map task_history action types to human-readable content
 */
function formatTaskHistoryContent(
  actionType: TaskHistoryActionType,
  changes: Record<string, { old?: unknown; new?: unknown }> | null
): string {
  switch (actionType) {
    case 'CREATED':
      return 'created this task'
    case 'STATUS_CHANGE': {
      const newStatus = changes?.status?.new as string | undefined
      if (newStatus) {
        // Format status: "in_progress" -> "In Progress"
        const formattedStatus = newStatus
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
        return `changed status to ${formattedStatus}`
      }
      return 'changed the status'
    }
    case 'ASSIGNED': {
      const assigneeName = changes?.assignee_name?.new as string | undefined
      if (assigneeName) {
        return `assigned to ${assigneeName}`
      }
      return 'assigned this task'
    }
    case 'COMPLETED':
      return 'marked as completed'
    case 'FORWARDED':
      return 'forwarded for approval'
    case 'UPDATED': {
      // Try to identify what was updated
      const updatedFields = changes ? Object.keys(changes) : []
      if (updatedFields.length === 1) {
        const field = updatedFields[0]
        const formattedField = field.replace(/_/g, ' ')
        return `updated ${formattedField}`
      }
      return 'updated task details'
    }
    default:
      return 'updated this task'
  }
}

/**
 * Reply to an activity item - routes to the appropriate source
 * This enables inline replies from the Today activity stream
 */
export async function replyToActivity(
  sourceType: ActivitySourceType,
  sourceId: string,
  content: string
): Promise<{ success: boolean; error?: string; data?: ThreadItem }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return { success: false, error: 'Foundry not found' }
    }

    // Validate content
    const validation = contentSchema.safeParse({ content })
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0]?.message || 'Invalid content' }
    }

    // Fetch user's profile for building ThreadItem
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role')
      .eq('id', user.id)
      .single()

    switch (sourceType) {
      case 'task': {
        // SECURITY: Verify the task belongs to the user's foundry
        const { data: task } = await supabase
          .from('tasks')
          .select('id, foundry_id')
          .eq('id', sourceId)
          .single()

        if (!task || task.foundry_id !== foundryId) {
          return { success: false, error: 'Task not found or access denied' }
        }

        // Add comment to task
        const { data: inserted, error } = await supabase.from('task_comments').insert({
          task_id: sourceId,
          user_id: user.id,
          content: content.trim(),
          is_system_log: false,
          foundry_id: foundryId
        }).select('id, created_at').single()

        if (error) {
          console.error('Failed to add task comment:', error)
          return { success: false, error: 'Failed to add comment' }
        }

        // Sync to messages for unified inbox
        try {
          await syncTaskCommentToMessages(supabase, {
            taskId: sourceId,
            userId: user.id,
            content: content.trim(),
            isSystemLog: false
          })
        } catch (syncError) {
          console.error('Failed to sync task reply to messages:', syncError)
        }

        revalidatePath('/tasks')
        revalidatePath('/messages')
        revalidatePath('/updates')
        return {
          success: true,
          data: {
            id: inserted.id,
            content: content.trim(),
            created_at: inserted.created_at || new Date().toISOString(),
            is_system_log: false,
            is_unread: false,
            author: {
              id: user.id,
              full_name: userProfile?.full_name || null,
              avatar_url: userProfile?.avatar_url || null,
              role: userProfile?.role || null
            }
          }
        }
      }

      case 'objective': {
        // SECURITY: Verify the objective belongs to the user's foundry
        const { data: objective } = await (supabase as AnySupabaseClient)
          .from('objectives')
          .select('id, foundry_id')
          .eq('id', sourceId)
          .single()

        if (!objective || objective.foundry_id !== foundryId) {
          return { success: false, error: 'Objective not found or access denied' }
        }

        // Add comment to objective (table created by migration)
        const { data: inserted, error } = await (supabase as AnySupabaseClient).from('objective_comments').insert({
          objective_id: sourceId,
          user_id: user.id,
          content: content.trim(),
          is_system_log: false,
          foundry_id: foundryId
        }).select('id, created_at').single()

        if (error) {
          console.error('Failed to add objective comment:', error)
          return { success: false, error: 'Failed to add comment' }
        }

        // Sync to messages for unified inbox
        try {
          await syncObjectiveCommentToMessages(supabase, {
            objectiveId: sourceId,
            userId: user.id,
            content: content.trim(),
            isSystemLog: false
          })
        } catch (syncError) {
          console.error('Failed to sync objective reply to messages:', syncError)
        }

        revalidatePath('/objectives')
        revalidatePath('/messages')
        revalidatePath('/updates')
        return {
          success: true,
          data: {
            id: inserted.id,
            content: content.trim(),
            created_at: inserted.created_at || new Date().toISOString(),
            is_system_log: false,
            is_unread: false,
            author: {
              id: user.id,
              full_name: userProfile?.full_name || null,
              avatar_url: userProfile?.avatar_url || null,
              role: userProfile?.role || null
            }
          }
        }
      }

      case 'conversation': {
        // SECURITY: Verify user is a participant in this conversation
        const { data: participant } = await (supabase as AnySupabaseClient)
          .from('conversation_participants')
          .select('profile_id')
          .eq('conversation_id', sourceId)
          .eq('profile_id', user.id)
          .single()

        if (!participant) {
          return { success: false, error: 'Not a participant in this conversation' }
        }

        // Send message to conversation
        const { data: inserted, error } = await supabase.from('messages').insert({
          conversation_id: sourceId,
          sender_id: user.id,
          content: content.trim(),
          message_type: 'text'
        }).select('id, created_at').single()

        if (error) {
          console.error('Failed to send message:', error)
          return { success: false, error: 'Failed to send message' }
        }

        // Update conversation's updated_at
        await supabase
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sourceId)

        revalidatePath('/messages')
        revalidatePath('/updates')
        return {
          success: true,
          data: {
            id: inserted.id,
            content: content.trim(),
            created_at: inserted.created_at || new Date().toISOString(),
            is_system_log: false,
            is_unread: false,
            author: {
              id: user.id,
              full_name: userProfile?.full_name || null,
              avatar_url: userProfile?.avatar_url || null,
              role: userProfile?.role || null
            }
          }
        }
      }

      default:
        return { success: false, error: 'Invalid source type' }
    }
  } catch (error) {
    console.error('replyToActivity error:', error)
    return { 
      success: false, 
      error: sanitizeErrorMessage(error) 
    }
  }
}

/**
 * Mark an activity item as read
 */
export async function markActivityRead(
  type: 'task_comment' | 'objective_comment',
  commentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return { success: false, error: 'Foundry not found' }
    }

    const table = type === 'task_comment' 
      ? 'task_comment_reads' 
      : 'objective_comment_reads'

    // Tables created by migration - use type assertion
    const { error } = await (supabase as AnySupabaseClient).from(table).upsert({
      user_id: user.id,
      comment_id: commentId,
      foundry_id: foundryId,
      read_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,comment_id'
    })

    if (error) {
      console.error('Failed to mark as read:', error)
      return { success: false, error: 'Failed to mark as read' }
    }

    return { success: true }
  } catch (error) {
    console.error('markActivityRead error:', error)
    return { 
      success: false, 
      error: sanitizeErrorMessage(error) 
    }
  }
}

/**
 * Mark multiple activity items as read in batch
 */
export async function markMultipleActivityRead(
  items: Array<{ type: 'task_comment' | 'objective_comment'; commentId: string }>
): Promise<{ success: boolean; error?: string }> {
  if (items.length > 200) {
    return { success: false, error: 'Too many items (max 200)' }
  }

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return { success: false, error: 'Foundry not found' }
    }

    const now = new Date().toISOString()

    // Group by type
    const taskComments = items.filter(i => i.type === 'task_comment')
    const objectiveComments = items.filter(i => i.type === 'objective_comment')

    const promises: Promise<unknown>[] = []

    // Tables created by migration - use type assertion
    if (taskComments.length > 0) {
      promises.push(
        (supabase as AnySupabaseClient).from('task_comment_reads').upsert(
          taskComments.map(i => ({
            user_id: user.id,
            comment_id: i.commentId,
            foundry_id: foundryId,
            read_at: now
          })),
          { onConflict: 'user_id,comment_id' }
        )
      )
    }

    if (objectiveComments.length > 0) {
      promises.push(
        (supabase as AnySupabaseClient).from('objective_comment_reads').upsert(
          objectiveComments.map(i => ({
            user_id: user.id,
            comment_id: i.commentId,
            foundry_id: foundryId,
            read_at: now
          })),
          { onConflict: 'user_id,comment_id' }
        )
      )
    }

    await Promise.all(promises)

    return { success: true }
  } catch (error) {
    console.error('markMultipleActivityRead error:', error)
    return { 
      success: false, 
      error: sanitizeErrorMessage(error) 
    }
  }
}

/**
 * Get unread activity count for the current user
 */
export async function getActivityUnreadCount(): Promise<{
  success: boolean
  data?: {
    taskComments: number
    objectiveComments: number
    messages: number
    total: number
  }
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return { success: false, error: 'Foundry not found' }
    }

    // Get user's task IDs (tasks they're involved in)
    const { data: myTasks } = await supabase
      .from('tasks')
      .select('id')
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .or(`assignee_id.eq.${user.id},creator_id.eq.${user.id}`)

    const myTaskIds = myTasks?.map(t => t.id) || []

    // Get user's objective IDs - cast to avoid type recursion
    const { data: myObjectives } = await (supabase as AnySupabaseClient)
      .from('objectives')
      .select('id')
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .eq('owner_id', user.id) as { data: Array<{ id: string }> | null }

    const myObjectiveIds = myObjectives?.map(o => o.id) || []

    // Count unread task comments (not from self, not already read)
    // Note: Supabase doesn't support subqueries in .not(), so we'll do this differently
    let taskCommentCount = 0
    if (myTaskIds.length > 0) {
      // Get all task comments not from self
      const { data: allTaskComments } = await supabase
        .from('task_comments')
        .select('id')
        .in('task_id', myTaskIds)
        .neq('user_id', user.id)
        .eq('is_system_log', false)

      // Get read comment IDs
      const { data: readComments } = await (supabase as AnySupabaseClient)
        .from('task_comment_reads')
        .select('comment_id')
        .eq('user_id', user.id)

      const readIds = new Set(readComments?.map((r: { comment_id: string }) => r.comment_id) || [])
      taskCommentCount = (allTaskComments || []).filter(c => !readIds.has(c.id)).length
    }

    // Count unread objective comments (not from self, not already read)
    let objectiveCommentCount = 0
    if (myObjectiveIds.length > 0) {
      // Get all objective comments not from self
      const { data: allObjectiveComments } = await (supabase as AnySupabaseClient)
        .from('objective_comments')
        .select('id')
        .in('objective_id', myObjectiveIds)
        .neq('user_id', user.id)
        .eq('is_system_log', false)

      // Get read comment IDs
      const { data: readObjComments } = await (supabase as AnySupabaseClient)
        .from('objective_comment_reads')
        .select('comment_id')
        .eq('user_id', user.id)

      const readObjIds = new Set(readObjComments?.map((r: { comment_id: string }) => r.comment_id) || [])
      objectiveCommentCount = (allObjectiveComments || []).filter((c: { id: string }) => !readObjIds.has(c.id)).length
    }

    // Get unread message count from conversations (batched query to avoid N+1)
    const { data: conversations } = await (supabase as AnySupabaseClient)
      .from('conversation_participants')
      .select('conversation_id, last_read_at')
      .eq('profile_id', user.id)

    let messageCount = 0
    if (conversations && conversations.length > 0) {
      const conversationIds = conversations.map((c: { conversation_id: string }) => c.conversation_id)

      // DECISION: Batch unread counts by grouping conversations by last_read_at status
      // (has timestamp vs null) to reduce N+1 to at most 2 queries.
      const conversationMap = new Map<string, string | null>(conversations.map((c: { conversation_id: string; last_read_at: string | null }) => [c.conversation_id, c.last_read_at]))

      // Group 1: Conversations never read (all non-own messages are unread)
      const neverReadIds = conversationIds.filter((id: string) => !conversationMap.get(id))
      if (neverReadIds.length > 0) {
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', neverReadIds)
          .neq('sender_id', user.id)
          .eq('is_deleted', false)
        messageCount += count || 0
      }

      // Group 2: Conversations with last_read_at — find oldest last_read_at as lower bound,
      // then count messages after it (may slightly overcount but avoids N queries).
      // For exact counts we'd need per-conversation queries, but the oldest-timestamp
      // approach is a reasonable approximation that eliminates N+1.
      const readConversations = conversationIds
        .filter((id: string) => conversationMap.get(id))
        .map((id: string) => ({ id, lastReadAt: conversationMap.get(id)! }))

      if (readConversations.length > 0) {
        // Use the oldest last_read_at as lower bound — slight overcount is acceptable
        // for an unread badge vs N separate queries
        const oldestReadAt = readConversations
          .map((c: { id: string; lastReadAt: string }) => c.lastReadAt)
          .sort()[0]

        const readIds = readConversations.map((c: { id: string; lastReadAt: string }) => c.id)
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', readIds)
          .neq('sender_id', user.id)
          .eq('is_deleted', false)
          .gt('created_at', oldestReadAt)
        messageCount += count || 0
      }
    }

    return {
      success: true,
      data: {
        taskComments: taskCommentCount,
        objectiveComments: objectiveCommentCount,
        messages: messageCount,
        total: taskCommentCount + objectiveCommentCount + messageCount
      }
    }
  } catch (error) {
    console.error('getActivityUnreadCount error:', error)
    return { 
      success: false, 
      error: sanitizeErrorMessage(error) 
    }
  }
}

/**
 * Add a comment to an objective
 */
export async function addObjectiveComment(
  objectiveId: string,
  content: string
): Promise<{ success: boolean; error?: string; commentId?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return { success: false, error: 'Foundry not found' }
    }

    // Validate content
    const validation = contentSchema.safeParse({ content })
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0]?.message || 'Invalid content' }
    }

    // Verify objective exists and belongs to user's foundry
    const { data: objective, error: objError } = await supabase
      .from('objectives')
      .select('id, foundry_id')
      .eq('id', objectiveId)
      .single()

    if (objError || !objective) {
      return { success: false, error: 'Objective not found' }
    }

    if (objective.foundry_id !== foundryId) {
      return { success: false, error: 'Unauthorized' }
    }

    // Insert comment (table created by migration)
    const { data: comment, error } = await (supabase as AnySupabaseClient)
      .from('objective_comments')
      .insert({
        objective_id: objectiveId,
        user_id: user.id,
        content: content.trim(),
        is_system_log: false,
        foundry_id: foundryId
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to add objective comment:', error)
      return { success: false, error: 'Failed to add comment' }
    }

    // Sync comment to messages so it appears in the unified inbox
    try {
      await syncObjectiveCommentToMessages(supabase, {
        objectiveId,
        userId: user.id,
        content: content.trim(),
        isSystemLog: false
      })
    } catch (syncError) {
      // Don't fail the main operation if sync fails
      console.error('Failed to sync objective comment to messages:', syncError)
    }

    revalidatePath('/objectives')
    revalidatePath('/messages')
    revalidatePath('/updates')

    return { success: true, commentId: comment?.id }
  } catch (error) {
    console.error('addObjectiveComment error:', error)
    return { 
      success: false, 
      error: sanitizeErrorMessage(error) 
    }
  }
}

/**
 * Get activity feed for the current user
 * Combines task comments, objective comments, and conversation messages
 */
export async function getActivityFeed(options?: {
  limit?: number
  offset?: number
  filter?: 'all' | 'tasks' | 'objectives' | 'messages' | 'unread' | 'history'
  includeSystemLogs?: boolean
  showAllFoundryActivity?: boolean
  before?: string
}): Promise<{
  success: boolean
  data?: ActivityItem[]
  hasMore?: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    // SECURITY: Validate UUID before .or() interpolation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(user.id)) {
      return { success: false, error: 'Invalid user ID' }
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return { success: false, error: 'Foundry not found' }
    }

    // SECURITY: Cap limit to prevent DoS via oversized requests
    const limit = Math.min(options?.limit || 30, 200)
    const filter = options?.filter || 'all'
    const includeSystemLogs = options?.includeSystemLogs || false
    let showAllFoundryActivity = options?.showAllFoundryActivity || false
    const before = options?.before

    // SECURITY: Only Executives/Founders can view all foundry activity
    if (showAllFoundryActivity) {
      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (!callerProfile || (callerProfile.role !== 'Executive' && callerProfile.role !== 'Founder')) {
        showAllFoundryActivity = false
      }
    }

    let allTaskIds: string[] = []
    let myObjectiveIds: string[] = []

    if (showAllFoundryActivity) {
      // Admin mode: get ALL tasks in the foundry
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('foundry_id', foundryId)
        .eq('is_ghost', false)
        .is('deleted_at', null)

      allTaskIds = allTasks?.map(t => t.id) || []

      // Get ALL objectives in the foundry
      const { data: allObjectives } = await (supabase as AnySupabaseClient)
        .from('objectives')
        .select('id')
        .eq('foundry_id', foundryId)
        .eq('is_ghost', false)
        .is('deleted_at', null) as { data: Array<{ id: string }> | null }

      myObjectiveIds = allObjectives?.map(o => o.id) || []
    } else {
      // Standard mode: only user's tasks
      // Get user's task IDs
      const { data: myTasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('foundry_id', foundryId)
        .eq('is_ghost', false)
        .is('deleted_at', null)
        .or(`assignee_id.eq.${user.id},creator_id.eq.${user.id}`)

      const myTaskIds = myTasks?.map(t => t.id) || []

      // Get tasks from task_assignees table
      const { data: additionalTasks } = await supabase
        .from('task_assignees')
        .select('task_id')
        .eq('profile_id', user.id)

      const additionalTaskIds = additionalTasks?.map(t => t.task_id) || []
      allTaskIds = [...new Set([...myTaskIds, ...additionalTaskIds])]

      // Get user's objective IDs - cast to avoid type recursion
      const { data: myObjectives } = await (supabase as AnySupabaseClient)
        .from('objectives')
        .select('id')
        .eq('foundry_id', foundryId)
        .eq('is_ghost', false)
        .is('deleted_at', null)
        .eq('owner_id', user.id) as { data: Array<{ id: string }> | null }

      myObjectiveIds = myObjectives?.map(o => o.id) || []
    }

    // Get user's conversation IDs
    const { data: myConversations } = await (supabase as AnySupabaseClient)
      .from('conversation_participants')
      .select('conversation_id, last_read_at')
      .eq('profile_id', user.id) as { data: Array<{ conversation_id: string; last_read_at: string | null }> | null }

    const conversationMap = new Map<string, string | null>(
      myConversations?.map(c => [c.conversation_id, c.last_read_at] as [string, string | null]) || []
    )
    const myConversationIds: string[] = Array.from(conversationMap.keys())

    const items: ActivityItem[] = []

    // Fetch task comments
    if ((filter === 'all' || filter === 'tasks' || filter === 'unread') && allTaskIds.length > 0) {
      let taskCommentsQuery = supabase
        .from('task_comments')
        .select(`
          id, content, created_at, is_system_log,
          user:profiles!user_id(id, full_name, avatar_url, role),
          task:tasks!task_id(id, title, task_number)
        `)
        .in('task_id', allTaskIds)
        .neq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (before) {
        taskCommentsQuery = taskCommentsQuery.lt('created_at', before)
      }

      // Only filter out system logs if not explicitly including them
      if (!includeSystemLogs) {
        taskCommentsQuery = taskCommentsQuery.eq('is_system_log', false)
      }

      const { data: taskComments } = await taskCommentsQuery

      // Get read status for task comments (table created by migration)
      const taskCommentIds = taskComments?.map(c => c.id) || []
      let readTaskCommentIds = new Set<string>()
      if (taskCommentIds.length > 0) {
        const { data: taskReads } = await (supabase as AnySupabaseClient)
          .from('task_comment_reads')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', taskCommentIds)
        readTaskCommentIds = new Set(taskReads?.map((r: { comment_id: string }) => r.comment_id) || [])
      }

      if (taskComments) {
        for (const comment of taskComments as RawTaskComment[]) {
          if (!comment.user || !comment.task) continue
          
          const isUnread = !readTaskCommentIds.has(comment.id)
          if (filter === 'unread' && !isUnread) continue

          items.push({
            id: comment.id,
            type: 'task_comment',
            content: comment.content,
            created_at: comment.created_at || new Date().toISOString(),
            author: {
              id: comment.user.id,
              full_name: comment.user.full_name,
              avatar_url: comment.user.avatar_url,
              role: comment.user.role
            },
            source: {
              type: 'task',
              id: comment.task.id,
              title: comment.task.title,
              task_number: comment.task.task_number
            },
            is_unread: isUnread,
            is_system_log: comment.is_system_log || false
          })
        }
      }
    }

    // Fetch task history events (status changes, assignments, completions, etc.)
    // Include when filter is 'all', 'tasks', or specifically 'history'
    if ((filter === 'all' || filter === 'tasks' || filter === 'history') && allTaskIds.length > 0) {
      let taskHistoryQuery = (supabase as AnySupabaseClient)
        .from('task_history')
        .select(`
          id, task_id, user_id, action_type, changes, created_at,
          user:profiles!user_id(id, full_name, avatar_url, role),
          task:tasks!task_id(id, title, task_number)
        `)
        .in('task_id', allTaskIds)
        .neq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (before) {
        taskHistoryQuery = taskHistoryQuery.lt('created_at', before)
      }

      const { data: taskHistory } = await taskHistoryQuery

      if (taskHistory) {
        for (const history of taskHistory as RawTaskHistory[]) {
          if (!history.user || !history.task) continue

          // Task history items don't have read status tracking
          // Note: This block only runs when filter is 'all' or 'tasks' (not 'unread')

          const content = formatTaskHistoryContent(
            history.action_type,
            history.changes as Record<string, { old?: unknown; new?: unknown }> | null
          )

          items.push({
            id: history.id,
            type: 'task_history',
            content,
            created_at: history.created_at || new Date().toISOString(),
            author: {
              id: history.user.id,
              full_name: history.user.full_name,
              avatar_url: history.user.avatar_url,
              role: history.user.role
            },
            source: {
              type: 'task',
              id: history.task.id,
              title: history.task.title,
              task_number: history.task.task_number
            },
            is_unread: false, // History items don't track read status
            action_type: history.action_type,
            // Include raw changes data for hover details
            changes: history.changes || undefined
          })
        }
      }
    }

    // Fetch objective comments (table created by migration)
    if ((filter === 'all' || filter === 'objectives' || filter === 'unread') && myObjectiveIds.length > 0) {
      let objectiveCommentsQuery = (supabase as AnySupabaseClient)
        .from('objective_comments')
        .select(`
          id, content, created_at, is_system_log,
          user:profiles!user_id(id, full_name, avatar_url, role),
          objective:objectives!objective_id(id, title)
        `)
        .in('objective_id', myObjectiveIds)
        .neq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (before) {
        objectiveCommentsQuery = objectiveCommentsQuery.lt('created_at', before)
      }

      // Only filter out system logs if not explicitly including them
      if (!includeSystemLogs) {
        objectiveCommentsQuery = objectiveCommentsQuery.eq('is_system_log', false)
      }

      const { data: objectiveComments } = await objectiveCommentsQuery

      // Get read status for objective comments (table created by migration)
      const objectiveCommentIds = objectiveComments?.map((c: { id: string }) => c.id) || []
      let readObjectiveCommentIds = new Set<string>()
      if (objectiveCommentIds.length > 0) {
        const { data: objectiveReads } = await (supabase as AnySupabaseClient)
          .from('objective_comment_reads')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', objectiveCommentIds)
        readObjectiveCommentIds = new Set(objectiveReads?.map((r: { comment_id: string }) => r.comment_id) || [])
      }

      if (objectiveComments) {
        for (const comment of objectiveComments as RawObjectiveComment[]) {
          if (!comment.user || !comment.objective) continue

          const isUnread = !readObjectiveCommentIds.has(comment.id)
          if (filter === 'unread' && !isUnread) continue

          items.push({
            id: comment.id,
            type: 'objective_comment',
            content: comment.content,
            created_at: comment.created_at || new Date().toISOString(),
            author: {
              id: comment.user.id,
              full_name: comment.user.full_name,
              avatar_url: comment.user.avatar_url,
              role: comment.user.role
            },
            source: {
              type: 'objective',
              id: comment.objective.id,
              title: comment.objective.title
            },
            is_unread: isUnread,
            is_system_log: comment.is_system_log || false
          })
        }
      }
    }

    // Fetch conversation messages (only true direct messages, not task/objective synced conversations)
    if ((filter === 'all' || filter === 'messages' || filter === 'unread') && myConversationIds.length > 0) {
      let messagesQuery = supabase
        .from('messages')
        .select(`
          id, content, created_at, is_deleted,
          sender:profiles!sender_id(id, full_name, avatar_url, role),
          conversation:conversations!conversation_id(id, buyer_id, seller_id, task_id, objective_id, title)
        `)
        .in('conversation_id', myConversationIds)
        .neq('sender_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (before) {
        messagesQuery = messagesQuery.lt('created_at', before)
      }

      const { data: messages } = await messagesQuery

      if (messages) {
        for (const message of messages) {
          const msg = message as {
            id: string
            content: string | null
            is_deleted: boolean
            created_at: string | null
            sender: { id: string; full_name: string | null; avatar_url: string | null; role: string | null } | null
            conversation: { id: string; buyer_id: string; seller_id: string; task_id: string | null; objective_id: string | null; title: string | null } | null
          }
          if (!msg.sender || !msg.conversation) continue

          // Skip deleted messages from the feed
          if (msg.is_deleted) continue

          // Skip task-linked and objective-linked conversations -- those are synced
          // duplicates already shown as task_comment / objective_comment items
          if (msg.conversation.task_id || msg.conversation.objective_id) continue

          const lastReadAt = conversationMap.get(msg.conversation.id)
          const isUnread = !lastReadAt || new Date(msg.created_at || 0) > new Date(lastReadAt)
          if (filter === 'unread' && !isUnread) continue

          items.push({
            id: msg.id,
            type: 'message',
            content: msg.content || '',
            created_at: msg.created_at || new Date().toISOString(),
            author: {
              id: msg.sender.id,
              full_name: msg.sender.full_name,
              avatar_url: msg.sender.avatar_url,
              role: msg.sender.role
            },
            source: {
              type: 'conversation',
              id: msg.conversation.id,
              title: msg.conversation.title || 'Direct Message'
            },
            is_unread: isUnread
          })
        }
      }
    }

    // Sort all items by date (newest first)
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Apply limit after merging
    const limitedItems = items.slice(0, limit)

    return { success: true, data: limitedItems, hasMore: items.length > limit }
  } catch (error) {
    console.error('getActivityFeed error:', error)
    return { 
      success: false, 
      error: sanitizeErrorMessage(error) 
    }
  }
}

/**
 * Thread item for the updates thread panel.
 * Represents a single comment/note in a task or objective thread.
 */
export interface ThreadItem {
  id: string
  content: string
  created_at: string
  is_system_log: boolean
  is_unread: boolean
  author: {
    id: string
    full_name: string | null
    avatar_url: string | null
    role: string | null
  }
}

/**
 * Full thread data including source metadata for the thread panel.
 */
export interface ThreadData {
  source: {
    type: 'task' | 'objective' | 'conversation'
    id: string
    title: string
    task_number?: number
    status?: string
    progress?: number | null
    end_date?: string | null
    assignees?: Array<{
      id: string
      full_name: string | null
      avatar_url: string | null
      role: string | null
    }>
    objective?: {
      id: string
      title: string
    } | null
    /** Participants for conversation threads */
    participants?: Array<{
      id: string
      full_name: string | null
      avatar_url: string | null
      role: string | null
    }>
  }
  items: ThreadItem[]
}

/**
 * Fetches the full comment/message thread for a task, objective, or conversation.
 *
 * @description Used by the Updates thread panel to show all notes/comments/messages
 * for a selected activity item. Returns source metadata plus all items in
 * chronological order with read status.
 *
 * @param sourceType - Whether this is a 'task', 'objective', or 'conversation' thread
 * @param sourceId - The UUID of the task, objective, or conversation
 * @returns Thread data with source metadata and all comments/messages
 *
 * @security Requires authenticated user with foundry membership or conversation participation
 */
export async function getThreadForSource(
  sourceType: 'task' | 'objective' | 'conversation',
  sourceId: string
): Promise<{ success: boolean; data?: ThreadData; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return { success: false, error: 'Foundry not found' }
    }

    if (sourceType === 'task') {
      // AUTH: Verify task belongs to user's foundry
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select(`
          id, title, task_number, status, progress, end_date,
          objective:objectives!tasks_objective_id_fkey(id, title)
        `)
        .eq('id', sourceId)
        .eq('foundry_id', foundryId)
        .single()

      if (taskError || !task) {
        return { success: false, error: 'Task not found' }
      }

      // Fetch assignees
      const { data: assignees } = await supabase
        .from('task_assignees')
        .select('profile:profiles!task_assignees_profile_id_fkey(id, full_name, avatar_url, role)')
        .eq('task_id', sourceId)

      // Fetch all comments for this task
      const { data: comments } = await supabase
        .from('task_comments')
        .select(`
          id, content, created_at, is_system_log,
          user:profiles!user_id(id, full_name, avatar_url, role)
        `)
        .eq('task_id', sourceId)
        .order('created_at', { ascending: true })

      // Fetch read status
      const commentIds = comments?.map(c => c.id) || []
      let readIds = new Set<string>()
      if (commentIds.length > 0) {
        const { data: reads } = await (supabase as AnySupabaseClient)
          .from('task_comment_reads')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', commentIds)
        readIds = new Set(reads?.map((r: { comment_id: string }) => r.comment_id) || [])
      }

      const items: ThreadItem[] = (comments || [])
        .filter((c): c is typeof c & { user: NonNullable<typeof c.user> } => c.user !== null)
        .map((c) => ({
          id: c.id,
          content: c.content,
          created_at: c.created_at || new Date().toISOString(),
          is_system_log: c.is_system_log || false,
          is_unread: !readIds.has(c.id) && c.user.id !== user.id,
          author: {
            id: c.user.id,
            full_name: c.user.full_name,
            avatar_url: c.user.avatar_url,
            role: c.user.role
          }
        }))

      const taskObj = task.objective as { id: string; title: string } | null

      return {
        success: true,
        data: {
          source: {
            type: 'task',
            id: task.id,
            title: task.title,
            task_number: task.task_number ?? undefined,
            status: task.status ?? undefined,
            progress: task.progress,
            end_date: task.end_date,
            assignees: (assignees || [])
              .map((a: { profile: { id: string; full_name: string | null; avatar_url: string | null; role: string | null } | null }) => a.profile)
              .filter(Boolean) as ThreadData['source']['assignees'],
            objective: taskObj
          },
          items
        }
      }
    }

    // Conversation thread
    if (sourceType === 'conversation') {
      // AUTH: Verify user participates in this conversation
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('id, title, conversation_type, status, buyer_id, seller_id, task_id, objective_id')
        .eq('id', sourceId)
        .single()

      if (convError || !conversation) {
        return { success: false, error: 'Conversation not found' }
      }

      // If this conversation is linked to a task or objective, load that thread instead
      // (these conversations are synced duplicates of task/objective comments)
      if (conversation.task_id) {
        return getThreadForSource('task', conversation.task_id)
      }
      if (conversation.objective_id) {
        return getThreadForSource('objective', conversation.objective_id)
      }

      // SECURITY: Verify the user is a participant
      const isBuyerOrSeller = conversation.buyer_id === user.id || conversation.seller_id === user.id
      if (!isBuyerOrSeller) {
        // Check conversation_participants table as fallback
        const { data: participant } = await supabase
          .from('conversation_participants')
          .select('id')
          .eq('conversation_id', sourceId)
          .eq('profile_id', user.id)
          .maybeSingle()

        if (!participant) {
          return { success: false, error: 'Access denied' }
        }
      }

      // Build a display title from conversation data
      const convTitle = conversation.title || 'Direct Message'

      // Fetch all non-deleted messages for this conversation
      const { data: messages } = await supabase
        .from('messages')
        .select(`
          id, content, created_at, is_deleted,
          sender:profiles!sender_id(id, full_name, avatar_url, role)
        `)
        .eq('conversation_id', sourceId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })

      // Fetch participants from conversation_participants table (not legacy buyer_id/seller_id)
      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('profile_id')
        .eq('conversation_id', sourceId)

      const participantIds = (participants || []).map((p: { profile_id: string }) => p.profile_id)
      // Fallback to legacy fields if no participants exist yet
      if (participantIds.length === 0) {
        const legacyIds = [conversation.buyer_id, conversation.seller_id].filter(Boolean) as string[]
        participantIds.push(...legacyIds)
      }
      const { data: participantProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role')
        .in('id', participantIds)

      const items: ThreadItem[] = (messages || [])
        .filter((m: { sender: unknown }) => m.sender !== null)
        .map((m: {
          id: string
          content: string | null
          created_at: string | null
          sender: { id: string; full_name: string | null; avatar_url: string | null; role: 'Executive' | 'Apprentice' | 'AI_Agent' | 'Founder' | 'Supplier' }
        }) => ({
          id: m.id,
          content: m.content ?? '',
          created_at: m.created_at || new Date().toISOString(),
          is_system_log: false,
          is_unread: false, // Messages don't have per-message read tracking
          author: {
            id: m.sender.id,
            full_name: m.sender.full_name,
            avatar_url: m.sender.avatar_url,
            role: m.sender.role
          }
        }))

      return {
        success: true,
        data: {
          source: {
            type: 'conversation',
            id: conversation.id,
            title: convTitle,
            status: conversation.status ?? undefined,
            participants: (participantProfiles || []).map((p: {
              id: string; full_name: string | null; avatar_url: string | null; role: string | null
            }) => ({
              id: p.id,
              full_name: p.full_name,
              avatar_url: p.avatar_url,
              role: p.role
            }))
          },
          items
        }
      }
    }

    // Objective thread
    const { data: objective, error: objError } = await (supabase as AnySupabaseClient)
      .from('objectives')
      .select('id, title, status, progress')
      .eq('id', sourceId)
      .eq('foundry_id', foundryId)
      .single()

    if (objError || !objective) {
      return { success: false, error: 'Objective not found' }
    }

    // Fetch all comments for this objective
    const { data: objComments } = await (supabase as AnySupabaseClient)
      .from('objective_comments')
      .select(`
        id, content, created_at, is_system_log,
        user:profiles!user_id(id, full_name, avatar_url, role)
      `)
      .eq('objective_id', sourceId)
      .order('created_at', { ascending: true })

    // Fetch read status
    const objCommentIds = objComments?.map((c: { id: string }) => c.id) || []
    let readObjIds = new Set<string>()
    if (objCommentIds.length > 0) {
      const { data: objReads } = await (supabase as AnySupabaseClient)
        .from('objective_comment_reads')
        .select('comment_id')
        .eq('user_id', user.id)
        .in('comment_id', objCommentIds)
      readObjIds = new Set(objReads?.map((r: { comment_id: string }) => r.comment_id) || [])
    }

    const objItems: ThreadItem[] = (objComments || [])
      .filter((c: { user: unknown }) => c.user !== null)
      .map((c: {
        id: string
        content: string
        created_at: string | null
        is_system_log: boolean | null
        user: { id: string; full_name: string | null; avatar_url: string | null; role: string | null }
      }) => ({
        id: c.id,
        content: c.content,
        created_at: c.created_at || new Date().toISOString(),
        is_system_log: c.is_system_log || false,
        is_unread: !readObjIds.has(c.id) && c.user.id !== user.id,
        author: {
          id: c.user.id,
          full_name: c.user.full_name,
          avatar_url: c.user.avatar_url,
          role: c.user.role
        }
      }))

    return {
      success: true,
      data: {
        source: {
          type: 'objective',
          id: objective.id,
          title: objective.title,
          status: objective.status ?? undefined,
          progress: objective.progress ?? null
        },
        items: objItems
      }
    }
  } catch (error) {
    console.error('getThreadForSource error:', error)
    return {
      success: false,
      error: sanitizeErrorMessage(error)
    }
  }
}
