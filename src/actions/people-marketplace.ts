"use server"

import { createClient } from "@/lib/supabase/server"
import { withAuth, withUser } from '@/lib/server-action-utils'
import { getBaseUrl } from '@/lib/domains'
import type { MarketplaceListing } from './marketplace'

/**
 * Trust signals and social proof data for a People marketplace listing.
 *
 * @description Aggregated data from provider_ratings, provider_badges,
 * provider_portfolio, and foundry_stack tables to enrich People cards
 * with credibility indicators.
 */
export interface PersonTrustData {
    /** Average rating from reviews (1-5) */
    averageRating: number | null
    /** Total number of reviews */
    totalReviews: number
    /** Total completed transactions/bookings */
    totalTransactions: number
    /** Earned badges (fast_responder, top_rated, verified_partner, etc.) */
    badges: string[]
    /** Portfolio thumbnail URLs (first 3) */
    portfolioThumbnails: string[]
    /** Number of foundries that have this person in their stack */
    trustedByCount: number
    /** Average response time in hours */
    responseTimeHours: number | null
    /** Number of endorsements received */
    endorsementCount: number
}

/**
 * Enriched People listing with trust signals and social proof.
 */
export interface EnrichedPersonListing extends MarketplaceListing {
    trustData: PersonTrustData
}

/**
 * Fetches People marketplace listings enriched with trust signals.
 *
 * @description Queries marketplace_listings filtered to People category,
 * then enriches each listing with ratings, badges, portfolio thumbnails,
 * and social proof from related tables.
 *
 * @returns {Promise<EnrichedPersonListing[]>} People listings with trust data
 *
 * @security Requires authenticated user. Listing data is public-read via RLS.
 */
export async function getEnrichedPeopleListings(): Promise<EnrichedPersonListing[]> {
    const supabase = await createClient()

    // AUTH: Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Fetch People listings
    const { data: listings, error } = await supabase
        .from('marketplace_listings')
        .select('*')
        .eq('category', 'People')
        .order('is_verified', { ascending: false })
        .limit(200)

    if (error || !listings) {
        console.error('[PeopleMarketplace] Failed to fetch listings:', error)
        return []
    }

    // Get provider IDs linked to these listings
    const listingIds = listings.map(l => l.id)

    // Fetch trust data in parallel for performance
    const [ratingsResult, badgesResult, portfolioResult, stackResult] = await Promise.allSettled([
        // Ratings from provider_ratings (keyed by provider_id, not listing_id)
        supabase
            .from('provider_ratings')
            .select('provider_id, average_rating, total_reviews, total_transactions')
            .in('provider_id', listingIds),
        // Badges from provider_badges
        supabase
            .from('provider_badges')
            .select('provider_id, badge_type')
            .in('provider_id', listingIds),
        // Portfolio thumbnails (first 3 per provider) - column is image_urls (array)
        supabase
            .from('provider_portfolio')
            .select('provider_id, image_urls')
            .in('provider_id', listingIds)
            .eq('is_featured', true)
            .limit(100),
        // Foundry stack count (how many foundries trust this person)
        supabase
            .from('foundry_stack')
            .select('provider_id')
            .in('provider_id', listingIds),
    ])

    // Build lookup maps
    const ratingsMap = new Map<string, {
        average_rating: number | null
        total_reviews: number | null
        total_transactions: number | null
    }>()
    if (ratingsResult.status === 'fulfilled' && ratingsResult.value.data) {
        for (const r of ratingsResult.value.data) {
            ratingsMap.set(r.provider_id, r)
        }
    }

    const badgesMap = new Map<string, string[]>()
    if (badgesResult.status === 'fulfilled' && badgesResult.value.data) {
        for (const b of badgesResult.value.data) {
            const existing = badgesMap.get(b.provider_id) || []
            existing.push(b.badge_type)
            badgesMap.set(b.provider_id, existing)
        }
    }

    const portfolioMap = new Map<string, string[]>()
    if (portfolioResult.status === 'fulfilled' && portfolioResult.value.data) {
        for (const p of portfolioResult.value.data) {
            const existing = portfolioMap.get(p.provider_id) || []
            // image_urls is an array of URLs
            const urls = (p.image_urls as string[] | null) || []
            for (const url of urls) {
                if (existing.length < 3 && url) {
                    existing.push(url)
                }
            }
            portfolioMap.set(p.provider_id, existing)
        }
    }

    const stackCountMap = new Map<string, number>()
    if (stackResult.status === 'fulfilled' && stackResult.value.data) {
        for (const s of stackResult.value.data) {
            if (s.provider_id) {
                stackCountMap.set(s.provider_id, (stackCountMap.get(s.provider_id) || 0) + 1)
            }
        }
    }

    // Enrich listings
    return listings.map(listing => {
        const ratings = ratingsMap.get(listing.id)
        const trustData: PersonTrustData = {
            averageRating: ratings?.average_rating ?? null,
            totalReviews: ratings?.total_reviews ?? 0,
            totalTransactions: ratings?.total_transactions ?? 0,
            badges: badgesMap.get(listing.id) || [],
            portfolioThumbnails: portfolioMap.get(listing.id) || [],
            trustedByCount: stackCountMap.get(listing.id) || 0,
            responseTimeHours: null, // provider_ratings table doesn't have this column yet
            endorsementCount: 0, // Will be populated after endorsements table is created
        }

        return {
            ...listing,
            trustData,
        } as EnrichedPersonListing
    })
}

