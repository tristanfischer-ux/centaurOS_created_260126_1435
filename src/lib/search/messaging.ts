'use server'

import { createClient } from '@/lib/supabase/server'
import { parseSearchQuery, buildSearchConditions } from '@/lib/commands/search-parser'
import type { MessageWithSender } from '@/lib/messaging/service'

export interface SearchResult {
  success: boolean
  error?: string
  messages?: MessageWithSender[]
  count?: number
  summary?: string
}

/**
 * Search messages with advanced operators
 * 
 * @description Searches messages across conversations with support for
 * Slack-style operators like is:starred, from:@user, has:link, etc.
 * 
 * @param query - Search query with optional operators
 * @param foundryId - Foundry ID to search within
 * @param limit - Maximum number of results (default: 50)
 * @returns Search results with messages
 * 
 * @security Only searches conversations user is a participant in
 * 
 * @example
 * searchMessages('is:starred from:@john important', 'foundry_123')
 * // Returns starred messages from john containing "important"
 */
export async function searchMessages(
  query: string,
  foundryId: string,
  limit: number = 50
): Promise<SearchResult> {
  try {
    const supabase = await createClient()
    
    // AUTH: Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Parse search query
    const parsed = parseSearchQuery(query)
    const conditions = buildSearchConditions(parsed, user.id)
    
    // Get conversation IDs user participates in (foundry scoped)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .eq('foundry_id', foundryId)
      .single()
    
    if (!profile) {
      return { success: false, error: 'User not found in foundry' }
    }
    
    const { data: participations } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('profile_id', user.id)
    
    if (!participations || participations.length === 0) {
      return {
        success: true,
        messages: [],
        count: 0,
        summary: `No results for: ${parsed.raw}`,
      }
    }
    
    const conversationIds = participations.map(p => p.conversation_id)
    
    // Handle special filters that require separate queries
    let starredMessageIds: string[] | undefined
    let pinnedMessageIds: string[] | undefined
    
    // Get starred message IDs if is:starred filter present
    if (parsed.filters.is?.includes('starred')) {
      const { data: stars } = await supabase
        .from('message_stars')
        .select('message_id')
        .eq('user_id', user.id)
      
      starredMessageIds = stars?.map(s => s.message_id) || []
      if (starredMessageIds.length === 0) {
        return {
          success: true,
          messages: [],
          count: 0,
          summary: 'No starred messages found',
        }
      }
    }
    
    // Get pinned message IDs if is:pinned filter present
    if (parsed.filters.is?.includes('pinned')) {
      const { data: pins } = await supabase
        .from('pinned_messages')
        .select('message_id')
        .in('conversation_id', conversationIds)
      
      pinnedMessageIds = pins?.map(p => p.message_id) || []
      if (pinnedMessageIds.length === 0) {
        return {
          success: true,
          messages: [],
          count: 0,
          summary: 'No pinned messages found',
        }
      }
    }
    
    // Build base query
    let messagesQuery = supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url, email)
      `)
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    // Apply filters
    
    // Filter by starred messages
    if (starredMessageIds) {
      messagesQuery = messagesQuery.in('id', starredMessageIds)
    }
    
    // Filter by pinned messages
    if (pinnedMessageIds) {
      messagesQuery = messagesQuery.in('id', pinnedMessageIds)
    }
    
    // Filter by sender
    if (conditions.senderIds && conditions.senderIds.length > 0) {
      messagesQuery = messagesQuery.in('sender_id', conditions.senderIds)
    }
    
    // Filter by date range
    if (conditions.beforeDate) {
      messagesQuery = messagesQuery.lt('created_at', conditions.beforeDate.toISOString())
    }
    if (conditions.afterDate) {
      messagesQuery = messagesQuery.gt('created_at', conditions.afterDate.toISOString())
    }
    
    // Filter by message type
    if (conditions.hasFile) {
      messagesQuery = messagesQuery.eq('message_type', 'file')
    }
    
    // Filter by has link (contains http:// or https://)
    if (conditions.hasLink) {
      messagesQuery = messagesQuery.or('content.ilike.%http://%,content.ilike.%https://%')
    }
    
    // Filter by has thread (reply_count > 0)
    if (conditions.hasThread) {
      messagesQuery = messagesQuery.gt('reply_count', 0)
    }
    
    // Filter by keywords (full-text search on content)
    if (conditions.keywords && conditions.keywords.length > 0) {
      const keywordFilters = conditions.keywords.map(keyword => 
        `content.ilike.%${keyword}%`
      )
      messagesQuery = messagesQuery.or(keywordFilters.join(','))
    }
    
    const { data: messages, error: searchError } = await messagesQuery
    
    if (searchError) {
      console.error('Error searching messages:', searchError)
      return { success: false, error: 'Failed to search messages' }
    }
    
    // Note: has:reaction filter would require a join with message_reactions
    // For now, we'll return all results and let the client handle it
    
    return {
      success: true,
      messages: (messages || []) as MessageWithSender[],
      count: messages?.length || 0,
      summary: `Found ${messages?.length || 0} results`,
    }
  } catch (error) {
    console.error('Error in searchMessages:', error)
    return { success: false, error: 'Failed to search messages' }
  }
}

/**
 * Get search suggestions based on partial query
 * 
 * @description Provides autocomplete suggestions for search operators
 * and recent searches.
 * 
 * @param partial - Partial search query
 * @returns Array of suggested completions
 */
export function getSearchSuggestions(partial: string): string[] {
  const suggestions: string[] = []
  
  const lowerPartial = partial.toLowerCase()
  
  // Operator suggestions
  if (lowerPartial.startsWith('is:')) {
    const value = lowerPartial.slice(3)
    const isOptions = ['starred', 'pinned', 'unread', 'read']
    suggestions.push(...isOptions.filter(opt => opt.startsWith(value)).map(opt => `is:${opt}`))
  }
  
  if (lowerPartial.startsWith('has:')) {
    const value = lowerPartial.slice(4)
    const hasOptions = ['link', 'file', 'reaction', 'thread']
    suggestions.push(...hasOptions.filter(opt => opt.startsWith(value)).map(opt => `has:${opt}`))
  }
  
  if (lowerPartial.startsWith('from:')) {
    suggestions.push('from:me', 'from:@')
  }
  
  if (lowerPartial.startsWith('in:')) {
    suggestions.push('in:#', 'in:@')
  }
  
  if (lowerPartial.startsWith('before:') || lowerPartial.startsWith('after:')) {
    const today = new Date().toISOString().split('T')[0]
    const prefix = lowerPartial.startsWith('before:') ? 'before:' : 'after:'
    suggestions.push(`${prefix}${today}`, `${prefix}yesterday`, `${prefix}last-week`)
  }
  
  // If no operator matched, suggest common operators
  if (suggestions.length === 0 && lowerPartial.length > 0) {
    const operators = ['is:', 'from:', 'in:', 'has:', 'before:', 'after:']
    suggestions.push(...operators.filter(op => op.startsWith(lowerPartial)))
  }
  
  return suggestions.slice(0, 5) // Limit to 5 suggestions
}
