'use server'

import { createClient } from '@/lib/supabase/server'

export interface ThreadMessage {
  id: string
  content: string
  sender_id: string
  sender: {
    id: string
    full_name: string | null
    avatar_url: string | null
    role: string | null
  } | null
  created_at: string
  reply_count: number
}

export interface ThreadReply {
  id: string
  content: string
  sender_id: string
  sender: {
    id: string
    full_name: string | null
    avatar_url: string | null
    role: string | null
  } | null
  created_at: string
  parent_message_id: string
}

/**
 * Get thread replies for a parent message
 */
export async function getThreadReplies(
  parentMessageId: string
): Promise<{ success: boolean; error?: string; data?: ThreadReply[] }> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Verify user has access to the parent message's conversation
    const { data: parentMessage, error: parentError } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('id', parentMessageId)
      .single()
    
    if (parentError || !parentMessage) {
      return { success: false, error: 'Parent message not found' }
    }
    
    const { data: participant, error: participantError } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', parentMessage.conversation_id)
      .eq('profile_id', user.id)
      .single()
    
    if (participantError || !participant) {
      return { success: false, error: 'Not a participant of this conversation' }
    }
    
    // Fetch thread replies
    const { data: replies, error: repliesError } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        sender_id,
        created_at,
        parent_message_id,
        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url, role)
      `)
      .eq('parent_message_id', parentMessageId)
      .order('created_at', { ascending: true })
    
    if (repliesError) {
      console.error('Error fetching thread replies:', repliesError)
      return { success: false, error: 'Failed to fetch thread replies' }
    }
    
    return { success: true, data: replies as ThreadReply[] }
  } catch (error) {
    console.error('Error in getThreadReplies:', error)
    return { success: false, error: 'Failed to fetch thread replies' }
  }
}

/**
 * Send a reply in a thread
 */
export async function sendThreadReply(
  parentMessageId: string,
  content: string
): Promise<{ success: boolean; error?: string; data?: ThreadReply }> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Get parent message and conversation
    const { data: parentMessage, error: parentError } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('id', parentMessageId)
      .single()
    
    if (parentError || !parentMessage) {
      return { success: false, error: 'Parent message not found' }
    }
    
    // Verify user is a participant
    const { data: participant, error: participantError } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', parentMessage.conversation_id)
      .eq('profile_id', user.id)
      .single()
    
    if (participantError || !participant) {
      return { success: false, error: 'Not a participant of this conversation' }
    }
    
    // Create thread reply
    const { data: reply, error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: parentMessage.conversation_id,
        sender_id: user.id,
        content,
        parent_message_id: parentMessageId,
      })
      .select(`
        id,
        content,
        sender_id,
        created_at,
        parent_message_id,
        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url, role)
      `)
      .single()
    
    if (insertError) {
      console.error('Error creating thread reply:', insertError)
      return { success: false, error: 'Failed to create thread reply' }
    }
    
    // Note: reply_count and last_reply_at are auto-updated by database trigger
    
    return { success: true, data: reply as ThreadReply }
  } catch (error) {
    console.error('Error in sendThreadReply:', error)
    return { success: false, error: 'Failed to send thread reply' }
  }
}

/**
 * Get parent message with reply count
 */
export async function getThreadParent(
  messageId: string
): Promise<{ success: boolean; error?: string; data?: ThreadMessage }> {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    // AUTH: Verify user is a participant of the message's conversation
    const { data: msgCheck } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('id', messageId)
      .single()

    if (!msgCheck) {
      return { success: false, error: 'Message not found' }
    }

    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', msgCheck.conversation_id)
      .eq('profile_id', user.id)
      .single()

    if (!participant) {
      return { success: false, error: 'Access denied' }
    }

    const { data: message, error } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        sender_id,
        created_at,
        reply_count,
        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url, role)
      `)
      .eq('id', messageId)
      .single()

    if (error) {
      console.error('Error fetching thread parent:', error)
      return { success: false, error: 'Failed to fetch message' }
    }

    return { success: true, data: message as ThreadMessage }
  } catch (error) {
    console.error('Error in getThreadParent:', error)
    return { success: false, error: 'Failed to fetch message' }
  }
}

/**
 * Get reply counts for multiple messages (batch operation)
 */
export async function getBatchReplyCounts(
  messageIds: string[]
): Promise<{ success: boolean; error?: string; data?: Record<string, { count: number; lastReplyAt: string | null }> }> {
  try {
    if (messageIds.length === 0) {
      return { success: true, data: {} }
    }

    // VALIDATION: Cap batch size to prevent abuse
    if (messageIds.length > 100) {
      return { success: false, error: 'Too many message IDs (max 100)' }
    }

    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }

    // AUTH: Verify user is a participant of at least one conversation containing these messages
    const { data: userConvs } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('profile_id', user.id)

    if (!userConvs || userConvs.length === 0) {
      return { success: true, data: {} }
    }

    const userConvIds = userConvs.map(c => c.conversation_id)

    // Fetch reply counts only for messages in user's conversations
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, reply_count, last_reply_at, conversation_id')
      .in('id', messageIds)
      .in('conversation_id', userConvIds)
    
    if (error) {
      console.error('Error fetching reply counts:', error)
      return { success: false, error: 'Failed to fetch reply counts' }
    }
    
    // Build result map
    const result: Record<string, { count: number; lastReplyAt: string | null }> = {}
    for (const msg of messages || []) {
      result[msg.id] = {
        count: msg.reply_count || 0,
        lastReplyAt: msg.last_reply_at,
      }
    }
    
    return { success: true, data: result }
  } catch (error) {
    console.error('Error in getBatchReplyCounts:', error)
    return { success: false, error: 'Failed to fetch reply counts' }
  }
}
