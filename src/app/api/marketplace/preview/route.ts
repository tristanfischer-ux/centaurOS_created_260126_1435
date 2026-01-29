import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database.types'

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row']

// Valid role types
type Role = 'founder' | 'executive' | 'apprentice' | 'vc' | 'factory' | 'university'

interface PreviewResponse {
    role: Role
    listings: MarketplaceListing[]
}

interface ErrorResponse {
    error: string
}

// Curation strategies for each role
const CURATION_STRATEGIES: Record<Role, Array<{
    category: Database['public']['Enums']['marketplace_category']
    subcategory?: string
    limit: number
}>> = {
    founder: [
        { category: 'People', subcategory: 'Fractional Executive', limit: 2 },
        { category: 'Products', subcategory: 'Manufacturing', limit: 1 },
        { category: 'Services', subcategory: 'Legal', limit: 1 }
    ],
    executive: [
        { category: 'Services', limit: 2 }, // Advisory/consulting services
        { category: 'AI', limit: 1 },
        { category: 'Services', subcategory: 'Financial', limit: 1 }
    ],
    apprentice: [
        { category: 'AI', limit: 2 },
        { category: 'Services', limit: 1 }, // Training/education services
        { category: 'People', limit: 1 } // Entry-level opportunities
    ],
    vc: [
        { category: 'Products', limit: 3 }, // Hardware startups
        { category: 'Products', subcategory: 'Manufacturing', limit: 1 }
    ],
    factory: [
        { category: 'Products', limit: 3 }, // Active RFQs and product listings
        { category: 'Products', subcategory: 'Materials', limit: 1 }
    ],
    university: [
        { category: 'People', limit: 2 }, // Student opportunities
        { category: 'Services', limit: 1 }, // Research commercialization
        { category: 'People', subcategory: 'Specialist', limit: 1 } // Apprenticeships
    ]
}

/**
 * GET /api/marketplace/preview
 * 
 * Public endpoint that returns curated marketplace listings based on user role.
 * No authentication required - used for landing page previews.
 * 
 * Query params:
 * - role: 'founder' | 'executive' | 'apprentice' | 'vc' | 'factory' | 'university'
 * 
 * Returns 4 curated marketplace listings tailored to the specified role.
 */
export async function GET(
    request: NextRequest
): Promise<NextResponse<PreviewResponse | ErrorResponse>> {
    try {
        // Parse query parameters
        const searchParams = request.nextUrl.searchParams
        const roleParam = searchParams.get('role')?.toLowerCase()

        // Validate role parameter
        const validRoles: Role[] = ['founder', 'executive', 'apprentice', 'vc', 'factory', 'university']
        if (!roleParam || !validRoles.includes(roleParam as Role)) {
            return NextResponse.json(
                { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
                { 
                    status: 400,
                    headers: {
                        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
                    }
                }
            )
        }

        const role = roleParam as Role

        // Create Supabase client (public access, no auth required)
        const supabase = await createClient()

        // Get curation strategy for this role
        const strategy = CURATION_STRATEGIES[role]
        
        // Fetch listings for each part of the strategy
        const allListings: MarketplaceListing[] = []
        
        for (const criteria of strategy) {
            let query = supabase
                .from('marketplace_listings')
                .select('*')
                .eq('category', criteria.category)
                .order('is_verified', { ascending: false })
                
            // Add subcategory filter if specified
            if (criteria.subcategory) {
                query = query.eq('subcategory', criteria.subcategory)
            }
            
            // Order by rating if available in attributes, otherwise by creation date
            query = query.order('created_at', { ascending: false })
            
            // Limit results
            query = query.limit(criteria.limit)

            const { data, error } = await query

            if (error) {
                console.error(`Error fetching listings for ${criteria.category}:`, error)
                continue // Skip this criteria on error, don't fail the whole request
            }

            if (data) {
                allListings.push(...data)
            }
        }

        // If we don't have exactly 4 listings, fill with top-rated verified listings
        if (allListings.length < 4) {
            const needed = 4 - allListings.length
            const existingIds = new Set(allListings.map(l => l.id))
            
            const { data: fillListings } = await supabase
                .from('marketplace_listings')
                .select('*')
                .eq('is_verified', true)
                .order('created_at', { ascending: false })
                .limit(needed * 2) // Get more than needed to filter out duplicates

            if (fillListings) {
                const uniqueFillListings = fillListings
                    .filter(l => !existingIds.has(l.id))
                    .slice(0, needed)
                
                allListings.push(...uniqueFillListings)
            }
        }

        // Ensure we have exactly 4 listings (or fewer if database doesn't have enough)
        const finalListings = allListings.slice(0, 4)

        // Return response with cache headers
        return NextResponse.json(
            {
                role,
                listings: finalListings
            },
            {
                status: 200,
                headers: {
                    'Cache-Control': 'public, max-age=3600, s-maxage=3600', // Cache for 1 hour
                    'Content-Type': 'application/json',
                }
            }
        )

    } catch (error) {
        console.error('Marketplace preview error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch marketplace preview' },
            { 
                status: 500,
                headers: {
                    'Cache-Control': 'no-cache',
                }
            }
        )
    }
}
