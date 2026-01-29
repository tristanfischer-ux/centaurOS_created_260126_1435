// @ts-nocheck
// TODO: Fix type mismatches
/**
 * Marketplace Search Service
 * Main entry point for all search functionality
 */

import { createClient } from "@/lib/supabase/server"
import {
  SearchParams,
  SearchResult,
  SearchResponse,
  SearchSuggestion,
  RecentSearch,
  SavedSearch,
  PopularSearch,
  AppliedFilters,
  SortOption,
  MarketplaceCategory,
} from "@/types/search"
import { calculateAllScores, sortByScore } from "./ranking"
import { applyFilters, calculateFacets, cleanFilters } from "./filters"

// ==========================================
// MAIN SEARCH FUNCTION
// ==========================================

/**
 * Main marketplace search function
 * Combines database query, ranking, and filtering
 */
export async function searchMarketplace(params: SearchParams): Promise<SearchResponse> {
  try {
    const supabase = await createClient()
    const limit = params.limit || 20
    const page = params.page || 1
    const offset = (page - 1) * limit

    // Build the base query
    let query = supabase
      .from('marketplace_listings')
      .select(`
        id,
        category,
        subcategory,
        title,
        description,
        attributes,
        image_url,
        is_verified,
        created_at
      `, { count: 'exact' })

    // Apply category filter at database level
    if (params.category) {
      query = query.eq('category', params.category)
    }

    // Full-text search if query provided
    if (params.query && params.query.trim()) {
      const searchTerms = params.query.trim()
      // Use ilike for partial matching (full-text would require materialized view)
      query = query.or(
        `title.ilike.%${searchTerms}%,description.ilike.%${searchTerms}%,subcategory.ilike.%${searchTerms}%`
      )
    }

    // Execute the query
    const { data: listings, error } = await query

    if (error) {
      console.error('Search query error:', error)
      return createEmptyResponse(params)
    }

    if (!listings || listings.length === 0) {
      return createEmptyResponse(params)
    }

    // Fetch provider data for relevant listings
    const providerData = await fetchProviderData(
      supabase,
      listings.map(l => l.id)
    )

    // Transform to SearchResult format with scores
    let results: SearchResult[] = listings.map(listing => {
      const provider = providerData[listing.id]
      
      const { scores, totalScore } = calculateAllScores({
        listing: {
          title: listing.title,
          description: listing.description,
          subcategory: listing.subcategory,
          attributes: listing.attributes as Record<string, unknown> | null,
        },
        query: params.query || '',
        provider: provider ? {
          tier: provider.tier,
          avgRating: provider.avg_rating,
          totalReviews: provider.total_reviews,
          responseRate: provider.response_rate,
          avgResponseTimeHours: provider.avg_response_time_hours,
          completionRate: provider.completion_rate,
          totalOrders: provider.total_orders,
          centaurDiscount: provider.centaur_discount_percent,
          lastActive: provider.updated_at,
        } : undefined,
      })

      return {
        id: `${listing.id}`,
        listing_id: listing.id,
        provider_id: provider?.id || null,
        title: listing.title,
        description: listing.description,
        category: listing.category as MarketplaceCategory,
        subcategory: listing.subcategory,
        attributes: listing.attributes as Record<string, unknown> | null,
        image_url: listing.image_url,
        is_verified: listing.is_verified || false,
        provider: provider ? {
          id: provider.id,
          tier: provider.tier,
          rating: provider.avg_rating,
          total_reviews: provider.total_reviews,
          response_rate: provider.response_rate,
          completion_rate: provider.completion_rate,
          centaur_discount: provider.centaur_discount_percent,
          last_active: provider.updated_at,
          day_rate: provider.day_rate,
          currency: provider.currency || 'GBP',
        } : undefined,
        scores,
        totalScore,
      }
    })

    // Apply additional filters
    results = applyFilters(results, params)

    // Sort results
    results = applySorting(results, params.sortBy, params.sortOrder)

    // Calculate facets before pagination
    const facets = calculateFacets(results)

    // Get total after filtering
    const total = results.length

    // Apply pagination
    const paginatedResults = results.slice(offset, offset + limit)

    // Get suggestions if there's a query
    const suggestions = params.query
      ? await getSearchSuggestions(params.query, params.category)
      : []

    // Save search to history if user is authenticated
    if (params.userId && params.query) {
      await saveRecentSearch(params.userId, params.query, cleanFilters({
        query: params.query,
        category: params.category,
        subcategories: params.subcategories,
        priceRange: params.minPrice !== undefined || params.maxPrice !== undefined
          ? { min: params.minPrice, max: params.maxPrice }
          : undefined,
        minRating: params.minRating,
        location: params.location,
        tiers: params.tiers,
        skills: params.skills,
        certifications: params.certifications,
      }), total)
    }

    return {
      results: paginatedResults,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
      facets,
      query: params.query || null,
      appliedFilters: cleanFilters({
        query: params.query,
        category: params.category,
        subcategories: params.subcategories,
        priceRange: params.minPrice !== undefined || params.maxPrice !== undefined
          ? { min: params.minPrice, max: params.maxPrice }
          : undefined,
        minRating: params.minRating,
        location: params.location,
        tiers: params.tiers,
        skills: params.skills,
        certifications: params.certifications,
      }),
      suggestions,
    }
  } catch (err) {
    console.error('Search error:', err)
    return createEmptyResponse(params)
  }
}

