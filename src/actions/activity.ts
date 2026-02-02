'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { z } from 'zod'
import { syncObjectiveCommentToMessages, syncTaskCommentToMessages } from '@/lib/messaging/comment-sync'

// Simple content validation schema
const contentSchema = z.object({
  content: z.string()
    .min(1, 'Comment cannot be empty')
    .max(5000, 'Comment must be 5,000 characters or less')
})
import type { 
  ActivityItem, 
  ActivitySourceType,
  RawTaskComment, 
  RawObjectiveComment, 
  RawTaskHistory,
  TaskHistoryActionType
} from '@/types/activity'

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

    // Validate content
    const validation = contentSchema.safeParse({ content })
    if (!validation.success) {
      return { success: false, error: validation.error.issues[0]?.message || 'Invalid content' }
    }

    switch (sourceType) {
      case 'task': {
        // Add comment to task
        const { error } = await supabase.from('task_comments').insert({
          task_id: sourceId,
          user_id: user.id,
          content: content.trim(),
          is_system_log: false,
          foundry_id: foundryId
        })
        
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
        revalidatePath('/today')
        return { success: true }
      }

      case 'objective': {
        // Add comment to objective (table created by migration)
        const { error } = await (supabase as AnySupabaseClient).from('objective_comments').insert({
          objective_id: sourceId,
          user_id: user.id,
          content: content.trim(),
          is_system_log: false,
          foundry_id: foundryId
        })
        
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
        revalidatePath('/today')
        return { success: true }
      }

      case 'conversation': {
        // Send message to conversation
        const { error } = await supabase.from('messages').insert({
          conversation_id: sourceId,
          sender_id: user.id,
          content: content.trim()
        })
        
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
        revalidatePath('/today')
        return { success: true }
      }

      default:
        return { success: false, error: 'Invalid source type' }
    }
  } catch (error) {
    console.error('replyToActivity error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to reply' 
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
      error: error instanceof Error ? error.message : 'Failed to mark as read' 
    }
  }
}

/**
 * Mark multiple activity items as read in batch
 */
export async function markMultipleActivityRead(
  items: Array<{ type: 'task_comment' | 'objective_comment'; commentId: string }>
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
      error: error instanceof Error ? error.message : 'Failed to mark as read' 
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
      .or(`assignee_id.eq.${user.id},creator_id.eq.${user.id}`)

    const myTaskIds = myTasks?.map(t => t.id) || []

    // Get user's objective IDs - cast to avoid type recursion
    const { data: myObjectives } = await (supabase as AnySupabaseClient)
      .from('objectives')
      .select('id')
      .eq('foundry_id', foundryId)
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

    // Get unread message count from conversations
    const { data: conversations } = await (supabase as AnySupabaseClient)
      .from('conversation_participants')
      .select('conversation_id, last_read_at')
      .eq('profile_id', user.id)

    let messageCount = 0
    if (conversations && conversations.length > 0) {
      for (const conv of conversations) {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.conversation_id)
          .neq('sender_id', user.id)
          .gt('created_at', conv.last_read_at || '1970-01-01')

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
      error: error instanceof Error ? error.message : 'Failed to get unread count' 
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
    revalidatePath('/today')

    return { success: true, commentId: comment?.id }
  } catch (error) {
    console.error('addObjectiveComment error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to add comment' 
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
}): Promise<{
  success: boolean
  data?: ActivityItem[]
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

    const limit = options?.limit || 30
    const filter = options?.filter || 'all'
    const includeSystemLogs = options?.includeSystemLogs || false
    const showAllFoundryActivity = options?.showAllFoundryActivity || false

    let allTaskIds: string[] = []
    let myObjectiveIds: string[] = []

    if (showAllFoundryActivity) {
      // Admin mode: get ALL tasks in the foundry
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('foundry_id', foundryId)

      allTaskIds = allTasks?.map(t => t.id) || []

      // Get ALL objectives in the foundry
      const { data: allObjectives } = await (supabase as AnySupabaseClient)
        .from('objectives')
        .select('id')
        .eq('foundry_id', foundryId) as { data: Array<{ id: string }> | null }

      myObjectiveIds = allObjectives?.map(o => o.id) || []
    } else {
      // Standard mode: only user's tasks
      // Get user's task IDs
      const { data: myTasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('foundry_id', foundryId)
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

      // Only filter out system logs if not explicitly including them
      if (!includeSystemLogs) {
        taskCommentsQuery = taskCommentsQuery.eq('is_system_log', false)
      }

      const { data: taskComments } = await taskCommentsQuery

      // Get read status for task comments (table created by migration)
      const taskCommentIds = taskComments?.map(c => c.id) || []
      const { data: taskReads } = await (supabase as AnySupabaseClient)
        .from('task_comment_reads')
        .select('comment_id')
        .eq('user_id', user.id)
        .in('comment_id', taskCommentIds)

      const readTaskCommentIds = new Set(taskReads?.map(r => r.comment_id) || [])

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
      const { data: taskHistory } = await (supabase as AnySupabaseClient)
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

      if (taskHistory) {
        for (const history of taskHistory as RawTaskHistory[]) {
          if (!history.user || !history.task) continue

          // Task history items don't have read status tracking
          // Note: This block only runs when filter is 'all' or 'tasks' (not 'unread')

          const content = formatTaskHistoryContent(
            history.action_type,
            history.changes
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
            action_type: history.action_type
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

      // Only filter out system logs if not explicitly including them
      if (!includeSystemLogs) {
        objectiveCommentsQuery = objectiveCommentsQuery.eq('is_system_log', false)
      }

      const { data: objectiveComments } = await objectiveCommentsQuery

      // Get read status for objective comments (table created by migration)
      const objectiveCommentIds = objectiveComments?.map((c: { id: string }) => c.id) || []
      const { data: objectiveReads } = await (supabase as AnySupabaseClient)
        .from('objective_comment_reads')
        .select('comment_id')
        .eq('user_id', user.id)
        .in('comment_id', objectiveCommentIds)

      const readObjectiveCommentIds = new Set(objectiveReads?.map(r => r.comment_id) || [])

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

    // Fetch conversation messages
    if ((filter === 'all' || filter === 'messages' || filter === 'unread') && myConversationIds.length > 0) {
      const { data: messages } = await supabase
        .from('messages')
        .select(`
          id, content, created_at,
          sender:profiles!sender_id(id, full_name, avatar_url, role),
          conversation:conversations!conversation_id(id, buyer_id, seller_id)
        `)
        .in('conversation_id', myConversationIds)
        .neq('sender_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (messages) {
        for (const message of messages) {
          const msg = message as {
            id: string
            content: string
            created_at: string | null
            sender: { id: string; full_name: string | null; avatar_url: string | null; role: string | null } | null
            conversation: { id: string; buyer_id: string; seller_id: string } | null
          }
          if (!msg.sender || !msg.conversation) continue

          const lastReadAt = conversationMap.get(msg.conversation.id)
          const isUnread = !lastReadAt || new Date(msg.created_at || 0) > new Date(lastReadAt)
          if (filter === 'unread' && !isUnread) continue

          items.push({
            id: msg.id,
            type: 'message',
            content: msg.content,
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
              title: 'Direct Message'
            },
            is_unread: isUnread
          })
        }
      }
    }

    // Sort by created_at descending
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Apply limit after merging
    const limitedItems = items.slice(0, limit)

    return { success: true, data: limitedItems }
  } catch (error) {
    console.error('getActivityFeed error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get activity feed' 
    }
  }
}
