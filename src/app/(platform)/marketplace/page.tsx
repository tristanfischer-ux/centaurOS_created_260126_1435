import { Suspense } from 'react'
import { getMarketplaceListings, getSavedMarketplaceListings } from '@/actions/marketplace'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { MarketplaceBrowse } from '../marketplace-v2/components/MarketplaceBrowse'
import { Skeleton } from '@/components/ui/skeleton'
import type { MarketplaceListing, MarketplaceRecommendation } from '@/actions/marketplace'

export const dynamic = 'force-dynamic'

function MarketplaceLoading() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-12 w-full max-w-lg" />
            <div className="flex gap-3">
                {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-9 w-24 rounded-full" />
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-72 w-full rounded-xl" />
                ))}
            </div>
        </div>
    )
}

export default async function MarketplacePage() {
    let listings: MarketplaceListing[] = []
    let recommendations: MarketplaceRecommendation[] = []
    let savedIds: string[] = []
    let savedListings: MarketplaceListing[] = []

    // Fetch listings
    try {
        listings = await getMarketplaceListings()
    } catch (err) {
        console.error('[Marketplace] Failed to fetch listings:', err)
    }

    // Fetch foundry context for optional features
    let foundryId: string | null = null
    try {
        foundryId = await getFoundryIdCached()
    } catch {
        // Non-critical
    }

    // Fetch recommendations, saved IDs, and full saved listings in parallel
    if (foundryId) {
        const supabase = await createClient()

        const [recsResult, savedResult, savedListingsResult] = await Promise.allSettled([
            supabase.rpc('get_marketplace_recommendations', {
                p_foundry_id: foundryId,
                p_limit: 5,
            }),
            supabase.from('saved_marketplace_listings').select('listing_id'),
            getSavedMarketplaceListings(),
        ])

        if (recsResult.status === 'fulfilled' && recsResult.value.data) {
            recommendations = recsResult.value.data as MarketplaceRecommendation[]
        }

        if (savedResult.status === 'fulfilled' && savedResult.value.data) {
            savedIds = savedResult.value.data.map((r: { listing_id: string }) => r.listing_id)
        }

        if (savedListingsResult.status === 'fulfilled' && savedListingsResult.value.data) {
            savedListings = savedListingsResult.value.data
        }
    }

    return (
        <Suspense fallback={<MarketplaceLoading />}>
            <MarketplaceBrowse
                initialListings={listings}
                recommendations={recommendations}
                initialSavedIds={savedIds}
                initialSavedListings={savedListings}
            />
        </Suspense>
    )
}
