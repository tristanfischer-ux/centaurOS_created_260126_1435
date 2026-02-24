"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { withAuth, withUser, type ActionError } from '@/lib/server-action-utils'
import { embedText } from '@/lib/search/semantic-search'



/**
 * Adds a marketplace listing to the foundry's saved stack.
 *
 * @description Inserts a foundry_stack record linking the foundry to a provider listing.
 * Tool-type items are not yet supported pending a database update.
 *
 * @param {string} id - The marketplace listing ID to save
 * @param {'provider' | 'tool'} [type='provider'] - The item type (only 'provider' supported)
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires authenticated user with foundry membership via withAuth.
 *   Foundry isolation enforced via foundry_id on insert.
 */
export async function addToStack(id: string, type: 'provider' | 'tool' = 'provider') {
    if (type === 'tool') {
        return { error: "AI Agents cannot be added to stack yet (Database update pending)" }
    }

    const providerId = id

    return withAuth(async ({ supabase, foundryId }) => {
        // Add to stack
        const { error } = await supabase
            .from("foundry_stack")
            .insert({
                foundry_id: foundryId,
                provider_id: providerId,
                status: "Active"
            })

        if (error) {
            if (error.code === '23505') { // Unique violation
                return { error: "Already saved" }
            }
            return { error: "Failed to save resource" }
        }

        revalidatePath("/marketplace")
        revalidatePath("/saved-resources")
        return { success: true }
    })
}

/**
 * Removes a marketplace listing from the foundry's saved stack.
 *
 * @description Deletes the foundry_stack record matching the foundry and provider.
 *
 * @param {string} id - The marketplace listing ID to remove
 * @param {'provider' | 'tool'} [type='provider'] - The item type (only 'provider' supported)
 * @returns {Promise<{ success: true } | { error: string }>} Success or error
 *
 * @security Requires authenticated user with foundry membership via withAuth.
 *   Foundry isolation enforced via foundry_id filter.
 */
export async function removeFromStack(id: string, type: 'provider' | 'tool' = 'provider') {
    if (type === 'tool') {
        return { error: "AI Agents cannot be removed yet" }
    }

    const providerId = id

    return withAuth(async ({ supabase, foundryId }) => {
        const { error } = await supabase
            .from("foundry_stack")
            .delete()
            .eq("foundry_id", foundryId)
            .eq("provider_id", providerId)

        if (error) return { error: "Failed to remove saved resource" }

        revalidatePath("/marketplace")
        revalidatePath("/saved-resources")
        return { success: true }
    })
}

/**
 * Retrieves all saved marketplace resources for the current foundry.
 *
 * @description Fetches foundry_stack records, then hydrates them with full
 * marketplace_listings details. Combines the data into a format suitable for
 * the saved resources view.
 *
 * @returns {Promise<{ data: object[]; error: string | null } | { error: string; data: [] }>}
 *   Array of saved resource records with listing details, or error
 *
 * @security Requires authenticated user with foundry membership via withAuth.
 *   Scoped to the caller's foundry.
 */