// ==========================================
// PROVIDER DATA FETCHING
// ==========================================

interface ProviderDataMap {
  [listingId: string]: {
    id: string
    tier: 'pending' | 'standard' | 'verified' | 'premium'
    avg_rating: number | null
    total_reviews: number
    response_rate: number | null
    avg_response_time_hours: number | null
    completion_rate: number | null
    total_orders: number
    centaur_discount_percent: number | null
    day_rate: number | null
    currency: string | null
    updated_at: string | null
  }
}

async function fetchProviderData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingIds: string[]
): Promise<ProviderDataMap> {
  const providerMap: ProviderDataMap = {}

  if (listingIds.length === 0) return providerMap

  try {
    // Fetch provider profiles linked to listings
    // Using any cast since provider_profiles table may not be in generated types
    const { data: providers } = await (supabase as any)
      .from('provider_profiles')
      .select(`
        id,
        listing_id,
        tier,
        response_rate,
        avg_response_time_hours,
        completion_rate,
        centaur_discount_percent,
        day_rate,
        currency,
        updated_at
      `)
      .in('listing_id', listingIds)
      .eq('is_active', true) as { data: any[] | null }

    if (!providers) return providerMap

    // Fetch ratings for each provider
    const providerIds = providers.map((p: any) => p.id)
    const { data: ratings } = await (supabase as any)
      .from('provider_reviews')
      .select('reviewee_id, rating')
      .in('reviewee_id', providerIds) as { data: any[] | null }

    // Calculate average ratings
    const ratingMap: Record<string, { sum: number; count: number }> = {}
    for (const rating of ratings || []) {
      if (!ratingMap[rating.reviewee_id]) {
        ratingMap[rating.reviewee_id] = { sum: 0, count: 0 }
      }
      ratingMap[rating.reviewee_id].sum += rating.rating
      ratingMap[rating.reviewee_id].count++
    }

    // Fetch order counts
    const { data: orderCounts } = await (supabase as any)
      .from('orders')
      .select('seller_id')
      .in('seller_id', providerIds)
      .eq('status', 'completed') as { data: any[] | null }

    const orderCountMap: Record<string, number> = {}
    for (const order of orderCounts || []) {
      orderCountMap[order.seller_id] = (orderCountMap[order.seller_id] || 0) + 1
    }

    // Build the map
    for (const provider of providers) {
      const ratingData = ratingMap[provider.id]
      const avgRating = ratingData ? ratingData.sum / ratingData.count : null

      providerMap[provider.listing_id!] = {
        id: provider.id,
        tier: (provider.tier as 'pending' | 'standard' | 'verified' | 'premium') || 'standard',
        avg_rating: avgRating,
        total_reviews: ratingData?.count || 0,
        response_rate: provider.response_rate,
        avg_response_time_hours: provider.avg_response_time_hours,
        completion_rate: provider.completion_rate,
        total_orders: orderCountMap[provider.id] || 0,
        centaur_discount_percent: provider.centaur_discount_percent,
        day_rate: provider.day_rate,
        currency: provider.currency,
        updated_at: provider.updated_at,
      }
    }
  } catch (err) {
    console.error('Error fetching provider data:', err)
  }

  return providerMap
}

// ==========================================
// SORTING
// ==========================================

