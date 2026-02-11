/**
 * @file Recruits page — People-focused marketplace view.
 *
 * @description Shows marketplace listings filtered to the "People" category
 * only. Lives under the People navigation section alongside Guild and
 * Apprenticeship. Shares all marketplace components with the main
 * Marketplace page via the `allowedCategories` prop.
 *
 * @related
 * - Marketplace page (Products & Services): src/app/(platform)/marketplace/page.tsx
 * - Browse component: src/app/(platform)/marketplace-v2/components/MarketplaceBrowse.tsx
 * - Actions: src/actions/marketplace.ts
 */

import { Suspense } from 'react'
import { getMarketplaceListings, getSavedMarketplaceListings } from '@/actions/marketplace'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getFoundryContext } from '@/actions/foundry-context'
import { MarketplaceBrowse } from '../marketplace-v2/components/MarketplaceBrowse'
import { Skeleton } from '@/components/ui/skeleton'
import type { MarketplaceListing, MarketplaceRecommendation } from '@/actions/marketplace'

export const dynamic = 'force-dynamic'

/**
 * Loading skeleton for the Recruits page.
 */
function RecruitsLoading(): React.ReactElement {
    return (
        <div className="space-y-6">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-12 w-full max-w-lg" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-72 w-full rounded-xl" />
                ))}
            </div>
        </div>
    )
}

/**
 * Server component for the Recruits page.
 *
 * @description Fetches People marketplace listings, recommendations, and saved
 * state, then renders MarketplaceBrowse restricted to the People category.
 *
 * @returns Recruits page with people-only marketplace view
 */
export default async function RecruitsPage(): Promise<React.ReactElement> {
    let listings: MarketplaceListing[] = []
    let recommendations: MarketplaceRecommendation[] = []
    let savedIds: string[] = []
    let savedListings: MarketplaceListing[] = []

    // Fetch People listings and foundry context in parallel
    const [listingsResult, foundryContext] = await Promise.allSettled([
        getMarketplaceListings('People'),
        getFoundryContext(),
    ])

    if (listingsResult.status === 'fulfilled') {
        listings = listingsResult.value
    } else {
        console.error('[Recruits] Failed to fetch listings:', listingsResult.reason)
    }

    const ctx = foundryContext.status === 'fulfilled' ? foundryContext.value : null

    // Fetch foundry context for optional features
    let foundryId: string | null = ctx?.foundryId || null
    if (!foundryId) {
        try {
            foundryId = await getFoundryIdCached()
        } catch {
            // Non-critical
        }
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
            // Only include People recommendations for this view
            recommendations = (recsResult.value.data as MarketplaceRecommendation[])
                .filter(r => r.category === 'People')
        }

        if (savedResult.status === 'fulfilled' && savedResult.value.data) {
            savedIds = savedResult.value.data.map((r: { listing_id: string }) => r.listing_id)
        }

        if (savedListingsResult.status === 'fulfilled' && savedListingsResult.value.data) {
            // Only include People saved listings for this view
            savedListings = savedListingsResult.value.data.filter(
                (l: MarketplaceListing) => l.category === 'People'
            )
        }
    }

    return (
        <Suspense fallback={<RecruitsLoading />}>
            <MarketplaceBrowse
                initialListings={listings}
                recommendations={recommendations}
                initialSavedIds={savedIds}
                initialSavedListings={savedListings}
                foundryContext={ctx || undefined}
                allowedCategories={['People']}
                pageTitle="Recruits"
                pageSubtitle="Find expert talent to grow your team"
            />
        </Suspense>
    )
}
