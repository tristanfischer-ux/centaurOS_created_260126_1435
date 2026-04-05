'use server'


import { revalidatePath } from 'next/cache'
import { withUser, type ActionError } from '@/lib/server-action-utils'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
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
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/security/rate-limit'

// INTENT: Auth check via conversation_participants covers all conversation types
// (direct, task, objective, expert) — unlike buyer_id/seller_id which are null
// for task and objective conversations.
async function isParticipant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('conversation_participants')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('profile_id', userId)
    .maybeSingle()
  return !!data
}

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
      // AUTH: Verify conversation exists AND user is a participant BEFORE fetching data
      const conversation = await getConversation(supabase, conversationId)
      if (!conversation) {
        return { error: 'Conversation not found' }
      }
      if (!(await isParticipant(supabase, conversationId, user.id))) {
        return { error: 'Access denied' }
      }

      // VALIDATION: Cap limit to prevent abuse
      const safeLim = Math.min(limit, 200)

      // VALIDATION: before must be a valid ISO timestamp if provided
      if (before) {
        const ts = Date.parse(before)
        if (isNaN(ts)) {
          return { error: 'Invalid pagination cursor' }
        }
      }

      const messages = await getMessages(supabase, conversationId, safeLim, before)

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
      // SECURITY: Rate limit — 30 messages per minute per user
      const rl = await rateLimit('api', `msg:${user.id}`, { limit: 30, window: 60 * 1000 })
      if (!rl.success) {
        return { error: 'Too many messages. Please slow down.' }
      }

      // VALIDATION: Content must be non-empty and bounded
      const trimmed = content.trim()
      if (!trimmed && !fileUrl) {
        return { error: 'Message content is required' }
      }
      if (trimmed.length > 10_000) {
        return { error: 'Message is too long (10,000 character limit)' }
      }

      // VALIDATION: fileUrl must be a valid HTTPS URL
      if (fileUrl) {
        try {
          const parsed = new URL(fileUrl)
          if (parsed.protocol !== 'https:') {
            return { error: 'File URL must use HTTPS' }
          }
        } catch {
          return { error: 'Invalid file URL' }
        }
        if (fileUrl.length > 2048) {
          return { error: 'File URL too long' }
        }
      }

      // AUTH: Verify user is part of this conversation
      const conversation = await getConversation(supabase, conversationId)
      if (!conversation) {
        return { error: 'Conversation not found' }
      }
      if (!(await isParticipant(supabase, conversationId, user.id))) {
        return { error: 'Access denied' }
      }

      const message = await sendMessage(supabase, {
        conversationId,
        senderId: user.id,
        content: trimmed,
        messageType: fileUrl ? 'file' : 'text',
        fileUrl
      })

      // Get the sender info separately since types aren't generated yet
      // SECURITY: Don't include email in client-facing response
      // SECURITY: intentional unscoped query — fetching own profile by auth user.id
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
      // SECURITY: Rate limit — 10 new conversations per hour per user
      const rl = await rateLimit('api', `conv:${user.id}`, { limit: 10, window: 60 * 60 * 1000 })
      if (!rl.success) {
        return { error: 'Too many conversations. Please try again later.' }
      }

      const { sellerId, orderId, rfqId, listingId, initialMessage } = params

      // SECURITY: intentional cross-foundry for marketplace/messaging — seller may be in different foundry
      // VALIDATION: Verify seller exists and prevent self-messaging
      const { data: seller } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', sellerId)
        .single()
      if (!seller) {
        return { error: 'Seller not found' }
      }
      if (sellerId === user.id) {
        return { error: 'Cannot message yourself' }
      }
      // VALIDATION: Bound initial message length
      if (initialMessage && initialMessage.trim().length > 10_000) {
        return { error: 'Message is too long (10,000 character limit)' }
      }

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
      // AUTH: Verify user is a participant before marking read
      if (!(await isParticipant(supabase, conversationId, user.id))) {
        return { error: 'Access denied' }
      }

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
      // AUTH: Verify user is a participant
      if (!(await isParticipant(supabase, conversationId, user.id))) {
        return { error: 'Access denied' }
      }

      // Per-user archive: sets is_archived on the participant row, not the
      // conversation status. Group conversations are now safe to archive.
      await archiveConv(supabase, conversationId, user.id)
      
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
      // SECURITY: Verify user is a participant
      if (!(await isParticipant(supabase, conversationId, user.id))) {
        return { error: 'Access denied' }
      }

      // Per-user unarchive
      await unarchiveConv(supabase, conversationId, user.id)
      
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
      // SECURITY: Only platform admins can create system messages.
      // Regular users must not forge messages that appear as platform-generated.
      // SECURITY: intentional unscoped query — fetching own profile by auth user.id for role check
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (!profile || profile.role !== 'Founder') {
        return { error: 'Only administrators can create system messages' }
      }

      // SECURITY: Verify user is a participant
      if (!(await isParticipant(supabase, conversationId, user.id))) {
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
      // SECURITY: intentional cross-foundry for marketplace/messaging — DM participant may be in different foundry
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

      // VALIDATION: initialMessage length bound
      if (initialMessage && initialMessage.trim().length > 10_000) {
        return { error: 'Initial message too long (max 10,000 characters)' }
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
      // SECURITY: Verify task belongs to caller's foundry to prevent cross-foundry IDOR
      const foundryId = await getFoundryIdCached()
      if (!foundryId) return { error: 'No foundry context' }

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
        .eq('foundry_id', foundryId)
        .single()

      if (taskError || !task) {
        return { error: 'Task not found' }
      }

      // VALIDATION: initialMessage length bound
      if (initialMessage && initialMessage.trim().length > 10_000) {
        return { error: 'Initial message too long (max 10,000 characters)' }
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
      // SECURITY: Verify objective belongs to caller's foundry to prevent cross-foundry IDOR
      const foundryId = await getFoundryIdCached()
      if (!foundryId) return { error: 'No foundry context' }

      const { data: objective, error: objError } = await supabase
        .from('objectives')
        .select('id, title, creator_id')
        .eq('id', objectiveId)
        .eq('foundry_id', foundryId)
        .single()

      if (objError || !objective) {
        return { error: 'Objective not found' }
      }

      // VALIDATION: initialMessage length bound
      if (initialMessage && initialMessage.trim().length > 10_000) {
        return { error: 'Initial message too long (max 10,000 characters)' }
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
      // SECURITY: Rate limit — 10 expert contacts per hour per user
      const rl = await rateLimit('api', `expert:${user.id}`, { limit: 10, window: 60 * 60 * 1000 })
      if (!rl.success) {
        return { error: 'Too many contact requests. Please try again later.' }
      }

      // Get provider's user_id from provider_profiles
      const { data: provider, error: providerError } = await supabase
        .from('provider_profiles')
        .select('user_id')
        .eq('id', providerId)
        .single()

      // SECURITY: Require a valid provider profile — do not fall back to treating
      // providerId as a user_id, which would allow messaging arbitrary users.
      if (!provider) {
        return { error: 'Expert not found' }
      }
      const expertUserId = provider.user_id

      // SECURITY: intentional cross-foundry for marketplace/messaging — expert may be in different foundry
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

      // VALIDATION: initialMessage length bound
      if (initialMessage && initialMessage.trim().length > 10_000) {
        return { error: 'Initial message too long (max 10,000 characters)' }
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

      // FLOW: Notify the executive that someone wants to connect.
      // Fire-and-forget — notification failure shouldn't break the conversation.
      // SECURITY: Only notify on NEW conversations to prevent spam on re-contact.
      // SECURITY: Check dedup limit (max 10 contact_enquiry alerts per executive per 24h).
      try {
        const { createMatchAlert, canCreateAlert } = await import('@/lib/notifications/match-alert-helpers')
        const { sendNotification } = await import('@/lib/notifications')

        const allowed = await canCreateAlert(expertUserId, 'contact_enquiry', 10)
        if (allowed) {
          const alertTitle = listingTitle
            ? `New enquiry about ${listingTitle}`
            : 'Someone wants to connect'

          await createMatchAlert(
            expertUserId,
            'contact_enquiry',
            alertTitle,
            'A founder reached out to you via the marketplace.',
            listingId,
            { conversationId: conversation.id }
          )

          await sendNotification({
            userId: expertUserId,
            priority: 'high',
            title: alertTitle,
            body: 'A founder reached out to you via the marketplace.',
            actionUrl: '/updates',
          })
        }
      } catch (notifyError) {
        console.warn('[contactExpert] Notification failed (non-blocking):', notifyError)
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
      // AUTH: Verify user is a participant before marking read
      if (!(await isParticipant(supabase, conversationId, user.id))) {
        return { error: 'Access denied' }
      }

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
  // Cap limit to prevent abuse
  const cappedLimit = Math.min(Math.max(1, limit), 50)
  return withUser(async ({ supabase, user }) => {
    try {
      // VALIDATION: Bound query length to prevent oversized DB searches
      if (query.trim().length > 500) {
        return { error: 'Search query too long (max 500 characters)' }
      }
      if (!query.trim()) {
        return { success: true as const, data: [] as ConversationWithParticipants[] }
      }

      const conversations = await searchConvs(supabase, user.id, query.trim(), cappedLimit)
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
      // AUTH: Verify user is a participant before toggling mute
      if (!(await isParticipant(supabase, conversationId, user.id))) {
        return { error: 'Access denied' }
      }

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
      // AUTH: Verify user is a participant before revealing other participants
      if (!(await isParticipant(supabase, conversationId, user.id))) {
        return { error: 'Access denied' }
      }

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

/**
 * Edit a message (only by the sender)
 */
export async function editMessage(
  messageId: string,
  newContent: string
): Promise<{ success: boolean; error?: string }> {
  return withUser(async ({ supabase, user }) => {
    if (!newContent.trim()) {
      return { success: false, error: 'Message cannot be empty' }
    }
    if (newContent.length > 10000) {
      return { success: false, error: 'Message too long (max 10,000 characters)' }
    }

    const { editMessage: edit } = await import('@/lib/messaging/service')
    return edit(supabase, messageId, user.id, newContent.trim())
  })
}

/**
 * Delete a message (soft delete, only by the sender)
 */
export async function deleteMessage(
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  return withUser(async ({ supabase, user }) => {
    const { deleteMessage: del } = await import('@/lib/messaging/service')
    return del(supabase, messageId, user.id)
  })
}