function applySorting(
  results: SearchResult[],
  sortBy?: SortOption,
  sortOrder: 'asc' | 'desc' = 'desc'
): SearchResult[] {
  if (!sortBy || sortBy === 'relevance') {
    return sortByScore(results)
  }

  const sorted = [...results].sort((a, b) => {
    let comparison = 0

    switch (sortBy) {
      case 'rating_high':
        comparison = (b.provider?.rating || 0) - (a.provider?.rating || 0)
        break
      case 'rating_low':
        comparison = (a.provider?.rating || 0) - (b.provider?.rating || 0)
        break
      case 'price_high':
        comparison = (b.provider?.day_rate || 0) - (a.provider?.day_rate || 0)
        break
      case 'price_low':
        comparison = (a.provider?.day_rate || 0) - (b.provider?.day_rate || 0)
        break
      case 'newest':
        // Sort by provider activity
        const aTime = a.provider?.last_active ? new Date(a.provider.last_active).getTime() : 0
        const bTime = b.provider?.last_active ? new Date(b.provider.last_active).getTime() : 0
        comparison = bTime - aTime
        break
      case 'most_reviews':
        comparison = (b.provider?.total_reviews || 0) - (a.provider?.total_reviews || 0)
        break
      case 'response_time':
        comparison = (b.scores.responseRate || 0) - (a.scores.responseRate || 0)
        break
      case 'completion_rate':
        comparison = (b.scores.completionRate || 0) - (a.scores.completionRate || 0)
        break
      default:
        comparison = b.totalScore - a.totalScore
    }

    return sortOrder === 'asc' ? -comparison : comparison
  })

  return sorted
}

// ==========================================
// SEARCH SUGGESTIONS
// ==========================================

/**
 * Get autocomplete suggestions based on partial query
 */
export async function getSearchSuggestions(
  query: string,
  category?: MarketplaceCategory
): Promise<SearchSuggestion[]> {
  if (!query || query.trim().length < 2) {
    return []
  }

  try {
    const supabase = await createClient()
    const normalizedQuery = query.toLowerCase().trim()
    const suggestions: SearchSuggestion[] = []

    // Get matching listings (titles)
    let listingsQuery = supabase
      .from('marketplace_listings')
      .select('id, title, category, subcategory')
      .ilike('title', `%${normalizedQuery}%`)
      .limit(5)

    if (category) {
      listingsQuery = listingsQuery.eq('category', category)
    }

    const { data: listings } = await listingsQuery

    // Add listing suggestions
    for (const listing of listings || []) {
      suggestions.push({
        id: `listing-${listing.id}`,
        type: 'listing',
        text: listing.title,
        category: listing.category as MarketplaceCategory,
        subcategory: listing.subcategory,
      })
    }

    // Get matching subcategories
    const { data: subcategories } = await supabase
      .from('marketplace_listings')
      .select('subcategory, category')
      .ilike('subcategory', `%${normalizedQuery}%`)
      .limit(5)

    // Deduplicate subcategories
    const seenSubcategories = new Set<string>()
    for (const item of subcategories || []) {
      if (!seenSubcategories.has(item.subcategory)) {
        seenSubcategories.add(item.subcategory)
        suggestions.push({
          id: `subcategory-${item.subcategory}`,
          type: 'category',
          text: item.subcategory,
          category: item.category as MarketplaceCategory,
        })
      }
    }

    // Get popular searches matching query
    const { data: popular } = await supabase
      .from('popular_searches')
      .select('query, search_count')
      .ilike('query', `%${normalizedQuery}%`)
      .order('search_count', { ascending: false })
      .limit(3)

    for (const search of popular || []) {
      suggestions.push({
        id: `popular-${search.query}`,
        type: 'popular',
        text: search.query,
        count: search.search_count,
      })
    }

    return suggestions.slice(0, 10) // Limit total suggestions
  } catch (err) {
    console.error('Error getting search suggestions:', err)
    return []
  }
}

// ==========================================
// RECENT SEARCHES
// ==========================================

/**
 * Get user's recent searches
 */
export async function getRecentSearches(userId: string): Promise<RecentSearch[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('recent_searches')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Error fetching recent searches:', error)
      return []
    }

    return (data || []) as RecentSearch[]
  } catch (err) {
    console.error('Failed to fetch recent searches:', err)
    return []
  }
}

/**
 * Save a search to user's history
 */
