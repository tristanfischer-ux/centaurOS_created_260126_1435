'use server'

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { parseSearchQuery, operatorsToFilters, type SearchFilters } from '@/lib/search/operators'

export interface SearchResult {
  id: string
  content: string
  created_at: string
  conversation_id: string
  sender_id: string
  sender: {
    id: string
    full_name: string | null
    avatar_url: string | null
  } | null
  conversation: {
    id: string
    title: string | null
  } | null
}

/**
 * Search messages with advanced operators
 * 
 * Supports operators:
 * - is:starred - Only starred messages
 * - is:pinned - Only pinned messages
 * - from:@username - Messages from specific user
 * - in:#channel - Messages in specific conversation
 * - has:link - Messages with URLs
 * - has:file - Messages with attachments
 * - before:YYYY-MM-DD - Messages before date
 * - after:YYYY-MM-DD - Messages after date
 * - on:YYYY-MM-DD - Messages on specific date
 */
export async function searchMessages(
  searchQuery: string,
  limit: number = 50
): Promise<{ success: boolean; error?: string; data?: SearchResult[] }> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // SECURITY: Get foundry_id to scope profile queries (RLS disabled on profiles)
    const foundryId = await getFoundryIdCached()
    
    // Parse search query
    const parsed = parseSearchQuery(searchQuery)
    const filters = operatorsToFilters(parsed.operators)
    
    // Start building query - only search conversations user participates in
    let query = supabase
      .from('messages')
      .select(`
        id,
        content,
        created_at,
        conversation_id,
        sender_id,
        file_url,
        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url),
        conversation:conversations!messages_conversation_id_fkey(id, title)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    // Filter by user's conversations
    const { data: participantConvos } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('profile_id', user.id)
    
    const userConversationIds = participantConvos?.map(p => p.conversation_id) || []
    if (userConversationIds.length === 0) {
      return { success: true, data: [] }
    }
    
    query = query.in('conversation_id', userConversationIds)
    
    // Apply text search if query present
    if (parsed.query) {
      // Use Postgres full-text search
      query = query.textSearch('content', parsed.query, {
        type: 'websearch',
        config: 'english',
      })
    }
    
    // Apply filters
    if (filters.isStarred) {
      // Get user's starred message IDs
      const { data: stars } = await supabase
        .from('message_stars')
        .select('message_id')
        .eq('user_id', user.id)
      
      const starredIds = stars?.map(s => s.message_id) || []
      if (starredIds.length === 0) {
        return { success: true, data: [] }
      }
      query = query.in('id', starredIds)
    }
    
    if (filters.isPinned) {
      // Get pinned message IDs in user's conversations
      const { data: pins } = await supabase
        .from('pinned_messages')
        .select('message_id')
        .in('conversation_id', userConversationIds)
      
      const pinnedIds = pins?.map(p => p.message_id) || []
      if (pinnedIds.length === 0) {
        return { success: true, data: [] }
      }
      query = query.in('id', pinnedIds)
    }
    
    if (filters.fromUserId) {
      // If starts with @, try to resolve username to user ID
      if (filters.fromUserId.startsWith('@')) {
        const username = filters.fromUserId.slice(1)
        // SECURITY: Scope to foundry (RLS disabled on profiles)
        let userMatchQuery = supabase
          .from('profiles')
          .select('id')
          .ilike('full_name', `%${username}%`)
        if (foundryId) userMatchQuery = userMatchQuery.eq('foundry_id', foundryId)
        const { data: userMatch } = await userMatchQuery
          .limit(1)
          .single()
        
        if (userMatch) {
          query = query.eq('sender_id', userMatch.id)
        } else {
          return { success: true, data: [] } // No match found
        }
      } else {
        query = query.eq('sender_id', filters.fromUserId)
      }
    }
    
    if (filters.conversationId) {
      // If starts with #, try to resolve conversation name
      if (filters.conversationId.startsWith('#')) {
        const channelName = filters.conversationId.slice(1)
        const { data: convoMatch } = await supabase
          .from('conversations')
          .select('id')
          .ilike('title', `%${channelName}%`)
          .in('id', userConversationIds)
          .limit(1)
          .single()
        
        if (convoMatch) {
          query = query.eq('conversation_id', convoMatch.id)
        } else {
          return { success: true, data: [] } // No match found
        }
      } else {
        query = query.eq('conversation_id', filters.conversationId)
      }
    }
    
    if (filters.hasLink) {
      // Check if content contains URL pattern
      query = query.or('content.ilike.%http%,content.ilike.%www.%')
    }
    
    if (filters.hasFile) {
      // Has file attachment
      query = query.not('file_url', 'is', null)
    }
    
    if (filters.beforeDate) {
      query = query.lt('created_at', filters.beforeDate.toISOString())
    }
    
    if (filters.afterDate) {
      query = query.gt('created_at', filters.afterDate.toISOString())
    }
    
    if (filters.onDate) {
      // Same day
      const startOfDay = new Date(filters.onDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(filters.onDate)
      endOfDay.setHours(23, 59, 59, 999)
      
      query = query
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString())
    }
    
    // Execute query
    const { data, error } = await query
    
    if (error) {
      console.error('Error searching messages:', error)
      return { success: false, error: 'Search failed' }
    }
    
    return { success: true, data: data as SearchResult[] }
  } catch (error) {
    console.error('Error in searchMessages:', error)
    return { success: false, error: 'Search failed' }
  }
}

/**
 * Get autocomplete suggestions for search operators
 */
export async function getSearchSuggestions(
  operatorType: 'from' | 'in',
  query: string
): Promise<{ success: boolean; error?: string; data?: Array<{ id: string; label: string }> }> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // SECURITY: Get foundry_id to scope profile queries (RLS disabled on profiles)
    const foundryId = await getFoundryIdCached()
    
    if (operatorType === 'from') {
      // Autocomplete user names
      // SECURITY: Scope to foundry (RLS disabled on profiles)
      let usersQuery = supabase
        .from('profiles')
        .select('id, full_name')
        .ilike('full_name', `%${query}%`)
      if (foundryId) usersQuery = usersQuery.eq('foundry_id', foundryId)
      const { data: users, error } = await usersQuery
        .limit(10)
      
      if (error) {
        console.error('Error fetching user suggestions:', error)
        return { success: false, error: 'Failed to fetch suggestions' }
      }
      
      return {
        success: true,
        data: users?.map(u => ({
          id: u.id,
          label: `@${u.full_name}`,
        })) || [],
      }
    } else if (operatorType === 'in') {
      // Autocomplete conversation names
      const { data: participantConvos } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('profile_id', user.id)
      
      const conversationIds = participantConvos?.map(p => p.conversation_id) || []
      
      const { data: convos, error } = await supabase
        .from('conversations')
        .select('id, title')
        .in('id', conversationIds)
        .ilike('title', `%${query}%`)
        .limit(10)
      
      if (error) {
        console.error('Error fetching conversation suggestions:', error)
        return { success: false, error: 'Failed to fetch suggestions' }
      }
      
      return {
        success: true,
        data: convos?.map(c => ({
          id: c.id,
          label: `#${c.title}`,
        })) || [],
      }
    }
    
    return { success: true, data: [] }
  } catch (error) {
    console.error('Error in getSearchSuggestions:', error)
    return { success: false, error: 'Failed to fetch suggestions' }
  }
}