export async function getSavedResources() {
    return withAuth(async ({ supabase, foundryId }) => {
        // First get the stack items
        const { data: stackData, error: stackError } = await supabase
            .from("foundry_stack")
            .select("id, provider_id, status, created_at")
            .eq("foundry_id", foundryId)
            .order("created_at", { ascending: false })

        if (stackError) {
            console.error("Error fetching stack:", stackError)
            return { error: "Failed to fetch saved resources", data: [] }
        }

        if (!stackData || stackData.length === 0) {
            return { data: [], error: null }
        }

        // Then get the marketplace listings for those IDs
        const providerIds = stackData.map(s => s.provider_id).filter((id): id is string => id != null)
        const { data: listings, error: listingsError } = await supabase
            .from("marketplace_listings")
            .select(`
                id,
                title,
                description,
                category,
                subcategory,
                attributes,
                image_url
            `)
            .in("id", providerIds)

        if (listingsError) {
            console.error("Error fetching listings:", listingsError)
            return { error: "Failed to fetch saved resources", data: [] }
        }

        // Combine the data
        const data = stackData.map(stack => {
            const listing = listings?.find(l => l.id === stack.provider_id)
            return {
                ...stack,
                marketplace_listings: listing ? {
                    id: listing.id,
                    name: listing.title,
                    headline: listing.description || '',
                    category: listing.category,
                    subcategory: listing.subcategory || '',
                    tags: (listing.attributes as any)?.tags || [],
                    hourly_rate_min: (listing.attributes as any)?.hourly_rate_min || null,
                    hourly_rate_max: (listing.attributes as any)?.hourly_rate_max || null,
                    delivery_time_days: (listing.attributes as any)?.delivery_time_days || null,
                    certification_level: (listing.attributes as any)?.certification_level || null,
                    rating_average: (listing.attributes as any)?.rating_average || null,
                    total_reviews: (listing.attributes as any)?.total_reviews || null,
                    total_bookings: (listing.attributes as any)?.total_bookings || null,
                    response_time_hours: (listing.attributes as any)?.response_time_hours || null,
                } : null
            }
        })

        return { data, error: null }
    })
}

export type VerificationTier = 'unverified' | 'claimed' | 'verified'

export interface MarketplaceListing {
    id: string
    category: 'People' | 'Products' | 'Services' | 'AI'
    subcategory: string
    title: string
    description: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attributes: Record<string, any>
    image_url: string | null
    is_verified: boolean
    /** Three-tier verification: unverified → claimed → verified */
    verification_tier: VerificationTier
    /** Whether this listing is demo/sample data vs a real user's listing */
    is_demo: boolean
    /** Provider profile ID linking to the real user who created this listing */
    created_by_provider_id: string | null
}

import { MARKETPLACE_PAGE_SIZE } from '@/lib/marketplace-constants'

/** When full-text result count is below this, semantic (embedding) fallback is used. */
const SEMANTIC_FALLBACK_THRESHOLD = 5

/** Max semantic results to fetch when doing hybrid fallback. */
const SEMANTIC_FALLBACK_MATCH_COUNT = 50

/** Sort options for marketplace search. */
export type MarketplaceSortOption =
    | 'relevance'
    | 'rating'
    | 'price_asc'
    | 'price_desc'
    | 'newest'
    | 'verified'

export interface SearchMarketplaceListingsParams {
    query?: string
    /** Single category filter (e.g. 'Products'). */
    category?: string
    /** Multiple categories (OR). When set, category is ignored. */
    categories?: string[]
    /** Single subcategory filter. */
    subcategory?: string
    /** Multiple subcategories (OR). When set, subcategory is ignored. */
    subcategories?: string[]
    sort?: MarketplaceSortOption
    page?: number
    pageSize?: number
}

export interface SearchMarketplaceListingsResult {
    data: MarketplaceListing[]
    totalCount: number
    hasMore: boolean
    /** Per-category totals scoped to the same search/filter context (excludes pagination). */
    categoryCounts: Record<string, number>
}

/**
 * Paginated server-side search for marketplace listings.
 *
 * @description Uses Postgres full-text search (search_vector) when query is provided,
 * with optional category/subcategory filters and server-side sort. Returns one page
 * of results and total count for infinite scroll.
 *
 * @param {SearchMarketplaceListingsParams} params - Search filters, sort, and pagination
 * @returns {Promise<SearchMarketplaceListingsResult>} Page of listings plus total count and hasMore
 */