async function saveRecentSearch(
  userId: string,
  query: string,
  filters: AppliedFilters,
  resultsCount: number
): Promise<void> {
  try {
    const supabase = await createClient()

    // Upsert to handle duplicate queries
    await supabase
      .from('recent_searches')
      .upsert({
        user_id: userId,
        query: query.trim(),
        filters,
        results_count: resultsCount,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,query',
      })

    // Also update popular searches
    await supabase
      .from('popular_searches')
      .upsert({
        query: query.trim().toLowerCase(),
        search_count: 1,
        last_searched_at: new Date().toISOString(),
      }, {
        onConflict: 'query',
      })
.then(() => {
  // Increment count (separate query since upsert doesn't support increment)
  supabase.rpc('increment_search_count', { search_query: query.trim().toLowerCase() })
    .catch(err => console.error('Failed to increment search count:', err))
})
  } catch (err) {
    console.error('Error saving recent search:', err)
  }
}

/**
 * Save search to user history (public function for manual saves)
 */
export async function saveSearch(
  userId: string,
  query: string,
  filters?: AppliedFilters
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('recent_searches')
      .upsert({
        user_id: userId,
        query: query.trim(),
        filters: filters || {},
        results_count: 0,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,query',
      })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error saving search:', err)
    return { success: false, error: 'Failed to save search' }
  }
}

/**
 * Delete a recent search
 */
export async function deleteRecentSearch(
  userId: string,
  searchId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('recent_searches')
      .delete()
      .eq('id', searchId)
      .eq('user_id', userId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error deleting recent search:', err)
    return { success: false, error: 'Failed to delete search' }
  }
}

/**
 * Clear all recent searches for a user
 */
export async function clearRecentSearches(
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('recent_searches')
      .delete()
      .eq('user_id', userId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error clearing recent searches:', err)
    return { success: false, error: 'Failed to clear searches' }
  }
}

// ==========================================
// SAVED SEARCHES
// ==========================================

/**
 * Get user's saved searches
 */
export async function getSavedSearches(userId: string): Promise<SavedSearch[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching saved searches:', error)
      return []
    }

    return (data || []) as SavedSearch[]
  } catch (err) {
    console.error('Failed to fetch saved searches:', err)
    return []
  }
}

/**
 * Save a search with a name
 */
export async function createSavedSearch(
  userId: string,
  name: string,
  query: string,
  filters: AppliedFilters,
  alertEnabled: boolean = false,
  alertFrequency?: 'daily' | 'weekly' | 'instant'
): Promise<{ success: boolean; searchId?: string; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('saved_searches')
      .insert({
        user_id: userId,
        name: name.trim(),
        query: query.trim(),
        filters,
        is_alert_enabled: alertEnabled,
        alert_frequency: alertEnabled ? alertFrequency : null,
      })
      .select('id')
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, searchId: data.id, error: null }
  } catch (err) {
    console.error('Error creating saved search:', err)
    return { success: false, error: 'Failed to save search' }
  }
}

/**
 * Delete a saved search
 */
export async function deleteSavedSearch(
  userId: string,
  searchId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('saved_searches')
      .delete()
      .eq('id', searchId)
      .eq('user_id', userId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error deleting saved search:', err)
    return { success: false, error: 'Failed to delete saved search' }
  }
}

// ==========================================
// POPULAR SEARCHES
// ==========================================

/**
 * Get popular/trending searches
 */
export async function getPopularSearches(
  limit: number = 10,
  trendingOnly: boolean = false
): Promise<PopularSearch[]> {
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

    if (error) {
      console.error('Error fetching popular searches:', error)
      return []
    }

    return (data || []).map(item => ({
      query: item.query,
      category: item.category as MarketplaceCategory | undefined,
      count: item.search_count,
      trending: item.trending,
    }))
  } catch (err) {
    console.error('Failed to fetch popular searches:', err)
    return []
  }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function createEmptyResponse(params: SearchParams): SearchResponse {
  return {
    results: [],
    total: 0,
    page: params.page || 1,
    limit: params.limit || 20,
    hasMore: false,
    facets: {
      categories: { People: 0, Products: 0, Services: 0, AI: 0 },
      subcategories: {},
      tiers: { pending: 0, standard: 0, verified: 0, premium: 0 },
      priceRanges: { '0-50': 0, '50-100': 0, '100-250': 0, '250-500': 0, '500+': 0 },
      ratings: {},
      locations: {},
    },
    query: params.query || null,
    appliedFilters: {},
    suggestions: [],
  }
}

// ==========================================
// EXPORTS
// ==========================================

export {
  getSearchSuggestions as getSuggestions,
  getRecentSearches as getHistory,
  getPopularSearches as getTrending,
}
