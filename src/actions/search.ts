"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  SearchParams,
  SearchResponse,
  SearchFilters,
  SavedSearch,
  RecentSearch,
  PopularSearch,
  AppliedFilters,
  MarketplaceCategory,
} from "@/types/search"
import {
  searchMarketplace,
  getSearchSuggestions,
  getRecentSearches as getRecentSearchesService,
  getSavedSearches as getSavedSearchesService,
  createSavedSearch,
  deleteSavedSearch as deleteSavedSearchService,
  deleteRecentSearch,
  clearRecentSearches,
  getPopularSearches as getPopularSearchesService,
} from "@/lib/search/service"

// ==========================================
// MAIN SEARCH ACTION
// ==========================================

/**
 * Search providers/listings in the marketplace
 */
export async function searchProviders(params: SearchParams): Promise<SearchResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    // Include user ID for personalization and search history
    const searchParams: SearchParams = {
      ...params,
      userId: user?.id,
    }
    
    return await searchMarketplace(searchParams)
  } catch (err) {
    console.error('Search providers error:', err)
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
}

// ==========================================
// FILTER OPTIONS
// ==========================================

/**
 * Get available filter options for a category
 */
export async function getSearchFilters(
  category?: MarketplaceCategory
): Promise<{ filters: SearchFilters; error: string | null }> {
  try {
    const supabase = await createClient()
    
    // Build query for listings
    let query = supabase
      .from('marketplace_listings')
      .select('category, subcategory, attributes')
    
    if (category) {
      query = query.eq('category', category)
    }
    
    const { data: listings, error } = await query
    
    if (error) {
      console.error('Error fetching filter options:', error)
      return { filters: getEmptyFilters(), error: error.message }
    }
    
    // Calculate filter options from listings
    const categoryMap: Record<MarketplaceCategory, number> = {
      People: 0, Products: 0, Services: 0, AI: 0
    }
    const subcategoryMap: Record<string, number> = {}
    const locationMap: Record<string, number> = {}
    const skillsSet = new Set<string>()
    const certificationsSet = new Set<string>()
    const priceRanges: Record<string, number> = {
      '0-50': 0, '50-100': 0, '100-250': 0, '250-500': 0, '500+': 0
    }
    
    for (const listing of listings || []) {
      // Categories
      if (listing.category in categoryMap) {
        categoryMap[listing.category as MarketplaceCategory]++
      }
      
      // Subcategories
      subcategoryMap[listing.subcategory] = (subcategoryMap[listing.subcategory] || 0) + 1
      
      // Extract from attributes
      const attrs = listing.attributes as Record<string, unknown> | null
      if (attrs) {
        // Location
        const location = attrs.location as string | undefined
        if (location) {
          locationMap[location] = (locationMap[location] || 0) + 1
        }
        
        // Skills
        const skills = attrs.skills as string[] | undefined
        if (skills) {
          skills.forEach(s => skillsSet.add(s))
        }
        const expertise = attrs.expertise as string[] | undefined
        if (expertise) {
          expertise.forEach(s => skillsSet.add(s))
        }
        
        // Certifications
        const certs = attrs.certifications as string[] | undefined
        if (certs) {
          certs.forEach(c => certificationsSet.add(c))
        }
        
        // Price ranges
        const rate = extractNumericPrice(attrs)
        if (rate !== null) {
          if (rate < 50) priceRanges['0-50']++
          else if (rate < 100) priceRanges['50-100']++
          else if (rate < 250) priceRanges['100-250']++
          else if (rate < 500) priceRanges['250-500']++
          else priceRanges['500+']++
        }
      }
    }
    
    // Get tier counts from provider_profiles
    // Using any cast since provider_profiles table may not be in generated types
    const { data: providers } = await (supabase as any)
      .from('provider_profiles')
      .select('tier')
      .eq('is_active', true) as { data: any[] | null }
    
    const tierMap: Record<string, number> = {
      pending: 0, standard: 0, verified: 0, premium: 0
    }
    for (const provider of providers || []) {
      if (provider.tier && provider.tier in tierMap) {
        tierMap[provider.tier]++
      }
    }
    
    // Build filter options
    const filters: SearchFilters = {
      categories: Object.entries(categoryMap).map(([value, count]) => ({
        value,
        label: value,
        count,
      })),
      subcategories: Object.entries(subcategoryMap)
        .sort(([, a], [, b]) => b - a)
        .map(([value, count]) => ({
          value,
          label: value,
          count,
        })),
      tiers: [
        { value: 'premium', label: 'Premium', count: tierMap.premium },
        { value: 'verified', label: 'Verified', count: tierMap.verified },
        { value: 'standard', label: 'Standard', count: tierMap.standard },
        { value: 'pending', label: 'Pending', count: tierMap.pending },
      ],
      priceRanges: [
        { min: null, max: 50, label: 'Under £50', count: priceRanges['0-50'] },
        { min: 50, max: 100, label: '£50 - £100', count: priceRanges['50-100'] },
        { min: 100, max: 250, label: '£100 - £250', count: priceRanges['100-250'] },
        { min: 250, max: 500, label: '£250 - £500', count: priceRanges['250-500'] },
        { min: 500, max: null, label: '£500+', count: priceRanges['500+'] },
      ],
      ratingOptions: [
        { value: '4', label: '4+ Stars', count: 0 },
        { value: '3', label: '3+ Stars', count: 0 },
        { value: '2', label: '2+ Stars', count: 0 },
      ],
      locations: Object.entries(locationMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([value, count]) => ({
          value,
          label: value,
          count,
        })),
      skills: [...skillsSet].sort().slice(0, 30).map(skill => ({
        value: skill,
        label: skill,
        count: 0, // Would need aggregation to get actual counts
      })),
      certifications: [...certificationsSet].sort().map(cert => ({
        value: cert,
        label: cert,
        count: 0,
      })),
    }
    
    return { filters, error: null }
  } catch (err) {
    console.error('Error getting search filters:', err)
    return { filters: getEmptyFilters(), error: 'Failed to load filters' }
  }
}

