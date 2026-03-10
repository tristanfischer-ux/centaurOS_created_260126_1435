'use server'

import { createClient } from '@/lib/supabase/server'

export interface MessageReaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
  user?: {
    id: string
    full_name: string | null
  }
}

export interface ReactionGroup {
  emoji: string
  count: number
  users: { id: string; full_name: string | null }[]
  hasReacted: boolean
}

// Type for raw reaction data from database
interface RawReaction {
  message_id: string
  emoji: string
  user_id: string
  user: { id: string; full_name: string | null } | null
}

/**
 * Add a reaction to a message
 */
export async function addReaction(
  messageId: string,
  emoji: string
): Promise<{ success: boolean; error?: string; data?: MessageReaction }> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Verify user has access to the message's conversation
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('id', messageId)
      .single()
    
    if (msgError || !message) {
      return { success: false, error: 'Message not found' }
    }
    
    const { data: participant, error: participantError } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', message.conversation_id)
      .eq('profile_id', user.id)
      .single()
    
    if (participantError || !participant) {
      return { success: false, error: 'Not a participant of this conversation' }
    }
    
    // Add reaction (upsert to handle duplicates)
    const { data: reaction, error: insertError } = await supabase
      .from('message_reactions')
      .upsert({
        message_id: messageId,
        user_id: user.id,
        emoji
      }, {
        onConflict: 'message_id,user_id,emoji'
      })
      .select()
      .single()
    
    if (insertError) {
      console.error('Error adding reaction:', insertError)
      return { success: false, error: 'Failed to add reaction' }
    }
    
    return { success: true, data: reaction as MessageReaction }
  } catch (error) {
    console.error('Error in addReaction:', error)
    return { success: false, error: 'Failed to add reaction' }
  }
}

/**
 * Remove a reaction from a message
 */
export async function removeReaction(
  messageId: string,
  emoji: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    const { error: deleteError } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
    
    if (deleteError) {
      console.error('Error removing reaction:', deleteError)
      return { success: false, error: 'Failed to remove reaction' }
    }
    
    return { success: true }
  } catch (error) {
    console.error('Error in removeReaction:', error)
    return { success: false, error: 'Failed to remove reaction' }
  }
}

/**
 * Toggle a reaction (add if not present, remove if present)
 */
export async function toggleReaction(
  messageId: string,
  emoji: string
): Promise<{ success: boolean; error?: string; added?: boolean }> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Check if reaction exists
    const { data: existing } = await supabase
      .from('message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
      .single()
    
    if (existing) {
      // Remove
      const result = await removeReaction(messageId, emoji)
      return { ...result, added: false }
    } else {
      // Add
      const result = await addReaction(messageId, emoji)
      return { success: result.success, error: result.error, added: true }
    }
  } catch (error) {
    console.error('Error in toggleReaction:', error)
    return { success: false, error: 'Failed to toggle reaction' }
  }
}

/**
 * Get all reactions for a message, grouped by emoji
 */
export async function getMessageReactions(
  messageId: string
): Promise<{ success: boolean; error?: string; data?: ReactionGroup[] }> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    const { data: reactions, error } = await supabase
      .from('message_reactions')
      .select(`
        emoji,
        user_id,
        user:profiles!message_reactions_user_id_fkey(id, full_name)
      `)
      .eq('message_id', messageId)
    
    if (error) {
      console.error('Error fetching reactions:', error)
      return { success: false, error: 'Failed to fetch reactions' }
    }
    
    // Group by emoji
    const groups = new Map<string, ReactionGroup>()
    
    for (const reaction of (reactions || []) as RawReaction[]) {
      const existing = groups.get(reaction.emoji)
      const userInfo = { 
        id: reaction.user_id, 
        full_name: reaction.user?.full_name || null 
      }
      
      if (existing) {
        existing.count++
        existing.users.push(userInfo)
        if (reaction.user_id === user.id) {
          existing.hasReacted = true
        }
      } else {
        groups.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: 1,
          users: [userInfo],
          hasReacted: reaction.user_id === user.id
        })
      }
    }
    
    return { success: true, data: Array.from(groups.values()) }
  } catch (error) {
    console.error('Error in getMessageReactions:', error)
    return { success: false, error: 'Failed to fetch reactions' }
  }
}

/**
 * Get reactions for multiple messages (batch for efficiency)
 */
export async function getBatchMessageReactions(
  messageIds: string[]
): Promise<{ success: boolean; error?: string; data?: Record<string, ReactionGroup[]> }> {
  try {
    if (messageIds.length === 0) {
      return { success: true, data: {} }
    }
    if (messageIds.length > 100) {
      return { success: false, error: 'Too many message IDs (max 100)' }
    }

    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    const { data: reactions, error } = await supabase
      .from('message_reactions')
      .select(`
        message_id,
        emoji,
        user_id,
        user:profiles!message_reactions_user_id_fkey(id, full_name)
      `)
      .in('message_id', messageIds)
    
    if (error) {
      console.error('Error fetching batch reactions:', error)
      return { success: false, error: 'Failed to fetch reactions' }
    }
    
    // Group by message_id, then by emoji
    const result: Record<string, ReactionGroup[]> = {}
    
    for (const reaction of (reactions || []) as (RawReaction & { message_id: string })[]) {
      if (!result[reaction.message_id]) {
        result[reaction.message_id] = []
      }
      
      const groups = result[reaction.message_id]
      const existing = groups.find(g => g.emoji === reaction.emoji)
      const userInfo = { 
        id: reaction.user_id, 
        full_name: reaction.user?.full_name || null 
      }
      
      if (existing) {
        existing.count++
        existing.users.push(userInfo)
        if (reaction.user_id === user.id) {
          existing.hasReacted = true
        }
      } else {
        groups.push({
          emoji: reaction.emoji,
          count: 1,
          users: [userInfo],
          hasReacted: reaction.user_id === user.id
        })
      }
    }
    
    // Initialize empty arrays for messages without reactions
    for (const id of messageIds) {
      if (!result[id]) {
        result[id] = []
      }
    }
    
    return { success: true, data: result }
  } catch (error) {
    console.error('Error in getBatchMessageReactions:', error)
    return { success: false, error: 'Failed to fetch reactions' }
  }
}