export async function searchMarketplaceListings(
    params: SearchMarketplaceListingsParams
): Promise<SearchMarketplaceListingsResult> {
    const supabase = await createClient()
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? MARKETPLACE_PAGE_SIZE))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = supabase.from('marketplace_listings').select('*', { count: 'exact' })

    const queryTrimmed = params.query?.trim()
    if (queryTrimmed) {
        query = query.textSearch('search_vector', queryTrimmed, {
            type: 'websearch',
            config: 'english',
        })
    }

    if (params.categories?.length) {
        query = query.in('category', params.categories as ("People" | "Products" | "Services")[])
    } else if (params.category) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = query.eq('category', params.category as any)
    }
    if (params.subcategories?.length) {
        query = query.in('subcategory', params.subcategories)
    } else if (params.subcategory) {
        query = query.eq('subcategory', params.subcategory)
    }

    const sort = params.sort ?? 'verified'
    switch (sort) {
        case 'rating':
            // Order by rating (in attributes) desc; nulls last. PostgREST: attributes->>key.
            query = query.order('attributes->>rating_average', { ascending: false, nullsFirst: false })
            query = query.order('is_verified', { ascending: false }).order('created_at', { ascending: false })
            break
        case 'price_asc':
            query = query.order('attributes->>rate', { ascending: true, nullsFirst: false })
            query = query.order('is_verified', { ascending: false }).order('created_at', { ascending: false })
            break
        case 'price_desc':
            query = query.order('attributes->>rate', { ascending: false, nullsFirst: false })
            query = query.order('is_verified', { ascending: false }).order('created_at', { ascending: false })
            break
        case 'newest':
            query = query.order('created_at', { ascending: false })
            query = query.order('is_verified', { ascending: false })
            break
        case 'relevance':
        case 'verified':
        default:
            query = query.order('is_verified', { ascending: false }).order('created_at', { ascending: false })
    }

    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
        console.error('[Marketplace] searchMarketplaceListings error:', error)
        return { data: [], totalCount: 0, hasMore: false, categoryCounts: {} }
    }

    let totalCount = count ?? 0
    let listings = (data || []) as MarketplaceListing[]
    let hasMore = from + listings.length < totalCount

    // Hybrid search: when full-text returns few results and we have a query, add semantic matches
    if (
        queryTrimmed &&
        page === 1 &&
        listings.length < SEMANTIC_FALLBACK_THRESHOLD
    ) {
        const embedding = await embedText(queryTrimmed)
        if (embedding) {
            const { data: semanticData } = await supabase.rpc('match_marketplace_listings', {
                query_embedding: JSON.stringify(embedding),
                match_threshold: 0.4,
                match_count: SEMANTIC_FALLBACK_MATCH_COUNT,
            })
            const semanticRows = (semanticData ?? []) as { id: string }[]
            const semanticIds = semanticRows.map((r) => r.id)
            if (semanticIds.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let semQuery = supabase.from('marketplace_listings').select('*').in('id', semanticIds)
                if (params.categories?.length) {
                    semQuery = semQuery.in('category', params.categories as ("People" | "Products" | "Services")[])
                } else if (params.category) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    semQuery = semQuery.eq('category', params.category as any)
                }
                if (params.subcategories?.length) {
                    semQuery = semQuery.in('subcategory', params.subcategories)
                } else if (params.subcategory) {
                    semQuery = semQuery.eq('subcategory', params.subcategory)
                }
                const { data: semanticListings } = await semQuery
                const fullSemantic = (semanticListings ?? []) as MarketplaceListing[]
                const idToIndex = new Map(semanticIds.map((id, i) => [id, i]))
                fullSemantic.sort((a, b) => (idToIndex.get(a.id) ?? 999) - (idToIndex.get(b.id) ?? 999))
                const ftIds = new Set(listings.map((l) => l.id))
                const semanticOnly = fullSemantic.filter((l) => !ftIds.has(l.id))
                const merged = [...listings, ...semanticOnly].slice(0, pageSize)
                listings = merged
                totalCount = totalCount + semanticOnly.length
                hasMore = totalCount > pageSize
            }
        }
    }

    // INTENT: Fetch per-category counts so the UI pills show real totals, not just
    // the count from the loaded page. Uses the same text-search filter but grouped
    // by category, scoped to the allowed categories.
    const countCategories = params.categories ?? ['People', 'Products', 'Services']
    const categoryCountPromises = countCategories.map(async (cat) => {
        let cq = supabase.from('marketplace_listings').select('id', { count: 'exact', head: true })
        if (queryTrimmed) {
            cq = cq.textSearch('search_vector', queryTrimmed, { type: 'websearch', config: 'english' })
        }
        if (params.subcategories?.length) {
            cq = cq.in('subcategory', params.subcategories)
        } else if (params.subcategory) {
            cq = cq.eq('subcategory', params.subcategory)
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cq = cq.eq('category', cat as any)
        const { count: c } = await cq
        return [cat, c ?? 0] as const
    })
    const countEntries = await Promise.all(categoryCountPromises)
    const categoryCounts: Record<string, number> = Object.fromEntries(countEntries)

    return { data: listings, totalCount, hasMore, categoryCounts }
}

