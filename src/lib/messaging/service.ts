import type { SupabaseClient } from '@supabase/supabase-js'

// Note: The messaging tables (conversations, messages) are defined in the migration
// but not yet in the generated types. We use generic Supabase client methods with
// explicit typing until types are regenerated.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>

// Types for messaging system
export type MessageType = 'text' | 'file' | 'system'
export type ConversationStatus = 'active' | 'archived' | 'reported'
export type ConversationType = 'direct' | 'task' | 'objective' | 'expert' | 'marketplace'

export interface Conversation {
  id: string
  order_id: string | null
  rfq_id: string | null
  listing_id: string | null
  buyer_id: string | null
  seller_id: string | null
  status: ConversationStatus
  created_at: string
  updated_at: string
  // New fields for enhanced messaging
  conversation_type: ConversationType
  task_id: string | null
  objective_id: string | null
  title: string | null
  is_group: boolean
  creator_id: string | null
}

export interface ConversationParticipant {
  id: string
  conversation_id: string
  profile_id: string
  joined_at: string
  last_read_at: string | null
  is_muted: boolean
  profile?: {
    id: string
    full_name: string | null
    avatar_url: string | null
    email: string
    role?: string | null
  }
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
  } | null
  seller: {
    id: string
    full_name: string | null
    avatar_url: string | null
    email: string
  } | null
  last_message?: Message | null
  unread_count?: number
  // Enhanced fields
  participants?: ConversationParticipant[]
  task?: {
    id: string
    title: string
    task_number: number
    status: string
  } | null
  objective?: {
    id: string
    title: string
  } | null
  listing?: {
    id: string
    title: string
    category: string
  } | null
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

// New enhanced conversation creation params
export interface CreateDirectConversationParams {
  creatorId: string
  participantId: string
}

export interface CreateTaskConversationParams {
  creatorId: string
  taskId: string
  taskTitle: string
  taskNumber: number
  participantIds: string[]
}

export interface CreateObjectiveConversationParams {
  creatorId: string
  objectiveId: string
  objectiveTitle: string
  participantIds: string[]
}

export interface CreateExpertConversationParams {
  creatorId: string
  expertUserId: string
  listingId?: string
  listingTitle?: string
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

// ============================================================================
// ENHANCED MESSAGING FUNCTIONS
// ============================================================================

/**
 * Create a direct message conversation between two users
 */
export async function createDirectConversation(
  supabase: AnySupabaseClient,
  params: CreateDirectConversationParams
): Promise<Conversation> {
  const { creatorId, participantId } = params

  // Check if DM already exists between these users (in either direction)
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('conversation_type', 'direct')
    .eq('status', 'active')
    .or(`and(buyer_id.eq.${creatorId},seller_id.eq.${participantId}),and(buyer_id.eq.${participantId},seller_id.eq.${creatorId})`)
    .maybeSingle()

  if (existing) {
    return existing as Conversation
  }

  // Also check via participants table
  const { data: existingViaParticipants } = await supabase
    .from('conversations')
    .select(`
      *,
      conversation_participants!inner(profile_id)
    `)
    .eq('conversation_type', 'direct')
    .eq('status', 'active')
    .eq('is_group', false)

  // Filter to find conversation with exactly these two participants
  const dmConv = existingViaParticipants?.find(conv => {
    const participantIds = conv.conversation_participants?.map((p: { profile_id: string }) => p.profile_id) || []
    return participantIds.length === 2 && 
           participantIds.includes(creatorId) && 
           participantIds.includes(participantId)
  })

  if (dmConv) {
    return dmConv as Conversation
  }

  // Create new DM conversation
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      conversation_type: 'direct',
      creator_id: creatorId,
      buyer_id: creatorId,
      seller_id: participantId,
      is_group: false,
      status: 'active'
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create direct conversation: ${error.message}`)
  }

  // Add participant (creator is auto-added by trigger, but add explicitly for safety)
  await addParticipantToConversation(supabase, data.id, participantId)

  return data as Conversation
}

/**
 * Create a task discussion channel
 */
export async function createTaskConversation(
  supabase: AnySupabaseClient,
  params: CreateTaskConversationParams
): Promise<Conversation> {
  const { creatorId, taskId, taskTitle, taskNumber, participantIds } = params

  // Check if conversation already exists for this task
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('conversation_type', 'task')
    .eq('task_id', taskId)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) {
    // Add any missing participants
    for (const participantId of participantIds) {
      await addParticipantToConversation(supabase, existing.id, participantId)
    }
    return existing as Conversation
  }

  // Create new task conversation
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      conversation_type: 'task',
      task_id: taskId,
      title: `#${taskNumber}: ${taskTitle}`,
      creator_id: creatorId,
      is_group: true,
      status: 'active'
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create task conversation: ${error.message}`)
  }

  // Add all participants
  for (const participantId of participantIds) {
    await addParticipantToConversation(supabase, data.id, participantId)
  }

  return data as Conversation
}

/**
 * Create an objective discussion channel
 */
export async function createObjectiveConversation(
  supabase: AnySupabaseClient,
  params: CreateObjectiveConversationParams
): Promise<Conversation> {
  const { creatorId, objectiveId, objectiveTitle, participantIds } = params

  // Check if conversation already exists for this objective
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('conversation_type', 'objective')
    .eq('objective_id', objectiveId)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) {
    // Add any missing participants
    for (const participantId of participantIds) {
      await addParticipantToConversation(supabase, existing.id, participantId)
    }
    return existing as Conversation
  }

  // Create new objective conversation
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      conversation_type: 'objective',
      objective_id: objectiveId,
      title: `Objective: ${objectiveTitle}`,
      creator_id: creatorId,
      is_group: true,
      status: 'active'
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create objective conversation: ${error.message}`)
  }

  // Add all participants
  for (const participantId of participantIds) {
    await addParticipantToConversation(supabase, data.id, participantId)
  }

  return data as Conversation
}