function extractNumericPrice(attrs: Record<string, unknown>): number | null {
  const priceFields = ['rate', 'price', 'day_rate', 'cost_value']
  for (const field of priceFields) {
    const value = attrs[field]
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const match = value.match(/[\d,]+\.?\d*/)
      if (match) return parseFloat(match[0].replace(/,/g, ''))
    }
  }
  return null
}

function getEmptyFilters(): SearchFilters {
  return {
    categories: [],
    subcategories: [],
    tiers: [],
    priceRanges: [],
    ratingOptions: [],
    locations: [],
    skills: [],
    certifications: [],
  }
}

// ==========================================
// SAVED SEARCHES
// ==========================================

/**
 * Get user's saved searches
 */
export async function getSavedSearches(): Promise<{
  searches: SavedSearch[]
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { searches: [], error: 'Not authenticated' }
    }
    
    const searches = await getSavedSearchesService(user.id)
    return { searches, error: null }
  } catch (err) {
    console.error('Error getting saved searches:', err)
    return { searches: [], error: 'Failed to load saved searches' }
  }
}

/**
 * Save a search query with filters
 */
export async function saveSearchQuery(
  name: string,
  query: string,
  filters: AppliedFilters,
  alertEnabled: boolean = false,
  alertFrequency?: 'daily' | 'weekly' | 'instant'
): Promise<{ success: boolean; searchId?: string; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    const result = await createSavedSearch(
      user.id,
      name,
      query,
      filters,
      alertEnabled,
      alertFrequency
    )
    
    if (result.success) {
      revalidatePath('/marketplace')
    }
    
    return result
  } catch (err) {
    console.error('Error saving search:', err)
    return { success: false, error: 'Failed to save search' }
  }
}

/**
 * Delete a saved search
 */
export async function deleteSavedSearch(
  searchId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    const result = await deleteSavedSearchService(user.id, searchId)
    
    if (result.success) {
      revalidatePath('/marketplace')
    }
    
    return result
  } catch (err) {
    console.error('Error deleting saved search:', err)
    return { success: false, error: 'Failed to delete search' }
  }
}

/**
 * Update alert settings for a saved search
 */
export async function updateSearchAlert(
  searchId: string,
  alertEnabled: boolean,
  alertFrequency?: 'daily' | 'weekly' | 'instant'
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Using any cast since saved_searches table may not be in generated types
    const { error } = await (supabase as any)
      .from('saved_searches')
      .update({
        is_alert_enabled: alertEnabled,
        alert_frequency: alertEnabled ? alertFrequency : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', searchId)
      .eq('user_id', user.id)
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    revalidatePath('/marketplace')
    return { success: true, error: null }
  } catch (err) {
    console.error('Error updating search alert:', err)
    return { success: false, error: 'Failed to update alert' }
  }
}

// ==========================================
// RECENT SEARCHES
// ==========================================

/**
 * Get user's recent searches
 */
export async function getRecentSearches(): Promise<{
  searches: RecentSearch[]
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { searches: [], error: null } // Not an error, just no user
    }
    
    const searches = await getRecentSearchesService(user.id)
    return { searches, error: null }
  } catch (err) {
    console.error('Error getting recent searches:', err)
    return { searches: [], error: 'Failed to load recent searches' }
  }
}