/**
 * Fetches marketplace listings, optionally filtered by category.
 *
 * @description Queries marketplace_listings with optional category filter, ordered
 * by verification status (verified first), limited to 200 results. Does not require
 * foundry context — uses a raw Supabase client. Prefer searchMarketplaceListings()
 * for paginated search.
 *
 * @param {string} [category] - Optional category filter (e.g., 'People', 'Products')
 * @returns {Promise<MarketplaceListing[]>} Array of marketplace listings
 */
export async function getMarketplaceListings(category?: string) {
    const supabase = await createClient()

    let query = supabase
        .from('marketplace_listings')
        .select('*')
        .order('is_verified', { ascending: false })
        .limit(200)

    if (category) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = query.eq('category', category as any)
    }

    const { data, error } = await query

    if (error) {
        console.error('Marketplace Fetch Error:', error)
        return []
    }

    return (data || []) as MarketplaceListing[]
}

// ==========================================
// MARKETPLACE RECOMMENDATIONS
// ==========================================

export interface MarketplaceRecommendation {
    id: string
    source_type: 'advisory' | 'coverage_gap' | 'ai_suggestion' | 'manual'
    category: 'People' | 'Products' | 'Services' | 'AI'
    subcategory: string | null
    search_term: string | null
    reasoning: string | null
    priority: number
    created_at: string
}

/**
 * Retrieves marketplace recommendations for the current foundry.
 *
 * @description Calls the get_marketplace_recommendations Postgres RPC function
 * to fetch prioritized recommendations based on advisory, coverage gaps, AI
 * suggestions, and manual entries.
 *
 * @param {number} [limit=10] - Maximum number of recommendations to return
 * @returns {Promise<{ data: MarketplaceRecommendation[]; error: string | null }>}
 *   Array of recommendations or error
 *
 * @security Requires authenticated user with foundry membership via withAuth.
 *   Scoped to the caller's foundry via RPC parameter.
 */
export async function getMarketplaceRecommendations(limit: number = 10) {
    return withAuth(async ({ supabase, foundryId }) => {
        try {
            const { data, error } = await supabase.rpc('get_marketplace_recommendations', {
                p_foundry_id: foundryId,
                p_limit: limit
            })

            if (error) {
                console.error('Error fetching marketplace recommendations:', error)
                return { data: [] as MarketplaceRecommendation[], error: error.message }
            }

            return { data: (data || []) as MarketplaceRecommendation[], error: null }
        } catch (err) {
            console.error('Failed to fetch marketplace recommendations:', err)
            return { data: [] as MarketplaceRecommendation[], error: 'Failed to fetch recommendations' }
        }
    })
}

/**
 * Generates marketplace recommendations from blueprint coverage gaps.
 *
 * @description Calls the generate_gap_recommendations Postgres RPC function to
 * analyze the foundry's blueprint coverage and create recommendations for
 * uncovered areas.
 *
 * @returns {Promise<{ count: number; error: string | null }>} Number of recommendations
 *   generated, or error
 *
 * @security Requires authenticated user with foundry membership via withAuth.
 *   Scoped to the caller's foundry via RPC parameter.
 */
