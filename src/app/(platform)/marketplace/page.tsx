import { Suspense } from 'react'
import { getMarketplaceListings } from '@/actions/marketplace'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { MarketplaceView } from './marketplace-view'
import { Skeleton } from '@/components/ui/skeleton'

// Force dynamic since we're fetching data that might change
export const dynamic = 'force-dynamic'

// Loading skeleton for marketplace
function MarketplaceLoading() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-12 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-64 w-full rounded-lg" />
                ))}
            </div>
        </div>
    )
}

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

export default async function MarketplacePage() {
    // Initialize with safe defaults
    let marketplaceListings: Awaited<ReturnType<typeof getMarketplaceListings>> = []
    let recommendations: MarketplaceRecommendation[] = []
    let teamMembers: { id: string; full_name: string | null; role: string }[] = []

    // Fetch marketplace listings - wrapped in try-catch
    try {
        marketplaceListings = await getMarketplaceListings()
        console.log('[Marketplace] Loaded', marketplaceListings.length, 'listings')
    } catch (err) {
        console.error('[Marketplace] Failed to fetch listings:', err)
        // Continue with empty array
    }

    // Get foundry context for optional features
    let foundryId: string | null = null
    try {
        foundryId = await getFoundryIdCached()
    } catch (err) {
        console.error('[Marketplace] Failed to get foundry ID:', err)
    }

    // Fetch AI recommendations (non-critical)
    if (foundryId) {
        try {
            const supabase = await createClient()
            const { data: recs, error } = await supabase
                .rpc('get_marketplace_recommendations', { 
                    p_foundry_id: foundryId,
                    p_limit: 5 
                })
            
            if (error) {
                console.error('[Marketplace] Recommendations RPC error:', error)
            } else if (recs) {
                recommendations = recs as MarketplaceRecommendation[]
            }
        } catch (err) {
            console.error('[Marketplace] Failed to fetch recommendations:', err)
        }
    }

    // Fetch team members (non-critical)
    if (foundryId) {
        try {
            const supabase = await createClient()
            const { data: members, error } = await supabase
                .from('profiles')
                .select('id, full_name, role')
                .eq('foundry_id', foundryId)
                .neq('role', 'AI_Agent')
                .order('full_name')
            
            if (error) {
                console.error('[Marketplace] Team members query error:', error)
            } else if (members) {
                teamMembers = members
            }
        } catch (err) {
            console.error('[Marketplace] Failed to fetch team members:', err)
        }
    }

    return (
        <Suspense fallback={<MarketplaceLoading />}>
            <MarketplaceView
                initialListings={marketplaceListings}
                recommendations={recommendations}
                teamMembers={teamMembers}
            />
        </Suspense>
    )
}