/**
 * AI-powered talent matching with scored results.
 *
 * @description Takes a natural language query, uses AI to extract requirements,
 * then scores each People listing against those requirements. Returns top matches
 * with match scores and reasoning.
 *
 * @param {string} query - Natural language description of who the user needs
 * @returns {Promise<TalentMatchResult>} Scored matches with reasoning
 *
 * @security Requires authenticated user. Rate-limited via AI guard.
 */
export interface TalentMatch {
    listing: EnrichedPersonListing
    matchScore: number
    matchReasons: string[]
    highlightedSkills: string[]
}

export interface TalentMatchResult {
    matches: TalentMatch[]
    explanation: string
    error: string | null
}

export async function findTalentMatches(query: string): Promise<TalentMatchResult> {
    return withUser(async ({ supabase, user }) => {
        if (!query || query.trim().length < 3) {
            return { matches: [], explanation: '', error: 'Query too short' }
        }

        // Fetch all People listings with trust data
        const enrichedListings = await getEnrichedPeopleListings()

        if (enrichedListings.length === 0) {
            return { matches: [], explanation: 'No talent listings available yet.', error: null }
        }

        // Call AI to extract requirements and score matches
        try {
            const response = await fetch(`${getBaseUrl()}/api/marketplace/talent-match`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Forward auth cookie for the API route
                    'Cookie': '', // Server action context - API route will re-auth
                },
                body: JSON.stringify({
                    query: query.trim(),
                    listings: enrichedListings.map(l => ({
                        id: l.id,
                        title: l.title,
                        description: l.description,
                        subcategory: l.subcategory,
                        attributes: l.attributes,
                        is_verified: l.is_verified,
                        trustData: l.trustData,
                    })),
                }),
            })

            if (!response.ok) {
                // Fallback: simple keyword matching
                return performKeywordMatching(query, enrichedListings)
            }

            const result = await response.json()
            if (!result.success) {
                return performKeywordMatching(query, enrichedListings)
            }

            // Map AI scores back to enriched listings
            const scoredMatches: TalentMatch[] = (result.matches || [])
                .map((m: { id: string; score: number; reasons: string[]; highlightedSkills: string[] }) => {
                    const listing = enrichedListings.find(l => l.id === m.id)
                    if (!listing) return null
                    return {
                        listing,
                        matchScore: m.score,
                        matchReasons: m.reasons,
                        highlightedSkills: m.highlightedSkills,
                    }
                })
                .filter(Boolean)
                .slice(0, 5)

            return {
                matches: scoredMatches as TalentMatch[],
                explanation: result.explanation || '',
                error: null,
            }
        } catch (err) {
            console.error('[PeopleMarketplace] AI matching failed, falling back to keyword:', err)
            return performKeywordMatching(query, enrichedListings)
        }
    }) as Promise<TalentMatchResult>
}

/**
 * Fallback keyword-based matching when AI is unavailable.
 *
 * @description Scores listings based on keyword overlap between the query
 * and listing title, description, skills, and expertise fields.
 */
function performKeywordMatching(
    query: string,
    listings: EnrichedPersonListing[]
): TalentMatchResult {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)

    const scored = listings.map(listing => {
        const searchableText = [
            listing.title,
            listing.description,
            listing.subcategory,
            ...(listing.attributes?.skills || []),
            ...(listing.attributes?.expertise || []),
            listing.attributes?.role || '',
            listing.attributes?.location || '',
            ...(listing.attributes?.industries || []),
            ...(listing.attributes?.previous_companies || []),
        ].join(' ').toLowerCase()

        let score = 0
        const matchedWords: string[] = []

        for (const word of queryWords) {
            if (searchableText.includes(word)) {
                score += 10
                matchedWords.push(word)
            }
        }

        // Boost verified listings
        if (listing.is_verified) score += 5
        // Boost highly rated
        if (listing.trustData.averageRating && listing.trustData.averageRating >= 4.5) score += 5
        // Boost those with reviews
        if (listing.trustData.totalReviews > 0) score += 3
        // Boost trusted by multiple foundries
        if (listing.trustData.trustedByCount > 2) score += 3

        // Normalize to 0-100
        const maxPossible = queryWords.length * 10 + 16
        const normalizedScore = Math.min(100, Math.round((score / maxPossible) * 100))

        const skills = listing.attributes?.skills || listing.attributes?.expertise || []
        const highlightedSkills = (skills as string[]).filter((s: string) =>
            queryWords.some(w => s.toLowerCase().includes(w))
        )

        return {
            listing,
            matchScore: normalizedScore,
            matchReasons: matchedWords.length > 0
                ? [`Matches keywords: ${matchedWords.join(', ')}`]
                : ['General match based on profile'],
            highlightedSkills,
        }
    })

    const topMatches = scored
        .filter(m => m.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 5)

    return {
        matches: topMatches,
        explanation: `Found ${topMatches.length} potential matches based on your description.`,
        error: null,
    }
}