export async function generateGapRecommendations() {
    return withAuth(async ({ supabase, foundryId }) => {
        try {
            const { data, error } = await supabase.rpc('generate_gap_recommendations', {
                p_foundry_id: foundryId
            })

            if (error) {
                console.error('Error generating gap recommendations:', error)
                return { count: 0, error: error.message }
            }

            revalidatePath('/marketplace')
            return { count: data || 0, error: null }
        } catch (err) {
            console.error('Failed to generate gap recommendations:', err)
            return { count: 0, error: 'Failed to generate recommendations' }
        }
    })
}

/**
 * Dismisses a marketplace recommendation so it no longer appears.
 *
 * @description Sets is_dismissed = true with a timestamp and the dismissing user's ID
 * on the recommendation record. Only affects recommendations in the caller's foundry.
 *
 * @param {string} recommendationId - The recommendation ID to dismiss
 * @returns {Promise<{ success: boolean; error: string | null }>} Success status or error
 *
 * @security Requires authenticated user with foundry membership via withAuth.
 *   Foundry isolation enforced via foundry_id filter.
 */
export async function dismissRecommendation(recommendationId: string) {
    return withAuth(async ({ supabase, user, foundryId }) => {
        try {
            const { error } = await supabase
                .from('marketplace_recommendations')
                .update({
                    is_dismissed: true,
                    dismissed_at: new Date().toISOString(),
                    dismissed_by: user.id
                })
                .eq('id', recommendationId)
                .eq('foundry_id', foundryId)

            if (error) {
                console.error('Error dismissing recommendation:', error)
                return { success: false, error: error.message }
            }

            revalidatePath('/marketplace')
            return { success: true, error: null }
        } catch (err) {
            console.error('Failed to dismiss recommendation:', err)
            return { success: false, error: 'Failed to dismiss recommendation' }
        }
    })
}

/**
 * Creates a manual marketplace recommendation for the foundry.
 *
 * @description Inserts a recommendation with source_type='manual' and the provided
 * category, search term, reasoning, and priority. Used when a user explicitly
 * identifies a marketplace need.
 *
 * @param {Object} data - Recommendation details
 * @param {'People' | 'Products' | 'Services' | 'AI'} data.category - Marketplace category
 * @param {string} [data.subcategory] - Optional subcategory filter
 * @param {string} data.searchTerm - The search term for the recommendation
 * @param {string} [data.reasoning] - Optional explanation for the recommendation
 * @param {number} [data.priority] - Priority score (default: 50)
 * @returns {Promise<{ success: boolean; error: string | null }>} Success status or error
 *
 * @security Requires authenticated user with foundry membership via withAuth.
 */
export async function createManualRecommendation(data: {
    category: 'People' | 'Products' | 'Services' | 'AI'
    subcategory?: string
    searchTerm: string
    reasoning?: string
    priority?: number
}) {
    return withAuth(async ({ supabase, foundryId }) => {
        try {
            const { error } = await supabase
                .from('marketplace_recommendations')
                .insert({
                    foundry_id: foundryId,
                    source_type: 'manual',
                    category: data.category,
                    subcategory: data.subcategory || null,
                    search_term: data.searchTerm,
                    reasoning: data.reasoning || null,
                    priority: data.priority || 50
                })

            if (error) {
                console.error('Error creating manual recommendation:', error)
                return { success: false, error: error.message }
            }

            revalidatePath('/marketplace')
            return { success: true, error: null }
        } catch (err) {
            console.error('Failed to create manual recommendation:', err)
            return { success: false, error: 'Failed to create recommendation' }
        }
    })
}

// ==========================================
// SAVED LISTINGS (User Favorites)
// ==========================================

/**
 * Save a marketplace listing to user's favorites
 * 
 * @param listingId - The marketplace listing ID to save
 * @returns Success status and error message if failed
 * 
 * @security User can only save to their own favorites (enforced by RLS)
 * @audit Creates record in saved_marketplace_listings table
 */
