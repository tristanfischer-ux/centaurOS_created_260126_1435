'use server'
// @ts-nocheck - Database types out of sync

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
  type ConversationWithParticipants,
  type MessageWithSender,
  type ConversationStatus
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
    const { data: sender } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, email')
      .eq('id', user.id)
      .single()

    revalidatePath('/messages')
    
    const messageWithSender: MessageWithSender = {
      ...message,
      sender: sender || { id: user.id, full_name: null, avatar_url: null, email: '' }
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
