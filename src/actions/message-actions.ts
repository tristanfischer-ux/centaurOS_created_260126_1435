'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Toggle star status on a message
 */
export async function toggleStarMessage(
  messageId: string
): Promise<{ success: boolean; error?: string; starred?: boolean }> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Check if already starred
    const { data: existing, error: checkError } = await supabase
      .from('message_stars')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .single()
    
    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 is "no rows returned" which is expected
      console.error('Error checking star status:', checkError)
      return { success: false, error: 'Failed to check star status' }
    }
    
    if (existing) {
      // Unstar
      const { error: deleteError } = await supabase
        .from('message_stars')
        .delete()
        .eq('id', existing.id)
      
      if (deleteError) {
        console.error('Error removing star:', deleteError)
        return { success: false, error: 'Failed to remove star' }
      }
      
      return { success: true, starred: false }
    } else {
      // Star
      const { error: insertError } = await supabase
        .from('message_stars')
        .insert({
          message_id: messageId,
          user_id: user.id,
        })
      
      if (insertError) {
        console.error('Error adding star:', insertError)
        return { success: false, error: 'Failed to add star' }
      }
      
      return { success: true, starred: true }
    }
  } catch (error) {
    console.error('Error in toggleStarMessage:', error)
    return { success: false, error: 'Failed to toggle star' }
  }
}

/**
 * Toggle pin status on a message
 */
export async function togglePinMessage(
  messageId: string,
  conversationId: string
): Promise<{ success: boolean; error?: string; pinned?: boolean }> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Verify user is a participant
    const { data: participant, error: participantError } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('profile_id', user.id)
      .single()
    
    if (participantError || !participant) {
      return { success: false, error: 'Not a participant of this conversation' }
    }
    
    // Check if already pinned
    const { data: existing, error: checkError } = await supabase
      .from('pinned_messages')
      .select('id, pinned_by')
      .eq('message_id', messageId)
      .eq('conversation_id', conversationId)
      .single()
    
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking pin status:', checkError)
      return { success: false, error: 'Failed to check pin status' }
    }
    
    if (existing) {
      // Unpin - user can unpin their own or Executives can unpin any
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      
      const canUnpin = existing.pinned_by === user.id || profile?.role === 'Executive'
      
      if (!canUnpin) {
        return { success: false, error: 'You can only unpin messages you pinned' }
      }
      
      const { error: deleteError } = await supabase
        .from('pinned_messages')
        .delete()
        .eq('id', existing.id)
      
      if (deleteError) {
        console.error('Error removing pin:', deleteError)
        return { success: false, error: 'Failed to remove pin' }
      }
      
      return { success: true, pinned: false }
    } else {
      // Pin
      const { error: insertError } = await supabase
        .from('pinned_messages')
        .insert({
          message_id: messageId,
          conversation_id: conversationId,
          pinned_by: user.id,
        })
      
      if (insertError) {
        console.error('Error adding pin:', insertError)
        return { success: false, error: 'Failed to pin message' }
      }
      
      return { success: true, pinned: true }
    }
  } catch (error) {
    console.error('Error in togglePinMessage:', error)
    return { success: false, error: 'Failed to toggle pin' }
  }
}

/**
 * Mark a conversation as unread
 */
export async function markConversationUnread(
  conversationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Update the conversation_participants last_read_at to an older timestamp
    // This makes the conversation appear unread
    const { error: updateError } = await supabase
      .from('conversation_participants')
      .update({
        last_read_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24 hours ago
      })
      .eq('conversation_id', conversationId)
      .eq('profile_id', user.id)
    
    if (updateError) {
      console.error('Error marking conversation unread:', updateError)
      return { success: false, error: 'Failed to mark as unread' }
    }
    
    return { success: true }
  } catch (error) {
    console.error('Error in markConversationUnread:', error)
    return { success: false, error: 'Failed to mark as unread' }
  }
}

/**
 * Get starred messages for current user
 */
export async function getStarredMessages(
  conversationId?: string
): Promise<{ success: boolean; error?: string; data?: string[] }> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    let query = supabase
      .from('message_stars')
      .select('message_id')
      .eq('user_id', user.id)
    
    if (conversationId) {
      // Join with messages to filter by conversation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query = supabase
        .from('message_stars')
        .select(`
          message_id,
          message:messages!message_stars_message_id_fkey(conversation_id)
        `)
        .eq('user_id', user.id) as any
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Error fetching starred messages:', error)
      return { success: false, error: 'Failed to fetch starred messages' }
    }
    
    // Extract message IDs
    const messageIds = data
      ?.filter(item => {
        if (conversationId && 'message' in item) {
          const msg = item.message as { conversation_id: string } | null
          return msg?.conversation_id === conversationId
        }
        return true
      })
      .map(item => item.message_id) || []
    
    return { success: true, data: messageIds }
  } catch (error) {
    console.error('Error in getStarredMessages:', error)
    return { success: false, error: 'Failed to fetch starred messages' }
  }
}

/**
 * Get pinned messages for a conversation
 */
export async function getPinnedMessages(
  conversationId: string
): Promise<{ success: boolean; error?: string; data?: string[] }> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Verify user is a participant
    const { data: participant, error: participantError } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('profile_id', user.id)
      .single()
    
    if (participantError || !participant) {
      return { success: false, error: 'Not a participant of this conversation' }
    }
    
    const { data, error } = await supabase
      .from('pinned_messages')
      .select('message_id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching pinned messages:', error)
      return { success: false, error: 'Failed to fetch pinned messages' }
    }
    
    const messageIds = data?.map(item => item.message_id) || []
    
    return { success: true, data: messageIds }
  } catch (error) {
    console.error('Error in getPinnedMessages:', error)
    return { success: false, error: 'Failed to fetch pinned messages' }
  }
}
