'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
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
export async function getConversations(status?: ConversationStatus): Promise<{
  success: boolean
  data?: ConversationWithParticipants[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const conversations = await getConversationsForUser(supabase, user.id, status)
    return { success: true, data: conversations }
  } catch (error) {
    console.error('Failed to get conversations:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get conversations' 
    }
  }
}

/**
 * Get messages for a specific conversation
 */
export async function getConversationMessages(
  conversationId: string,
  limit = 50,
  before?: string
): Promise<{
  success: boolean
  data?: {
    messages: MessageWithSender[]
    conversation: ConversationWithParticipants | null
  }
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const [messages, conversation] = await Promise.all([
      getMessages(supabase, conversationId, limit, before),
      getConversation(supabase, conversationId)
    ])

    // Verify user is part of this conversation
    if (conversation && conversation.buyer_id !== user.id && conversation.seller_id !== user.id) {
      return { success: false, error: 'Access denied' }
    }

    return { 
      success: true, 
      data: { messages, conversation } 
    }
  } catch (error) {
    console.error('Failed to get conversation messages:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get messages' 
    }
  }
}

/**
 * Send a new message in a conversation
 */
export async function sendNewMessage(
  conversationId: string,
  content: string,
  fileUrl?: string
): Promise<{
  success: boolean
  data?: MessageWithSender
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Verify user is part of this conversation
    const conversation = await getConversation(supabase, conversationId)
    if (!conversation) {
      return { success: false, error: 'Conversation not found' }
    }
    if (conversation.buyer_id !== user.id && conversation.seller_id !== user.id) {
      return { success: false, error: 'Access denied' }
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

    revalidatePath('/messages')
    
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
      success: true, 
      data: messageWithSender
    }
  } catch (error) {
    console.error('Failed to send message:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send message' 
    }
  }
}

/**
 * Start a new conversation with a seller
 */
export async function startConversation(
  params: StartConversationParams
): Promise<{
  success: boolean
  data?: ConversationWithParticipants
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

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

    revalidatePath('/messages')
    
    return { success: true, data: fullConversation || undefined }
  } catch (error) {
    console.error('Failed to start conversation:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to start conversation' 
    }
  }
}

/**
 * Mark all messages in a conversation as read
 */
export async function markConversationRead(
  conversationId: string
): Promise<{
  success: boolean
  markedCount?: number
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const count = await markAsRead(supabase, conversationId, user.id)
    
    return { success: true, markedCount: count }
  } catch (error) {
    console.error('Failed to mark conversation as read:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to mark as read' 
    }
  }
}

/**
 * Archive a conversation
 */
export async function archiveConversation(
  conversationId: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Verify user is part of this conversation
    const conversation = await getConversation(supabase, conversationId)
    if (!conversation) {
      return { success: false, error: 'Conversation not found' }
    }
    if (conversation.buyer_id !== user.id && conversation.seller_id !== user.id) {
      return { success: false, error: 'Access denied' }
    }

    await archiveConv(supabase, conversationId)
    
    revalidatePath('/messages')
    
    return { success: true }
  } catch (error) {
    console.error('Failed to archive conversation:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to archive conversation' 
    }
  }
}

/**
 * Unarchive a conversation
 */
export async function unarchiveConversation(
  conversationId: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Security: Verify user is part of this conversation
    const conversation = await getConversation(supabase, conversationId)
    if (!conversation) {
      return { success: false, error: 'Conversation not found' }
    }
    if (conversation.buyer_id !== user.id && conversation.seller_id !== user.id) {
      return { success: false, error: 'Access denied' }
    }

    await unarchiveConv(supabase, conversationId)
    
    revalidatePath('/messages')
    
    return { success: true }
  } catch (error) {
    console.error('Failed to unarchive conversation:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to unarchive conversation' 
    }
  }
}

/**
 * Create a system message for events (order created, payment received, etc.)
 */
export async function createSystemMessage(
  conversationId: string,
  content: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Security: Verify user is part of this conversation
    const conversation = await getConversation(supabase, conversationId)
    if (!conversation) {
      return { success: false, error: 'Conversation not found' }
    }
    if (conversation.buyer_id !== user.id && conversation.seller_id !== user.id) {
      return { success: false, error: 'Access denied' }
    }

    // Security: Sanitize content to prevent injection
    const sanitizedContent = content.trim().slice(0, 2000) // Limit length

    await sendSystemMessage(supabase, conversationId, sanitizedContent)
    
    return { success: true }
  } catch (error) {
    console.error('Failed to create system message:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create system message' 
    }
  }
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
): Promise<{
  success: boolean
  data?: ConversationWithParticipants
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Validate participant exists
    const { data: participant } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', participantId)
      .single()

    if (!participant) {
      return { success: false, error: 'User not found' }
    }

    // Cannot message yourself
    if (participantId === user.id) {
      return { success: false, error: 'Cannot message yourself' }
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

    revalidatePath('/home')
    revalidatePath('/messages')
    
    return { success: true, data: fullConversation || undefined }
  } catch (error) {
    console.error('Failed to start direct message:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to start conversation' 
    }
  }
}