export async function saveMarketplaceListing(listingId: string) {
    return withUser(async ({ supabase, user }) => {
        try {
            // VALIDATION: Check listing exists
            const { data: listing } = await supabase
                .from('marketplace_listings')
                .select('id')
                .eq('id', listingId)
                .single()

            if (!listing) {
                return { success: false, error: 'Listing not found' }
            }

            // Insert saved listing
            const { error } = await supabase
                .from('saved_marketplace_listings')
                .insert({
                    user_id: user.id,
                    listing_id: listingId
                })

            if (error) {
                // Unique constraint violation - already saved
                if (error.code === '23505') {
                    return { success: true, error: null } // Treat as success
                }
                console.error('[saveMarketplaceListing] Error:', error)
                return { success: false, error: 'Failed to save listing' }
            }

            revalidatePath('/marketplace')
            return { success: true, error: null }
        } catch (err) {
            console.error('[saveMarketplaceListing] Exception:', err)
            return { success: false, error: 'Failed to save listing' }
        }
    })
}

/**
 * Unsave a marketplace listing from user's favorites
 * 
 * @param listingId - The marketplace listing ID to unsave
 * @returns Success status and error message if failed
 * 
 * @security User can only unsave their own favorites (enforced by RLS)
 * @audit Removes record from saved_marketplace_listings table
 */
export async function unsaveMarketplaceListing(listingId: string) {
    return withUser(async ({ supabase, user }) => {
        try {
            const { error } = await supabase
                .from('saved_marketplace_listings')
                .delete()
                .eq('user_id', user.id)
                .eq('listing_id', listingId)

            if (error) {
                console.error('[unsaveMarketplaceListing] Error:', error)
                return { success: false, error: 'Failed to unsave listing' }
            }

            revalidatePath('/marketplace')
            return { success: true, error: null }
        } catch (err) {
            console.error('[unsaveMarketplaceListing] Exception:', err)
            return { success: false, error: 'Failed to unsave listing' }
        }
    })
}

/**
 * Get all saved marketplace listings for the current user
 * 
 * @returns Array of saved marketplace listings with full details
 * 
 * @security RLS ensures users only see their own saved listings
 */
export async function getSavedMarketplaceListings() {
    return withUser(async ({ supabase, user }) => {
        try {
            // Get saved listing IDs
            const { data: savedListings, error: savedError } = await supabase
                .from('saved_marketplace_listings')
                .select('listing_id, created_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })

            if (savedError) {
                console.error('[getSavedMarketplaceListings] Error fetching saved:', savedError)
                return { data: [] as MarketplaceListing[], error: 'Failed to fetch saved listings' }
            }

            if (!savedListings || savedListings.length === 0) {
                return { data: [] as MarketplaceListing[], error: null }
            }

            // Get full listing details
            const listingIds = savedListings.map(s => s.listing_id)
            const { data: listings, error: listingsError } = await supabase
                .from('marketplace_listings')
                .select('*')
                .in('id', listingIds)

            if (listingsError) {
                console.error('[getSavedMarketplaceListings] Error fetching listings:', listingsError)
                return { data: [] as MarketplaceListing[], error: 'Failed to fetch listing details' }
            }

            return { data: (listings || []) as MarketplaceListing[], error: null }
        } catch (err) {
            console.error('[getSavedMarketplaceListings] Exception:', err)
            return { data: [] as MarketplaceListing[], error: 'Failed to fetch saved listings' }
        }
    })
}

/**
 * Check if user has saved specific listings (for UI state)
 * 
 * @param listingIds - Array of listing IDs to check
 * @returns Set of saved listing IDs
 * 
 * @security RLS ensures users only see their own saved status
 */
export async function getSavedListingIds(listingIds: string[]) {
    if (listingIds.length === 0) return new Set<string>()

    return withUser(async ({ supabase, user }) => {
        try {
            const { data, error } = await supabase
                .from('saved_marketplace_listings')
                .select('listing_id')
                .eq('user_id', user.id)
                .in('listing_id', listingIds)

            if (error) {
                console.error('[getSavedListingIds] Error:', error)
                return new Set<string>()
            }

            return new Set((data || []).map(d => d.listing_id))
        } catch (err) {
            console.error('[getSavedListingIds] Exception:', err)
            return new Set<string>()
        }
    })
}
