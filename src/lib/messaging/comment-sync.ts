/**
 * Comment-to-Message Sync
 * 
 * This module handles syncing task/objective comments to the messaging system.
 * When a comment is added to a task or objective, it's also added as a message
 * in the corresponding conversation, so users can see all updates in one place.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { 
  createTaskConversation, 
  createObjectiveConversation,
  sendMessage 
} from './service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>

interface SyncTaskCommentParams {
  taskId: string
  userId: string
  content: string
  isSystemLog?: boolean
}

interface SyncObjectiveCommentParams {
  objectiveId: string
  userId: string
  content: string
  isSystemLog?: boolean
}

/**
 * Sync a task comment to the messaging system.
 * Creates a task conversation if one doesn't exist, then adds the comment as a message.
 */
export async function syncTaskCommentToMessages(
  supabase: AnySupabaseClient,
  params: SyncTaskCommentParams
): Promise<{ success: boolean; error?: string }> {
  const { taskId, userId, content, isSystemLog = false } = params

  try {
    // Get task details
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, title, task_number, assignee_id, creator_id')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      console.error('syncTaskCommentToMessages: Task not found', taskError)
      return { success: false, error: 'Task not found' }
    }

    // Get all task assignees
    const { data: assignees } = await supabase
      .from('task_assignees')
      .select('profile_id')
      .eq('task_id', taskId)

    // Build participant list
    const participantIds = new Set<string>()
    participantIds.add(userId) // Comment author
    if (task.creator_id) participantIds.add(task.creator_id)
    if (task.assignee_id) participantIds.add(task.assignee_id)
    assignees?.forEach(a => participantIds.add(a.profile_id))

    // Create or get task conversation
    const conversation = await createTaskConversation(supabase, {
      creatorId: userId,
      taskId: task.id,
      taskTitle: task.title,
      taskNumber: task.task_number,
      participantIds: Array.from(participantIds)
    })

    // Add comment as message (system log becomes system message type)
    await sendMessage(supabase, {
      conversationId: conversation.id,
      senderId: userId,
      content: content,
      messageType: isSystemLog ? 'system' : 'text'
    })

    // Update conversation's updated_at
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversation.id)

    return { success: true }
  } catch (error) {
    console.error('syncTaskCommentToMessages error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to sync comment' 
    }
  }
}

/**
 * Sync an objective comment to the messaging system.
 * Creates an objective conversation if one doesn't exist, then adds the comment as a message.
 */
export async function syncObjectiveCommentToMessages(
  supabase: AnySupabaseClient,
  params: SyncObjectiveCommentParams
): Promise<{ success: boolean; error?: string }> {
  const { objectiveId, userId, content, isSystemLog = false } = params

  try {
    // Get objective details
    const { data: objective, error: objError } = await supabase
      .from('objectives')
      .select('id, title, owner_id')
      .eq('id', objectiveId)
      .single()

    if (objError || !objective) {
      console.error('syncObjectiveCommentToMessages: Objective not found', objError)
      return { success: false, error: 'Objective not found' }
    }

    // Get all assignees from tasks under this objective
    const { data: taskAssignees } = await supabase
      .from('tasks')
      .select('assignee_id, creator_id')
      .eq('objective_id', objectiveId)

    // Build participant list
    const participantIds = new Set<string>()
    participantIds.add(userId) // Comment author
    if (objective.owner_id) participantIds.add(objective.owner_id)
    taskAssignees?.forEach(t => {
      if (t.assignee_id) participantIds.add(t.assignee_id)
      if (t.creator_id) participantIds.add(t.creator_id)
    })

    // Create or get objective conversation
    const conversation = await createObjectiveConversation(supabase, {
      creatorId: userId,
      objectiveId: objective.id,
      objectiveTitle: objective.title,
      participantIds: Array.from(participantIds)
    })

    // Add comment as message
    await sendMessage(supabase, {
      conversationId: conversation.id,
      senderId: userId,
      content: content,
      messageType: isSystemLog ? 'system' : 'text'
    })

    // Update conversation's updated_at
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversation.id)

    return { success: true }
  } catch (error) {
    console.error('syncObjectiveCommentToMessages error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to sync comment' 
    }
  }
}