/**
 * Start or get a task discussion channel
 */
export async function startTaskDiscussion(
  taskId: string,
  initialMessage?: string
): Promise<{
  success: boolean
  data?: ConversationWithParticipants
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

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
      return { success: false, error: 'Task not found' }
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
    assignees?.forEach(a => participantIds.add(a.profile_id))

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
    revalidatePath('/home')
    
    return { success: true, data: fullConversation || undefined }
  } catch (error) {
    console.error('Failed to start task discussion:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to start discussion' 
    }
  }
}

/**
 * Start or get an objective discussion channel
 */
export async function startObjectiveDiscussion(
  objectiveId: string,
  initialMessage?: string
): Promise<{
  success: boolean
  data?: ConversationWithParticipants
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Get objective details
    const { data: objective, error: objError } = await supabase
      .from('objectives')
      .select('id, title, creator_id')
      .eq('id', objectiveId)
      .single()

    if (objError || !objective) {
      return { success: false, error: 'Objective not found' }
    }

    // Get all assignees from tasks under this objective
    const { data: taskAssignees } = await supabase
      .from('tasks')
      .select('assignee_id, creator_id')
      .eq('objective_id', objectiveId)

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
    revalidatePath('/home')
    
    return { success: true, data: fullConversation || undefined }
  } catch (error) {
    console.error('Failed to start objective discussion:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to start discussion' 
    }
  }
}

/**
 * Contact an expert from the marketplace
 */
export async function contactExpert(
  providerId: string,
  listingId?: string,
  initialMessage?: string
): Promise<{
  success: boolean
  data?: ConversationWithParticipants
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Get provider's user_id from provider_profiles
    const { data: provider, error: providerError } = await supabase
      .from('provider_profiles')
      .select('user_id')
      .eq('id', providerId)
      .single()

    // If providerId is not in provider_profiles, assume it's already a user_id
    const expertUserId = provider?.user_id || providerId

    // Validate expert user exists
    const { data: expertProfile } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', expertUserId)
      .single()

    if (!expertProfile) {
      return { success: false, error: 'Expert not found' }
    }

    // Cannot message yourself
    if (expertUserId === user.id) {
      return { success: false, error: 'Cannot message yourself' }
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
    revalidatePath('/home')
    
    return { success: true, data: fullConversation || undefined }
  } catch (error) {
    console.error('Failed to contact expert:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to contact expert' 
    }
  }
}

/**
 * Get enhanced conversations for the current user
 */
export async function getEnhancedConversations(options?: {
  status?: ConversationStatus
  type?: ConversationType
  limit?: number
}): Promise<{
  success: boolean
  data?: ConversationWithParticipants[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const conversations = await getEnhancedConversationsForUser(supabase, user.id, options)
    return { success: true, data: conversations }
  } catch (error) {
    console.error('Failed to get enhanced conversations:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get conversations' 
    }
  }
}

/**
 * Get total unread message count for the current user
 */
export async function getUnreadCount(): Promise<{
  success: boolean
  count?: number
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const count = await getUnreadCountForUser(supabase, user.id)
    return { success: true, count }
  } catch (error) {
    console.error('Failed to get unread count:', error)
    return { success: false, count: 0, error: 'Failed to get unread count' }
  }
}

/**
 * Mark a conversation as read using the enhanced method
 */
export async function markConversationAsReadEnhanced(
  conversationId: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    await markConversationAsRead(supabase, conversationId, user.id)
    
    return { success: true }
  } catch (error) {
    console.error('Failed to mark conversation as read:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to mark as read' 
    }
  }
}

/**
 * Search conversations
 */
export async function searchConversations(
  query: string,
  limit = 20
): Promise<{
  success: boolean
  data?: ConversationWithParticipants[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    if (!query.trim()) {
      return { success: true, data: [] }
    }

    const conversations = await searchConvs(supabase, user.id, query.trim(), limit)
    return { success: true, data: conversations }
  } catch (error) {
    console.error('Failed to search conversations:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to search' 
    }
  }
}

/**
 * Toggle mute status for a conversation
 */
export async function toggleConversationMute(
  conversationId: string
): Promise<{
  success: boolean
  isMuted?: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const isMuted = await toggleMute(supabase, conversationId, user.id)
    
    return { success: true, isMuted }
  } catch (error) {
    console.error('Failed to toggle mute:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to toggle mute' 
    }
  }
}

/**
 * Get participants of a conversation
 */
export async function getParticipants(
  conversationId: string
): Promise<{
  success: boolean
  data?: Array<{
    id: string
    profile_id: string
    full_name: string | null
    avatar_url: string | null
    role?: string | null
  }>
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    const participants = await getConversationParticipants(supabase, conversationId)
    
    const data = participants.map(p => ({
      id: p.id,
      profile_id: p.profile_id,
      full_name: p.profile?.full_name || null,
      avatar_url: p.profile?.avatar_url || null,
      role: p.profile?.role
    }))

    return { success: true, data }
  } catch (error) {
    console.error('Failed to get participants:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get participants' 
    }
  }
}
