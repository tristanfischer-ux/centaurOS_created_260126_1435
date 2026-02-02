'use server'

import { createClient } from '@/lib/supabase/server'

export interface ThreadMessage {
  id: string
  content: string
  created_at: string
  sender_id: string
  parent_message_id: string | null
  reply_count: number
  sender: {
    id: string
    full_name: string | null
    avatar_url: string | null
  } | null
}

export interface ThreadSummary {
  parent_message: ThreadMessage
  replies: ThreadMessage[]
  reply_count: number
}

/**
 * Get a thread with all its replies
 * 
 * @description Fetches the parent message and all its replies
 * for displaying in the thread panel.
 * 
 * @param parentMessageId - ID of the parent message
 * @returns Thread summary with parent and replies
 * 
 * @security User must be a participant in the conversation
 */
export async function getThread(
  parentMessageId: string
): Promise<{ success: boolean; error?: string; data?: ThreadSummary }> {
  try {
    const supabase = await createClient()
    
    // AUTH: Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Fetch parent message
    const { data: parentMessage, error: parentError } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        created_at,
        sender_id,
        parent_message_id,
        reply_count,
        conversation_id,
        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)
      `)
      .eq('id', parentMessageId)
      .single()
    
    if (parentError || !parentMessage) {
      return { success: false, error: 'Parent message not found' }
    }
    
    // AUTH: Verify user is a participant in the conversation
    const { data: participant, error: participantError } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', parentMessage.conversation_id)
      .eq('profile_id', user.id)
      .single()
    
    if (participantError || !participant) {
      return { success: false, error: 'Not a participant of this conversation' }
    }
    
    // Fetch all replies
    const { data: replies, error: repliesError } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        created_at,
        sender_id,
        parent_message_id,
        reply_count,
        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)
      `)
      .eq('parent_message_id', parentMessageId)
      .order('created_at', { ascending: true })
    
    if (repliesError) {
      console.error('Error fetching replies:', repliesError)
      return { success: false, error: 'Failed to fetch replies' }
    }
    
    return {
      success: true,
      data: {
        parent_message: parentMessage as ThreadMessage,
        replies: (replies || []) as ThreadMessage[],
        reply_count: parentMessage.reply_count || 0,
      },
    }
  } catch (error) {
    console.error('Error in getThread:', error)
    return { success: false, error: 'Failed to fetch thread' }
  }
}

/**
 * Send a reply to a thread
 * 
 * @description Creates a new message as a reply to a parent message.
 * Automatically increments reply_count via database trigger.
 * 
 * @param parentMessageId - ID of the parent message
 * @param content - Reply message content
 * @returns The created reply message
 * 
 * @security User must be a participant in the conversation
 */
export async function sendThreadReply(
  parentMessageId: string,
  content: string
): Promise<{ success: boolean; error?: string; data?: ThreadMessage }> {
  try {
    const supabase = await createClient()
    
    // AUTH: Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // VALIDATION: Check content is not empty
    if (!content || content.trim().length === 0) {
      return { success: false, error: 'Reply content cannot be empty' }
    }
    
    // Get parent message to find conversation
    const { data: parentMessage, error: parentError } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('id', parentMessageId)
      .single()
    
    if (parentError || !parentMessage) {
      return { success: false, error: 'Parent message not found' }
    }
    
    // AUTH: Verify user is a participant
    const { data: participant, error: participantError } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', parentMessage.conversation_id)
      .eq('profile_id', user.id)
      .single()
    
    if (participantError || !participant) {
      return { success: false, error: 'Not a participant of this conversation' }
    }
    
    // Create reply message
    const { data: reply, error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: parentMessage.conversation_id,
        sender_id: user.id,
        content: content.trim(),
        parent_message_id: parentMessageId,
      })
      .select(`
        id,
        content,
        created_at,
        sender_id,
        parent_message_id,
        reply_count,
        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)
      `)
      .single()
    
    if (insertError) {
      console.error('Error creating reply:', insertError)
      return { success: false, error: 'Failed to create reply' }
    }
    
    return { success: true, data: reply as ThreadMessage }
  } catch (error) {
    console.error('Error in sendThreadReply:', error)
    return { success: false, error: 'Failed to send reply' }
  }
}

/**
 * Get reply count for multiple messages (batch)
 * 
 * @description Fetches reply counts for multiple messages efficiently
 * for displaying thread indicators in message lists.
 * 
 * @param messageIds - Array of message IDs
 * @returns Map of message ID to reply count
 */
export async function getBatchReplyCounts(
  messageIds: string[]
): Promise<{ success: boolean; error?: string; data?: Record<string, number> }> {
  try {
    if (messageIds.length === 0) {
      return { success: true, data: {} }
    }
    
    const supabase = await createClient()
    
    // AUTH: Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, reply_count')
      .in('id', messageIds)
    
    if (error) {
      console.error('Error fetching reply counts:', error)
      return { success: false, error: 'Failed to fetch reply counts' }
    }
    
    // Convert to map
    const result: Record<string, number> = {}
    for (const msg of messages || []) {
      result[msg.id] = msg.reply_count || 0
    }
    
    // Initialize 0 for messages without replies
    for (const id of messageIds) {
      if (!(id in result)) {
        result[id] = 0
      }
    }
    
    return { success: true, data: result }
  } catch (error) {
    console.error('Error in getBatchReplyCounts:', error)
    return { success: false, error: 'Failed to fetch reply counts' }
  }
}
