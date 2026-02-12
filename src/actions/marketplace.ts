"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { withAuth, withUser, type ActionError } from '@/lib/server-action-utils'



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
    /** Whether this listing is demo/sample data vs a real user's listing */
    is_demo: boolean
    /** Provider profile ID linking to the real user who created this listing */
    created_by_provider_id: string | null
}

/**
 * Fetches marketplace listings, optionally filtered by category.
 *
 * @description Queries marketplace_listings with optional category filter, ordered
 * by verification status (verified first), limited to 200 results. Does not require
 * foundry context — uses a raw Supabase client.
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
