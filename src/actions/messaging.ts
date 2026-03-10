'use server'


import { revalidatePath } from 'next/cache'
import { withUser, type ActionError } from '@/lib/server-action-utils'
import {
  createConversation,
  sendMessage,
  sendSystemMessage,
  markAsRead,
  getConversation,
  getConversationsForUser,
  getMessages,
  archiveConversation as archiveConv,
  unarchiveConversation as unarchiveConv,
  // Enhanced messaging functions
  createDirectConversation,
  createTaskConversation,
  createObjectiveConversation,
  createExpertConversation,
  getEnhancedConversationsForUser,
  getUnreadCountForUser,
  markConversationAsRead,
  searchConversations as searchConvs,
  toggleConversationMute as toggleMute,
  getConversationParticipants,
  type ConversationWithParticipants,
  type MessageWithSender,
  type ConversationStatus,
  type ConversationType
} from '@/lib/messaging/service'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

export interface StartConversationParams {
  sellerId: string
  orderId?: string
  rfqId?: string
  listingId?: string
  initialMessage?: string
}

/**
 * Get all conversations for the current user
 */
export async function getConversations(status?: ConversationStatus) {
  return withUser(async ({ supabase, user }) => {
    try {
      const conversations = await getConversationsForUser(supabase, user.id, status)
      return { success: true as const, data: conversations }
    } catch (error) {
      console.error('Failed to get conversations:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Get messages for a specific conversation
 */
export async function getConversationMessages(
  conversationId: string,
  limit = 50,
  before?: string
) {
  return withUser(async ({ supabase, user }) => {
    try {
      const [messages, conversation] = await Promise.all([
        getMessages(supabase, conversationId, limit, before),
        getConversation(supabase, conversationId)
      ])

      // AUTH: Verify user is part of this conversation
      if (conversation && conversation.buyer_id !== user.id && conversation.seller_id !== user.id) {
        return { error: 'Access denied' }
      }

      return { 
        success: true as const, 
        data: { messages, conversation } 
      }
    } catch (error) {
      console.error('Failed to get conversation messages:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Send a new message in a conversation
 */
export async function sendNewMessage(
  conversationId: string,
  content: string,
  fileUrl?: string
) {
  return withUser(async ({ supabase, user }) => {
    try {
      // AUTH: Verify user is part of this conversation
      const conversation = await getConversation(supabase, conversationId)
      if (!conversation) {
        return { error: 'Conversation not found' }
      }
      if (conversation.buyer_id !== user.id && conversation.seller_id !== user.id) {
        return { error: 'Access denied' }
      }

      const message = await sendMessage(supabase, {
        conversationId,
        senderId: user.id,
        content,
        messageType: fileUrl ? 'file' : 'text',
        fileUrl
      })

      // Get the sender info separately since types aren't generated yet
      // SECURITY: Don't include email in client-facing response
      const { data: sender } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', user.id)
        .single()

      revalidatePath('/updates')

      const messageWithSender: MessageWithSender = {
        ...message,
        sender: {
          id: sender?.id || user.id,
          full_name: sender?.full_name || null,
          avatar_url: sender?.avatar_url || null,
          email: '', // Intentionally empty for security - not sent to client
        }
      }
      
      return { 
        success: true as const, 
        data: messageWithSender
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Start a new conversation with a seller
 */
export async function startConversation(
  params: StartConversationParams
) {
  return withUser(async ({ supabase, user }) => {
    try {
      const { sellerId, orderId, rfqId, listingId, initialMessage } = params

      // Create the conversation
      const conversation = await createConversation(supabase, {
        buyerId: user.id,
        sellerId,
        orderId,
        rfqId,
        listingId
      })

      // Send initial message if provided
      if (initialMessage) {
        await sendMessage(supabase, {
          conversationId: conversation.id,
          senderId: user.id,
          content: initialMessage,
          messageType: 'text'
        })
      }

      // Get full conversation with participants
      const fullConversation = await getConversation(supabase, conversation.id)

      revalidatePath('/updates')

      return { success: true as const, data: fullConversation || undefined }
    } catch (error) {
      console.error('Failed to start conversation:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Mark all messages in a conversation as read
 */
export async function markConversationRead(
  conversationId: string
) {
  return withUser(async ({ supabase, user }) => {
    try {
      const count = await markAsRead(supabase, conversationId, user.id)
      
      return { success: true as const, markedCount: count }
    } catch (error) {
      console.error('Failed to mark conversation as read:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Archive a conversation
 */
export async function archiveConversation(
  conversationId: string
) {
  return withUser(async ({ supabase, user }) => {
    try {
      // AUTH: Verify user is part of this conversation
      const conversation = await getConversation(supabase, conversationId)
      if (!conversation) {
        return { error: 'Conversation not found' }
      }
      if (conversation.buyer_id !== user.id && conversation.seller_id !== user.id) {
        return { error: 'Access denied' }
      }

      await archiveConv(supabase, conversationId)
      
      revalidatePath('/updates')

      return { success: true as const }
    } catch (error) {
      console.error('Failed to archive conversation:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Unarchive a conversation
 */
export async function unarchiveConversation(
  conversationId: string
) {
  return withUser(async ({ supabase, user }) => {
    try {
      // SECURITY: Verify user is part of this conversation
      const conversation = await getConversation(supabase, conversationId)
      if (!conversation) {
        return { error: 'Conversation not found' }
      }
      if (conversation.buyer_id !== user.id && conversation.seller_id !== user.id) {
        return { error: 'Access denied' }
      }

      await unarchiveConv(supabase, conversationId)
      
      revalidatePath('/updates')

      return { success: true as const }
    } catch (error) {
      console.error('Failed to unarchive conversation:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Create a system message for events (order created, payment received, etc.)
 */
export async function createSystemMessage(
  conversationId: string,
  content: string
) {
  return withUser(async ({ supabase, user }) => {
    try {
      // SECURITY: Verify user is part of this conversation
      const conversation = await getConversation(supabase, conversationId)
      if (!conversation) {
        return { error: 'Conversation not found' }
      }
      if (conversation.buyer_id !== user.id && conversation.seller_id !== user.id) {
        return { error: 'Access denied' }
      }

      // SECURITY: Sanitize content to prevent injection
      const sanitizedContent = content.trim().slice(0, 2000) // Limit length

      await sendSystemMessage(supabase, conversationId, sanitizedContent)
      
      return { success: true as const }
    } catch (error) {
      console.error('Failed to create system message:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

// ============================================================================
// ENHANCED MESSAGING SERVER ACTIONS
// ============================================================================

/**
 * Start a direct message conversation with another user
 */
export async function startDirectMessage(
  participantId: string,
  initialMessage?: string
) {
  return withUser(async ({ supabase, user }) => {
    try {
      // VALIDATION: Validate participant exists
      const { data: participant } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', participantId)
        .single()

      if (!participant) {
        return { error: 'User not found' }
      }

      // VALIDATION: Cannot message yourself
      if (participantId === user.id) {
        return { error: 'Cannot message yourself' }
      }

      const conversation = await createDirectConversation(supabase, {
        creatorId: user.id,
        participantId
      })

      // Send initial message if provided
      if (initialMessage?.trim()) {
        await sendMessage(supabase, {
          conversationId: conversation.id,
          senderId: user.id,
          content: initialMessage.trim(),
          messageType: 'text'
        })
      }

      // Get full conversation with participants
      const fullConversation = await getConversation(supabase, conversation.id)

      revalidatePath('/updates')

      return { success: true as const, data: fullConversation || undefined }
    } catch (error) {
      console.error('Failed to start direct message:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Start or get a task discussion channel
 */
export async function startTaskDiscussion(
  taskId: string,
  initialMessage?: string
) {
  return withUser(async ({ supabase, user }) => {
    try {
      // Get task details and assignees
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select(`
          id, 
          title, 
          task_number,
          assignee_id,
          creator_id
        `)
        .eq('id', taskId)
        .single()

      if (taskError || !task) {
        return { error: 'Task not found' }
      }

      // Get all assignees from task_assignees table
      const { data: assignees } = await supabase
        .from('task_assignees')
        .select('profile_id')
        .eq('task_id', taskId)

      // Build participant list (creator, primary assignee, and all additional assignees)
      const participantIds = new Set<string>()
      participantIds.add(user.id) // Current user
      if (task.creator_id) participantIds.add(task.creator_id)
      if (task.assignee_id) participantIds.add(task.assignee_id)
      assignees?.forEach(a => { if (a?.profile_id) participantIds.add(a.profile_id) })

      const conversation = await createTaskConversation(supabase, {
        creatorId: user.id,
        taskId: task.id,
        taskTitle: task.title,
        taskNumber: task.task_number,
        participantIds: Array.from(participantIds)
      })

      // Send initial message or system message
      if (initialMessage?.trim()) {
        await sendMessage(supabase, {
          conversationId: conversation.id,
          senderId: user.id,
          content: initialMessage.trim(),
          messageType: 'text'
        })
      } else {
        // Send system message about discussion start
        await sendSystemMessage(supabase, conversation.id, 
          `Discussion started about task #${task.task_number}: ${task.title}`)
      }

      const fullConversation = await getConversation(supabase, conversation.id)

      revalidatePath('/tasks')
      revalidatePath('/updates')
      
      return { success: true as const, data: fullConversation || undefined }
    } catch (error) {
      console.error('Failed to start task discussion:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Start or get an objective discussion channel
 */
export async function startObjectiveDiscussion(
  objectiveId: string,
  initialMessage?: string
) {
  return withUser(async ({ supabase, user }) => {
    try {
      // Get objective details
      const { data: objective, error: objError } = await supabase
        .from('objectives')
        .select('id, title, creator_id')
        .eq('id', objectiveId)
        .single()

      if (objError || !objective) {
        return { error: 'Objective not found' }
      }

      // Get all assignees from tasks under this objective
      const { data: taskAssignees } = await supabase
        .from('tasks')
        .select('assignee_id, creator_id')
        .eq('objective_id', objectiveId)
        .eq('is_ghost', false)
        .is('deleted_at', null)

      // Build participant list
      const participantIds = new Set<string>()
      participantIds.add(user.id)
      if (objective.creator_id) participantIds.add(objective.creator_id)
      taskAssignees?.forEach(t => {
        if (t.assignee_id) participantIds.add(t.assignee_id)
        if (t.creator_id) participantIds.add(t.creator_id)
      })

      const conversation = await createObjectiveConversation(supabase, {
        creatorId: user.id,
        objectiveId: objective.id,
        objectiveTitle: objective.title,
        participantIds: Array.from(participantIds)
      })

      // Send initial message or system message
      if (initialMessage?.trim()) {
        await sendMessage(supabase, {
          conversationId: conversation.id,
          senderId: user.id,
          content: initialMessage.trim(),
          messageType: 'text'
        })
      } else {
        await sendSystemMessage(supabase, conversation.id, 
          `Discussion started for objective: ${objective.title}`)
      }

      const fullConversation = await getConversation(supabase, conversation.id)

      revalidatePath('/objectives')
      revalidatePath('/updates')
      
      return { success: true as const, data: fullConversation || undefined }
    } catch (error) {
      console.error('Failed to start objective discussion:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Contact an expert from the marketplace
 */
export async function contactExpert(
  providerId: string,
  listingId?: string,
  initialMessage?: string
) {
  return withUser(async ({ supabase, user }) => {
    try {
      // Get provider's user_id from provider_profiles
      const { data: provider, error: providerError } = await supabase
        .from('provider_profiles')
        .select('user_id')
        .eq('id', providerId)
        .single()

      // If providerId is not in provider_profiles, assume it's already a user_id
      const expertUserId = provider?.user_id || providerId

      // VALIDATION: Validate expert user exists
      const { data: expertProfile } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', expertUserId)
        .single()

      if (!expertProfile) {
        return { error: 'Expert not found' }
      }

      // VALIDATION: Cannot message yourself
      if (expertUserId === user.id) {
        return { error: 'Cannot message yourself' }
      }

      // Get listing title if listingId provided
      let listingTitle: string | undefined
      if (listingId) {
        const { data: listing } = await supabase
          .from('marketplace_listings')
          .select('title')
          .eq('id', listingId)
          .single()
        listingTitle = listing?.title
      }

      const conversation = await createExpertConversation(supabase, {
        creatorId: user.id,
        expertUserId,
        listingId,
        listingTitle
      })

      // Send initial message if provided
      if (initialMessage?.trim()) {
        await sendMessage(supabase, {
          conversationId: conversation.id,
          senderId: user.id,
          content: initialMessage.trim(),
          messageType: 'text'
        })
      }

      const fullConversation = await getConversation(supabase, conversation.id)

      revalidatePath('/marketplace')
      revalidatePath('/updates')
      
      return { success: true as const, data: fullConversation || undefined }
    } catch (error) {
      console.error('Failed to contact expert:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Get enhanced conversations for the current user
 */
export async function getEnhancedConversations(options?: {
  status?: ConversationStatus
  type?: ConversationType
  limit?: number
}) {
  return withUser(async ({ supabase, user }) => {
    try {
      const conversations = await getEnhancedConversationsForUser(supabase, user.id, options)
      return { success: true as const, data: conversations }
    } catch (error) {
      console.error('Failed to get enhanced conversations:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Get total unread message count for the current user
 */
export async function getUnreadCount() {
  return withUser(async ({ supabase, user }) => {
    try {
      const count = await getUnreadCountForUser(supabase, user.id)
      return { success: true as const, count }
    } catch (error) {
      console.error('Failed to get unread count:', error)
      return { error: 'Failed to get unread count', count: 0 }
    }
  })
}

/**
 * Mark a conversation as read using the enhanced method
 */
export async function markConversationAsReadEnhanced(
  conversationId: string
) {
  return withUser(async ({ supabase, user }) => {
    try {
      await markConversationAsRead(supabase, conversationId, user.id)
      
      return { success: true as const }
    } catch (error) {
      console.error('Failed to mark conversation as read:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Search conversations
 */
export async function searchConversations(
  query: string,
  limit = 20
) {
  return withUser(async ({ supabase, user }) => {
    try {
      if (!query.trim()) {
        return { success: true as const, data: [] as ConversationWithParticipants[] }
      }

      const conversations = await searchConvs(supabase, user.id, query.trim(), limit)
      return { success: true as const, data: conversations }
    } catch (error) {
      console.error('Failed to search conversations:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Toggle mute status for a conversation
 */
export async function toggleConversationMute(
  conversationId: string
) {
  return withUser(async ({ supabase, user }) => {
    try {
      const isMuted = await toggleMute(supabase, conversationId, user.id)
      
      return { success: true as const, isMuted }
    } catch (error) {
      console.error('Failed to toggle mute:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}

/**
 * Get participants of a conversation
 */
export async function getParticipants(
  conversationId: string
) {
  return withUser(async ({ supabase, user }) => {
    try {
      const participants = await getConversationParticipants(supabase, conversationId)
      
      const data = participants.map(p => ({
        id: p.id,
        profile_id: p.profile_id,
        full_name: p.profile?.full_name || null,
        avatar_url: p.profile?.avatar_url || null,
        role: p.profile?.role
      }))

      return { success: true as const, data }
    } catch (error) {
      console.error('Failed to get participants:', error)
      return { 
        error: sanitizeErrorMessage(error) 
      }
    }
  })
}