/**
 * Create an expert consultation conversation
 */
export async function createExpertConversation(
  supabase: AnySupabaseClient,
  params: CreateExpertConversationParams
): Promise<Conversation> {
  const { creatorId, expertUserId, listingId, listingTitle } = params

  // Check if conversation already exists with this expert (optionally for this listing)
  let existingQuery = supabase
    .from('conversations')
    .select('*')
    .eq('conversation_type', 'expert')
    .eq('buyer_id', creatorId)
    .eq('seller_id', expertUserId)
    .eq('status', 'active')

  if (listingId) {
    existingQuery = existingQuery.eq('listing_id', listingId)
  }

  const { data: existing } = await existingQuery.maybeSingle()

  if (existing) {
    return existing as Conversation
  }

  // Create new expert conversation
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      conversation_type: 'expert',
      listing_id: listingId || null,
      buyer_id: creatorId,
      seller_id: expertUserId,
      title: listingTitle ? `Expert: ${listingTitle}` : null,
      creator_id: creatorId,
      is_group: false,
      status: 'active'
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create expert conversation: ${error.message}`)
  }

  return data as Conversation
}

/**
 * Add a participant to a conversation
 */
export async function addParticipantToConversation(
  supabase: AnySupabaseClient,
  conversationId: string,
  profileId: string
): Promise<ConversationParticipant> {
  const { data, error } = await supabase
    .from('conversation_participants')
    .upsert({
      conversation_id: conversationId,
      profile_id: profileId,
      joined_at: new Date().toISOString()
    }, { onConflict: 'conversation_id,profile_id' })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to add participant: ${error.message}`)
  }

  return data as ConversationParticipant
}

/**
 * Remove a participant from a conversation
 */
export async function removeParticipantFromConversation(
  supabase: AnySupabaseClient,
  conversationId: string,
  profileId: string
): Promise<void> {
  const { error } = await supabase
    .from('conversation_participants')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('profile_id', profileId)

  if (error) {
    throw new Error(`Failed to remove participant: ${error.message}`)
  }
}

/**
 * Get participants for a conversation
 */
export async function getConversationParticipants(
  supabase: AnySupabaseClient,
  conversationId: string
): Promise<ConversationParticipant[]> {
  const { data, error } = await supabase
    .from('conversation_participants')
    .select(`
      *,
      profile:profiles!conversation_participants_profile_id_fkey(id, full_name, avatar_url, email, role)
    `)
    .eq('conversation_id', conversationId)

  if (error) {
    throw new Error(`Failed to get participants: ${error.message}`)
  }

  return (data || []) as unknown as ConversationParticipant[]
}

/**
 * Get all conversations for a user with enhanced details
 */