// ==========================================
// MARKETPLACE SEARCH ACTIONS
// ==========================================

import { 
  AppliedFilters, 
  MarketplaceCategory, 
  PopularSearch, 
  RecentSearch, 
  SearchSuggestion 
} from '@/types/search'

/**
 * Get recent searches for the current user
 */
export async function getRecentSearches(): Promise<{ success: boolean; searches: RecentSearch[]; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, searches: [] }
    }

    const { data, error } = await supabase
      .from('recent_searches')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) throw error

    return { 
      success: true, 
      searches: (data || []).map(item => ({
        ...item,
        filters: typeof item.filters === 'string' ? JSON.parse(item.filters) : item.filters
      })) as RecentSearch[] 
    }
  } catch (error) {
    console.error('Error fetching recent searches:', error)
    return { success: false, searches: [], error: 'Failed to fetch recent searches' }
  }
}

/**
 * Get popular searches
 */
export async function getPopularSearches(
  limit: number = 5,
  trendingOnly: boolean = false
): Promise<{ success: boolean; searches: PopularSearch[]; error?: string }> {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('popular_searches')
      .select('query, category, search_count, trending')
      .order('search_count', { ascending: false })
      .limit(limit)

    if (trendingOnly) {
      query = query.eq('trending', true)
    }

    const { data, error } = await query

    if (error) throw error

    return { 
      success: true, 
      searches: (data || []).map(item => ({
        query: item.query,
        category: item.category as MarketplaceCategory | undefined,
        count: item.search_count,
        trending: item.trending
      })) 
    }
  } catch (error) {
    console.error('Error fetching popular searches:', error)
    return { success: false, searches: [], error: 'Failed to fetch popular searches' }
  }
}

/**
 * Save a search query
 */
export async function saveSearchQuery(
  name: string,
  query: string,
  filters: AppliedFilters,
  isAlertEnabled: boolean = false,
  alertFrequency: 'daily' | 'weekly' | 'instant' = 'daily'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Also add to recent searches
    await supabase.from('recent_searches').upsert({
      user_id: user.id,
      query,
      filters,
      results_count: 0 // We don't know this yet without running the search
    }, { onConflict: 'user_id, query' })

    // Save to saved_searches
    const { error } = await supabase.from('saved_searches').insert({
      user_id: user.id,
      name,
      query,
      filters,
      is_alert_enabled: isAlertEnabled,
      alert_frequency: isAlertEnabled ? alertFrequency : null
    })

    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error('Error saving search:', error)
    return { success: false, error: 'Failed to save search' }
  }
}

/**
 * Get autocomplete suggestions for marketplace
 */
export async function getAutocomplete(
  query: string,
  category?: MarketplaceCategory
): Promise<{ success: boolean; suggestions: SearchSuggestion[]; error?: string }> {
  try {
    const supabase = await createClient()
    
    if (!query || query.length < 2) {
      return { success: true, suggestions: [] }
    }

    // 1. Search in popular searches
    const { data: popular } = await supabase
      .from('popular_searches')
      .select('query, category')
      .ilike('query', `%${query}%`)
      .limit(3)

    // 2. Search in listings titles
    let listingsQuery = supabase
      .from('marketplace_listings')
      .select('id, title, category, subcategory')
      .ilike('title', `%${query}%`)
      .limit(5)

    if (category) {
      listingsQuery = listingsQuery.eq('category', category)
    }

    const { data: listings } = await listingsQuery

    // Combine suggestions
    const suggestions: SearchSuggestion[] = []

    if (popular) {
      popular.forEach(p => {
        suggestions.push({
          id: `pop-${p.query}`,
          type: 'popular',
          text: p.query,
          category: p.category as MarketplaceCategory
        })
      })
    }

    if (listings) {
      listings.forEach(l => {
        suggestions.push({
          id: l.id,
          type: 'listing',
          text: l.title,
          category: l.category as MarketplaceCategory,
          subcategory: l.subcategory
        })
      })
    }

    return { success: true, suggestions }
  } catch (error) {
    console.error('Error getting autocomplete:', error)
    return { success: false, suggestions: [], error: 'Failed to get suggestions' }
  }
}
