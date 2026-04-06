"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { unstable_cache } from "next/cache"
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
                    tags: (listing.attributes as Record<string, unknown>)?.tags ?? [],
                    hourly_rate_min: (listing.attributes as Record<string, unknown>)?.hourly_rate_min ?? null,
                    hourly_rate_max: (listing.attributes as Record<string, unknown>)?.hourly_rate_max ?? null,
                    delivery_time_days: (listing.attributes as Record<string, unknown>)?.delivery_time_days ?? null,
                    certification_level: (listing.attributes as Record<string, unknown>)?.certification_level ?? null,
                    rating_average: (listing.attributes as Record<string, unknown>)?.rating_average ?? null,
                    total_reviews: (listing.attributes as Record<string, unknown>)?.total_reviews ?? null,
                    total_bookings: (listing.attributes as Record<string, unknown>)?.total_bookings ?? null,
                    response_time_hours: (listing.attributes as Record<string, unknown>)?.response_time_hours ?? null,
                } : null
            }
        })

        return { data, error: null }
    })
}

export type VerificationTier = 'unverified' | 'claimed' | 'verified'

/** Structured process capability from Nightshift deep enrichment pipeline. */
export interface ProcessCapability {
    process_category?: string
    process_name?: string
    materials_worked?: string[]
    tolerance_claimed?: string
    tolerance_value_mm?: number
    surface_finish_claimed?: string
    surface_finish_ra_um?: number
    max_part_dimensions?: string
    batch_size_range?: string
    equipment_mentioned?: string[]
    surface_treatments?: string[]
    confidence?: number
    source_excerpt?: string
}

export interface MarketplaceListing {
    id: string
    category: 'People' | 'Products' | 'Services' | 'AI'
    subcategory: string
    title: string
    description: string
    attributes: Record<string, unknown>
    image_url: string | null
    is_verified: boolean
    /** Three-tier verification: unverified → claimed → verified */
    verification_tier: VerificationTier
    /** Whether this listing is demo/sample data vs a real user's listing */
    is_demo: boolean
    /** Provider profile ID linking to the real user who created this listing */
    created_by_provider_id: string | null
    /** Structured process capabilities from Nightshift deep enrichment. */
    process_capabilities: ProcessCapability[] | null
    /** Industries served (Nightshift enrichment). */
    industries: string[] | null
    /** Certifications held (Nightshift enrichment). */
    certifications: string[] | null
    /** Materials worked with (Nightshift enrichment). */
    materials: string[] | null
    /** Key equipment available (Nightshift enrichment). */
    key_equipment: string[] | null
    /** Financial health summary (Nightshift enrichment). */
    financial_health: string | null
    /** Enrichment quality score from Nightshift. */
    enrichment_quality: string | null
    /** Security clearances held (Nightshift enrichment). */
    security_clearances: string[] | null
    /** Country (Nightshift enrichment). */
    country: string | null
    /** City (Nightshift enrichment). */
    city: string | null
    /** Company size descriptor (Nightshift enrichment). */
    company_size: string | null
    /** Denormalised average rating (1.00–5.00) from marketplace_reviews. */
    average_rating: number | null
    /** Denormalised review count from marketplace_reviews. */
    review_count: number | null
}

/**
 * Explicit column list for marketplace_listings queries.
 * Excludes `embedding` (1536-float vector) and `search_vector` (tsvector)
 * to avoid shipping ~12KB per row to the client.
 */
const LISTING_COLUMNS = [
    'id', 'category', 'subcategory', 'title', 'description', 'attributes',
    'image_url', 'is_verified', 'verification_tier', 'is_demo',
    'created_by_provider_id', 'process_capabilities', 'industries',
    'certifications', 'materials', 'key_equipment', 'financial_health',
    'enrichment_quality', 'security_clearances', 'created_at',
    'data_quality_score', 'average_rating', 'review_count',
    'country', 'city', 'company_size',
].join(', ')

import { MARKETPLACE_PAGE_SIZE } from '@/lib/marketplace-constants'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { headers } from 'next/headers'

/** Max semantic results to fetch during hybrid search. */
const SEMANTIC_MATCH_COUNT = 50

/** Sort options for marketplace search. */
export type MarketplaceSortOption =
    | 'relevance'
    | 'rating'
    | 'price_asc'
    | 'price_desc'
    | 'newest'
    | 'verified'