export async function getEnhancedConversationsForUser(
  supabase: AnySupabaseClient,
  userId: string,
  options?: {
    status?: ConversationStatus
    type?: ConversationType
    limit?: number
  }
): Promise<ConversationWithParticipants[]> {
  const { status, type, limit = 50 } = options || {}

  // Get conversations where user is a participant
  let query = supabase
    .from('conversations')
    .select(`
      *,
      buyer:profiles!conversations_buyer_id_fkey(id, full_name, avatar_url, email),
      seller:profiles!conversations_seller_id_fkey(id, full_name, avatar_url, email),
      task:tasks!conversations_task_id_fkey(id, title, task_number, status),
      objective:objectives!conversations_objective_id_fkey(id, title),
      listing:marketplace_listings!conversations_listing_id_fkey(id, title, category),
      conversation_participants!inner(profile_id, last_read_at)
    `)
    .eq('conversation_participants.profile_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (status) {
    query = query.eq('status', status)
  }

  if (type) {
    query = query.eq('conversation_type', type)
  }

  const { data, error } = await query

  if (error) {
    // Fallback to legacy query if joins fail
    console.warn('Enhanced query failed, falling back:', error.message)
    return getConversationsForUser(supabase, userId, status)
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

      // Get unread count using participant's last_read_at
      const participantRecord = conv.conversation_participants?.[0]
      const lastReadAt = participantRecord?.last_read_at

      let unreadCount = 0
      if (lastReadAt) {
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', userId)
          .gt('created_at', lastReadAt)

        unreadCount = count || 0
      } else {
        // No last_read_at means all messages are unread
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', userId)

        unreadCount = count || 0
      }

      return {
        ...conv,
        last_message: lastMessage as Message | null,
        unread_count: unreadCount
      } as ConversationWithParticipants
    })
  )

  return conversationsWithMeta
}

/**
 * Get total unread message count for a user
 */
export async function getUnreadCountForUser(
  supabase: AnySupabaseClient,
  userId: string
): Promise<number> {
  // Use the database function for efficiency
  const { data, error } = await supabase
    .rpc('get_unread_message_count', { user_id: userId })

  if (error) {
    console.error('Failed to get unread count:', error)
    return 0
  }

  return data || 0
}

/**
 * Mark a conversation as read for a user
 */
export async function markConversationAsRead(
  supabase: AnySupabaseClient,
  conversationId: string,
  userId: string
): Promise<void> {
  // Use the database function
  const { error } = await supabase
    .rpc('mark_conversation_read', { 
      conv_id: conversationId, 
      user_id: userId 
    })

  if (error) {
    throw new Error(`Failed to mark conversation as read: ${error.message}`)
  }
}

/**
 * Toggle mute status for a conversation
 */
export async function toggleConversationMute(
  supabase: AnySupabaseClient,
  conversationId: string,
  userId: string
): Promise<boolean> {
  // Get current mute status
  const { data: current } = await supabase
    .from('conversation_participants')
    .select('is_muted')
    .eq('conversation_id', conversationId)
    .eq('profile_id', userId)
    .single()

  const newMuteStatus = !current?.is_muted

  const { error } = await supabase
    .from('conversation_participants')
    .update({ is_muted: newMuteStatus })
    .eq('conversation_id', conversationId)
    .eq('profile_id', userId)

  if (error) {
    throw new Error(`Failed to toggle mute: ${error.message}`)
  }

  return newMuteStatus
}

/**
 * Search conversations by title, participant name, or message content
 */
export async function searchConversations(
  supabase: AnySupabaseClient,
  userId: string,
  searchQuery: string,
  limit = 20
): Promise<ConversationWithParticipants[]> {
  const searchPattern = `%${searchQuery}%`

  // Search by title
  const { data: byTitle } = await supabase
    .from('conversations')
    .select(`
      *,
      buyer:profiles!conversations_buyer_id_fkey(id, full_name, avatar_url, email),
      seller:profiles!conversations_seller_id_fkey(id, full_name, avatar_url, email),
      conversation_participants!inner(profile_id)
    `)
    .eq('conversation_participants.profile_id', userId)
    .ilike('title', searchPattern)
    .eq('status', 'active')
    .limit(limit)

  return (byTitle || []) as unknown as ConversationWithParticipants[]
}