/**
 * Delete a recent search
 */
export async function deleteRecentSearchAction(
  searchId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    return await deleteRecentSearch(user.id, searchId)
  } catch (err) {
    console.error('Error deleting recent search:', err)
    return { success: false, error: 'Failed to delete search' }
  }
}

/**
 * Clear all recent searches
 */
export async function clearRecentSearchesAction(): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }
    
    return await clearRecentSearches(user.id)
  } catch (err) {
    console.error('Error clearing recent searches:', err)
    return { success: false, error: 'Failed to clear searches' }
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
): Promise<{ searches: PopularSearch[]; error: string | null }> {
  try {
    const searches = await getPopularSearchesService(limit, trendingOnly)
    return { searches, error: null }
  } catch (err) {
    console.error('Error getting popular searches:', err)
    return { searches: [], error: 'Failed to load popular searches' }
  }
}

// ==========================================
// SEARCH SUGGESTIONS
// ==========================================

/**
 * Get autocomplete suggestions
 */
export async function getAutocomplete(
  query: string,
  category?: MarketplaceCategory
): Promise<{
  suggestions: { id: string; type: string; text: string; category?: string }[]
  error: string | null
}> {
  try {
    const suggestions = await getSearchSuggestions(query, category)
    return {
      suggestions: suggestions.map(s => ({
        id: s.id,
        type: s.type,
        text: s.text,
        category: s.category,
      })),
      error: null,
    }
  } catch (err) {
    console.error('Error getting autocomplete:', err)
    return { suggestions: [], error: 'Failed to load suggestions' }
  }
}

// ==========================================
// QUICK SEARCH ACTIONS
// ==========================================

/**
 * Execute a saved search
 */
export async function executeSavedSearch(
  searchId: string
): Promise<SearchResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('Not authenticated')
    }
    
    // Get the saved search
    // Using any cast since saved_searches table may not be in generated types
    const { data: savedSearch, error } = await (supabase as any)
      .from('saved_searches')
      .select('*')
      .eq('id', searchId)
      .eq('user_id', user.id)
      .single() as { data: any; error: any }
    
    if (error || !savedSearch) {
      throw new Error('Saved search not found')
    }
    
    // Execute the search
    const savedFilters = savedSearch.filters as AppliedFilters
    const params: SearchParams = {
      query: savedSearch.query || undefined,
      category: savedFilters?.category,
      subcategories: savedFilters?.subcategories,
      minPrice: savedFilters?.priceRange?.min,
      maxPrice: savedFilters?.priceRange?.max,
      minRating: savedFilters?.minRating,
      location: savedFilters?.location,
      tiers: savedFilters?.tiers,
      skills: savedFilters?.skills,
      certifications: savedFilters?.certifications,
      userId: user.id,
    }
    
    return await searchMarketplace(params)
  } catch (err) {
    console.error('Error executing saved search:', err)
    throw err
  }
}

/**
 * Execute a recent search again
 */
export async function executeRecentSearch(
  searchId: string
): Promise<SearchResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('Not authenticated')
    }
    
    // Get the recent search
    // Using any cast since recent_searches table may not be in generated types
    const { data: recentSearch, error } = await (supabase as any)
      .from('recent_searches')
      .select('*')
      .eq('id', searchId)
      .eq('user_id', user.id)
      .single() as { data: any; error: any }
    
    if (error || !recentSearch) {
      throw new Error('Recent search not found')
    }
    
    // Execute the search
    const recentFilters = recentSearch.filters as AppliedFilters
    const params: SearchParams = {
      query: recentSearch.query,
      category: recentFilters?.category,
      subcategories: recentFilters?.subcategories,
      minPrice: recentFilters?.priceRange?.min,
      maxPrice: recentFilters?.priceRange?.max,
      minRating: recentFilters?.minRating,
      location: recentFilters?.location,
      tiers: recentFilters?.tiers,
      skills: recentFilters?.skills,
      certifications: recentFilters?.certifications,
      userId: user.id,
    }
    
    return await searchMarketplace(params)
  } catch (err) {
    console.error('Error executing recent search:', err)
    throw err
  }
}
