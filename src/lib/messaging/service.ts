import type { SupabaseClient } from '@supabase/supabase-js'

// Note: The messaging tables (conversations, messages) are defined in the migration
// but not yet in the generated types. We use generic Supabase client methods with
// explicit typing until types are regenerated.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>

// Types for messaging system
export type MessageType = 'text' | 'file' | 'system'
export type ConversationStatus = 'active' | 'archived' | 'reported'

export interface Conversation {
  id: string
  order_id: string | null
  rfq_id: string | null
  listing_id: string | null
  buyer_id: string
  seller_id: string
  status: ConversationStatus
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  message_type: MessageType
  file_url: string | null
  is_read: boolean
  created_at: string
}

export interface ConversationWithParticipants extends Conversation {
  buyer: {
    id: string
    full_name: string | null
    avatar_url: string | null
    email: string
  }
  seller: {
    id: string
    full_name: string | null
    avatar_url: string | null
    email: string
  }
  last_message?: Message | null
  unread_count?: number
}

export interface MessageWithSender extends Message {
  sender: {
    id: string
    full_name: string | null
    avatar_url: string | null
    email: string
    role?: string | null
  }
}

export interface CreateConversationParams {
  buyerId: string
  sellerId: string
  orderId?: string
  rfqId?: string
  listingId?: string
}

export interface SendMessageParams {
  conversationId: string
  senderId: string
  content: string
  messageType?: MessageType
  fileUrl?: string
}

/**
 * Create a new conversation between buyer and seller
 */
export async function createConversation(
  supabase: AnySupabaseClient,
  params: CreateConversationParams
): Promise<Conversation> {
  const { buyerId, sellerId, orderId, rfqId, listingId } = params

  // Check if conversation already exists for this context
  let existingQuery = supabase
    .from('conversations')
    .select('*')
    .eq('buyer_id', buyerId)
    .eq('seller_id', sellerId)
    .eq('status', 'active')

  if (orderId) {
    existingQuery = existingQuery.eq('order_id', orderId)
  } else if (rfqId) {
    existingQuery = existingQuery.eq('rfq_id', rfqId)
  } else if (listingId) {
    existingQuery = existingQuery.eq('listing_id', listingId)
  }

  const { data: existing } = await existingQuery.maybeSingle()

  if (existing) {
    return existing as Conversation
  }

  // Create new conversation
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      buyer_id: buyerId,
      seller_id: sellerId,
      order_id: orderId || null,
      rfq_id: rfqId || null,
      listing_id: listingId || null,
      status: 'active'
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create conversation: ${error.message}`)
  }

  return data as Conversation
}

/**
 * Send a message in a conversation
 */
export async function sendMessage(
  supabase: AnySupabaseClient,
  params: SendMessageParams
): Promise<Message> {
  const { conversationId, senderId, content, messageType = 'text', fileUrl } = params

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      message_type: messageType,
      file_url: fileUrl || null,
      is_read: false
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to send message: ${error.message}`)
  }

  return data as Message
}

/**
 * Send a system message for audit trail
 */
export async function sendSystemMessage(
  supabase: AnySupabaseClient,
  conversationId: string,
  content: string
): Promise<Message> {
  // Get the conversation to find a participant to use as system sender
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('buyer_id')
    .eq('id', conversationId)
    .single()

  if (convError || !conversation) {
    throw new Error('Conversation not found')
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: conversation.buyer_id, // System messages attributed to buyer for RLS
      content,
      message_type: 'system',
      is_read: false
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to send system message: ${error.message}`)
  }

  return data as Message
}

/**
 * Mark all messages in a conversation as read for a user
 */
export async function markAsRead(
  supabase: AnySupabaseClient,
  conversationId: string,
  userId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .eq('is_read', false)
    .select('id')

  if (error) {
    throw new Error(`Failed to mark messages as read: ${error.message}`)
  }

  return data?.length || 0
}

/**
 * Get a single conversation with full details
 */
export async function getConversation(
  supabase: AnySupabaseClient,
  conversationId: string
): Promise<ConversationWithParticipants | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      buyer:profiles!conversations_buyer_id_fkey(id, full_name, avatar_url, email),
      seller:profiles!conversations_seller_id_fkey(id, full_name, avatar_url, email)
    `)
    .eq('id', conversationId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Failed to get conversation: ${error.message}`)
  }

  return data as unknown as ConversationWithParticipants
}

/**
 * Get all conversations for a user
 */
export async function getConversationsForUser(
  supabase: AnySupabaseClient,
  userId: string,
  status?: ConversationStatus
): Promise<ConversationWithParticipants[]> {
  let query = supabase
    .from('conversations')
    .select(`
      *,
      buyer:profiles!conversations_buyer_id_fkey(id, full_name, avatar_url, email),
      seller:profiles!conversations_seller_id_fkey(id, full_name, avatar_url, email)
    `)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('updated_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to get conversations: ${error.message}`)
  }

  // Get last message and unread count for each conversation
  const conversationsWithMeta = await Promise.all(
    (data || []).map(async (conv) => {
      // Get last message
      const { data: lastMessage } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Get unread count
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .neq('sender_id', userId)
        .eq('is_read', false)

      return {
        ...conv,
        last_message: lastMessage as Message | null,
        unread_count: count || 0
      } as ConversationWithParticipants
    })
  )

  return conversationsWithMeta
}

/**
 * Get messages for a conversation
 */
export async function getMessages(
  supabase: AnySupabaseClient,
  conversationId: string,
  limit = 50,
  before?: string
): Promise<MessageWithSender[]> {
  let query = supabase
    .from('messages')
    .select(`
      *,
      sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url, email)
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to get messages: ${error.message}`)
  }

  // Return in ascending order for display
  return (data || []).reverse() as unknown as MessageWithSender[]
}

/**
 * Archive a conversation
 */
export async function archiveConversation(
  supabase: AnySupabaseClient,
  conversationId: string
): Promise<Conversation> {
  const { data, error } = await supabase
    .from('conversations')
    .update({ status: 'archived' })
    .eq('id', conversationId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to archive conversation: ${error.message}`)
  }

  return data as Conversation
}

/**
 * Unarchive a conversation
 */
export async function unarchiveConversation(
  supabase: AnySupabaseClient,
  conversationId: string
): Promise<Conversation> {
  const { data, error } = await supabase
    .from('conversations')
    .update({ status: 'active' })
    .eq('id', conversationId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to unarchive conversation: ${error.message}`)
  }

  return data as Conversation
}