export interface AdvancedFilters {
    verifiedOnly?: boolean
    minRating?: number
    minExperience?: number
    minRate?: number
    maxRate?: number
    location?: string
    availability?: string
    skills?: string[]
    companyTypes?: string[]
    companySizes?: string[]
    /** Filter by industries (JSONB array in-memory post-filter). */
    industries?: string[]
    /** Filter by certifications (JSONB array in-memory post-filter). */
    certifications?: string[]
}

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
    /** Advanced attribute-based filters. */
    advancedFilters?: AdvancedFilters
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
    // SECURITY: Rate limit search — 60 searches per minute per IP
    // (runs 7+ parallel queries per call, so limit is generous but prevents abuse)
    const headersList = await headers()
    const clientIP = getClientIP(headersList)
    const rl = await rateLimit('aiSearch', clientIP)
    if (!rl.success) {
        return { data: [], totalCount: 0, hasMore: false, categoryCounts: {} }
    }

    const supabase = await createClient()
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? MARKETPLACE_PAGE_SIZE))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase.from('marketplace_listings').select(LISTING_COLUMNS, { count: 'exact' })
        .eq('is_demo', false) // DECISION: Exclude demo/sample listings from marketplace browse

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

    // SECURITY: Sanitize values for use in PostgREST filter expressions.
    const sanitize = (v: string) => v.replace(/[,()\."*]/g, '')
    const escapeLike = (v: string) => v.replace(/%/g, '\\%').replace(/_/g, '\\_')

    // Apply advanced filters
    const af = params.advancedFilters
    if (af) {
        if (af.verifiedOnly) {
            query = query.eq('is_verified', true)
        }
        if (af.minRating != null) {
            query = query.gte('attributes->>rating_average', af.minRating)
        }
        if (af.minExperience != null) {
            query = query.gte('attributes->>years_experience', af.minExperience)
        }
        if (af.location) {
            query = query.ilike('attributes->>location', `%${escapeLike(af.location)}%`)
        }
        if (af.availability) {
            query = query.ilike('attributes->>availability', `%${escapeLike(af.availability)}%`)
        }
        if (af.skills && af.skills.length > 0) {
            // INTENT: Filter by overlap with attributes.expertise array using JSONB containment.
            // SECURITY: Sanitize to prevent PostgREST filter injection via crafted skill strings.
            const skillFilters = af.skills.map(
                (skill) => `attributes->expertise.cs.["${sanitize(skill)}"]`
            ).join(',')
            query = query.or(skillFilters)
        }
        if (af.companyTypes && af.companyTypes.length > 0) {
            // SECURITY: Sanitize to prevent PostgREST filter injection
            const typeFilters = af.companyTypes.map(
                (t) => `attributes->>company_type.ilike.%${sanitize(t)}%`
            ).join(',')
            query = query.or(typeFilters)
        }
        if (af.companySizes && af.companySizes.length > 0) {
            // SECURITY: Sanitize to prevent PostgREST filter injection
            const sizeFilters = af.companySizes.flatMap((s) => [
                `attributes->>ch_company_size.ilike.%${sanitize(s)}%`,
                `attributes->>company_size.ilike.%${sanitize(s)}%`,
            ]).join(',')
            query = query.or(sizeFilters)
        }
        // DECISION: Move certification and industry filtering to DB level using JSONB
        // containment. The old post-filter approach was broken with pagination — it
        // filtered AFTER fetching a page, producing wrong counts and incomplete pages.
        if (af.industries && af.industries.length > 0) {
            // Build OR filter: listing matches if its industries array contains ANY of the wanted industries
            const industryFilters = af.industries.map(ind => `industries.cs.["${sanitize(ind)}"]`).join(',')
            query = query.or(industryFilters)
        }
        if (af.certifications && af.certifications.length > 0) {
            const certFilters = af.certifications.map(c => `certifications.cs.["${sanitize(c)}"]`).join(',')
            query = query.or(certFilters)
        }
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
            // DECISION: Verified first, then relevance_score (Nightshift quality metric),
            // then data_quality_score as tiebreaker. Verified listings always rank above
            // unverified. nullsFirst: true so listings without Nightshift data don't
            // get penalised — they just sort by the next criteria.
            query = query
                .order('is_verified', { ascending: false })
                .order('relevance_score', { ascending: false, nullsFirst: true })
                .order('data_quality_score', { ascending: false })
                .order('created_at', { ascending: false })
    }

    query = query.range(from, to)

    // INTENT: Always run semantic search in parallel with FTS when a query is present.
    // This promotes semantic matching from a fallback to a first-class hybrid search.
    const embeddingPromise = queryTrimmed && page === 1
        ? embedText(queryTrimmed)
        : Promise.resolve(null)

    const [ftsResult, embedding] = await Promise.all([query, embeddingPromise])

    const { data, error, count } = ftsResult

    if (error) {
        console.error('[Marketplace] searchMarketplaceListings error:', error)
        return { data: [], totalCount: 0, hasMore: false, categoryCounts: {} }
    }

    let totalCount = count ?? 0
    let listings = (data || []) as unknown as MarketplaceListing[]
    let hasMore = from + listings.length < totalCount

    // Merge semantic results (deduplicated) when embedding was generated
    if (embedding && page === 1) {
        const { data: semanticData } = await supabase.rpc('match_marketplace_listings', {
            query_embedding: JSON.stringify(embedding),
            match_threshold: 0.4,
            match_count: SEMANTIC_MATCH_COUNT,
        })
        const semanticRows = (semanticData ?? []) as { id: string }[]
        const semanticIds = semanticRows.map((r) => r.id)
        if (semanticIds.length > 0) {
            let semQuery = supabase.from('marketplace_listings').select(LISTING_COLUMNS).in('id', semanticIds)
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
            // Apply same advanced filters to semantic results
            if (af) {
                if (af.verifiedOnly) semQuery = semQuery.eq('is_verified', true)
                if (af.minRating != null) semQuery = semQuery.gte('attributes->>rating_average', af.minRating)
                if (af.minExperience != null) semQuery = semQuery.gte('attributes->>years_experience', af.minExperience)
                if (af.location) semQuery = semQuery.ilike('attributes->>location', `%${escapeLike(af.location)}%`)
                if (af.availability) semQuery = semQuery.ilike('attributes->>availability', `%${escapeLike(af.availability)}%`)
                if (af.companyTypes && af.companyTypes.length > 0) {
                    const typeFilters = af.companyTypes.map((t) => `attributes->>company_type.ilike.%${sanitize(t)}%`).join(',')
                    semQuery = semQuery.or(typeFilters)
                }
                if (af.companySizes && af.companySizes.length > 0) {
                    const sizeFilters = af.companySizes.flatMap((s) => [
                        `attributes->>ch_company_size.ilike.%${sanitize(s)}%`,
                        `attributes->>company_size.ilike.%${sanitize(s)}%`,
                    ]).join(',')
                    semQuery = semQuery.or(sizeFilters)
                }
            }
            const { data: semanticListings } = await semQuery
            const fullSemantic = (semanticListings ?? []) as unknown as MarketplaceListing[]
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

    // Post-filter rate range client-side (rates stored as inconsistent strings like "1,200/day")
    if (af && (af.minRate != null || af.maxRate != null)) {
        listings = listings.filter((l) => {
            const rateStr = (l.attributes as Record<string, unknown>)?.rate
            if (typeof rateStr !== 'string') return af.minRate == null
            const numeric = parseFloat(rateStr.replace(/[^0-9.]/g, ''))
            if (isNaN(numeric)) return af.minRate == null
            if (af.minRate != null && numeric < af.minRate) return false
            if (af.maxRate != null && numeric > af.maxRate) return false
            return true
        })
    }

    // INTENT: Fetch per-category counts so the UI pills show real totals, not just
    // the count from the loaded page. Uses the same text-search filter but grouped
    // by category, scoped to the allowed categories. Also applies advanced filters.
    const countCategories = params.categories ?? ['People', 'Products', 'Services']
    const categoryCountPromises = countCategories.map(async (cat) => {
        let cq = supabase.from('marketplace_listings').select('id', { count: 'exact', head: true })
            .eq('is_demo', false)
        if (queryTrimmed) {
            cq = cq.textSearch('search_vector', queryTrimmed, { type: 'websearch', config: 'english' })
        }
        if (params.subcategories?.length) {
            cq = cq.in('subcategory', params.subcategories)
        } else if (params.subcategory) {
            cq = cq.eq('subcategory', params.subcategory)
        }
        // Apply advanced filters to counts too
        if (af) {
            if (af.verifiedOnly) cq = cq.eq('is_verified', true)
            if (af.minRating != null) cq = cq.gte('attributes->>rating_average', af.minRating)
            if (af.minExperience != null) cq = cq.gte('attributes->>years_experience', af.minExperience)
            if (af.location) cq = cq.ilike('attributes->>location', `%${escapeLike(af.location)}%`)
            if (af.availability) cq = cq.ilike('attributes->>availability', `%${escapeLike(af.availability)}%`)
            if (af.companyTypes && af.companyTypes.length > 0) {
                const typeFilters = af.companyTypes.map((t) => `attributes->>company_type.ilike.%${sanitize(t)}%`).join(',')
                cq = cq.or(typeFilters)
            }
            if (af.companySizes && af.companySizes.length > 0) {
                const sizeFilters = af.companySizes.flatMap((s) => [
                    `attributes->>ch_company_size.ilike.%${sanitize(s)}%`,
                    `attributes->>company_size.ilike.%${sanitize(s)}%`,
                ]).join(',')
                cq = cq.or(sizeFilters)
            }
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
        .select(LISTING_COLUMNS)
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

    return (data || []) as unknown as MarketplaceListing[]
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
                return { data: [] as MarketplaceRecommendation[], error: sanitizeErrorMessage(error) }
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
                return { count: 0, error: sanitizeErrorMessage(error) }
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
                return { success: false, error: sanitizeErrorMessage(error) }
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
            // SECURITY: Validate input bounds
            if (data.searchTerm.length > 500) return { success: false, error: 'Search term too long (max 500)' }
            if (data.reasoning && data.reasoning.length > 2000) return { success: false, error: 'Reasoning too long (max 2000)' }
            const safePriority = Math.min(Math.max(data.priority || 50, 0), 100)

            const { error } = await supabase
                .from('marketplace_recommendations')
                .insert({
                    foundry_id: foundryId,
                    source_type: 'manual',
                    category: data.category,
                    subcategory: data.subcategory || null,
                    search_term: data.searchTerm,
                    reasoning: data.reasoning || null,
                    priority: safePriority
                })

            if (error) {
                console.error('Error creating manual recommendation:', error)
                return { success: false, error: sanitizeErrorMessage(error) }
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
                .select(LISTING_COLUMNS)
                .in('id', listingIds)

            if (listingsError) {
                console.error('[getSavedMarketplaceListings] Error fetching listings:', listingsError)
                return { data: [] as MarketplaceListing[], error: 'Failed to fetch listing details' }
            }

            return { data: (listings || []) as unknown as MarketplaceListing[], error: null }
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
    // SECURITY: Cap array size to prevent oversized IN clause
    if (listingIds.length > 500) return new Set<string>()

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

// ==========================================
// SIMILAR LISTINGS (Semantic)
// ==========================================

/**
 * Fetches semantically similar marketplace listings using vector embeddings.
 *
 * @description Reads the listing's embedding, calls match_marketplace_listings RPC
 * to find similar listings, excludes the source listing, and returns top N results.
 * Results are cached for 10 minutes per listing ID to avoid repeated RPC calls.
 *
 * @param {string} listingId - The listing ID to find similar listings for
 * @param {number} [limit=4] - Maximum number of similar listings to return
 * @returns {Promise<MarketplaceListing[]>} Array of similar marketplace listings
 */
export async function getSimilarListings(listingId: string, limit: number = 4): Promise<MarketplaceListing[]> {
    const cached = unstable_cache(
        async (id: string, lim: number) => {
            const supabase = await createClient()

            // Fetch only the embedding column for the source listing
            const { data: source, error: sourceError } = await supabase
                .from('marketplace_listings')
                .select('embedding')
                .eq('id', id)
                .single()

            if (sourceError || !source?.embedding) {
                return []
            }

            // Call RPC for semantic matches
            const { data: matches, error: matchError } = await supabase.rpc('match_marketplace_listings', {
                query_embedding: JSON.stringify(source.embedding),
                match_threshold: 0.5,
                match_count: lim + 1, // +1 to account for self-match
            })

            if (matchError || !matches || matches.length === 0) {
                return []
            }

            // Get matched IDs excluding self
            const matchedIds = (matches as { id: string }[])
                .map((m) => m.id)
                .filter((mid) => mid !== id)
                .slice(0, lim)

            if (matchedIds.length === 0) return []

            // Hydrate full listing data (exclude embedding to avoid shipping vectors to client)
            const { data: listings, error: listingsError } = await supabase
                .from('marketplace_listings')
                .select(LISTING_COLUMNS)
                .in('id', matchedIds)

            if (listingsError || !listings) return []

            // Preserve RPC ranking order
            const idOrder = new Map(matchedIds.map((mid, i) => [mid, i]))
            const sorted = (listings as unknown as MarketplaceListing[]).sort(
                (a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999)
            )

            return sorted
        },
        [`similar-listings-${listingId}`],
        { revalidate: 600 } // 10-minute TTL
    )

    return cached(listingId, limit)
}
