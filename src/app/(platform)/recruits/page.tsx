/**
 * @file Recruits page — People-focused marketplace with AI talent matching.
 *
 * @description Shows People marketplace listings enriched with trust signals,
 * social proof, and an AI-powered "Describe Who You Need" talent finder.
 * Lives under the People navigation section alongside Guild and Apprenticeship.
 *
 * @related
 * - Marketplace page (Products & Services): src/app/(platform)/marketplace/page.tsx
 * - Browse component: src/app/(platform)/marketplace-v2/components/MarketplaceBrowse.tsx
 * - People actions: src/actions/people-marketplace.ts
 * - Talent finder: src/components/marketplace/talent-finder.tsx
 */

import { Suspense } from 'react'
import { Users, ShieldCheck, Briefcase, MapPin } from 'lucide-react'
import { getMarketplaceListings, getSavedMarketplaceListings } from '@/actions/marketplace'
import { getEnrichedPeopleListings } from '@/actions/people-marketplace'
import { getRecruitsStats } from '@/actions/recruits-stats'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getFoundryContext } from '@/actions/foundry-context'
import { MarketplaceBrowse } from '../marketplace-v2/components/MarketplaceBrowse'
import { Skeleton } from '@/components/ui/skeleton'
import { TalentFinderWrapper } from './talent-finder-wrapper'
import type { MarketplaceListing, MarketplaceRecommendation } from '@/actions/marketplace'
import type { EnrichedPersonListing } from '@/actions/people-marketplace'
import type { StatsLabels } from '../marketplace-v2/components/MarketplaceStatsSection'

const RECRUITS_STATS_LABELS: StatsLabels = {
    sectionTitle: 'Recruits Insights',
    kpi1Label: 'Total Talent',
    kpi1Icon: Users,
    kpi3Label: 'Specializations',
    kpi3Icon: Briefcase,
    chart1Title: 'Specialization Distribution',
    chart2Title: 'Availability Breakdown',
    chart3Title: 'Regional Coverage',
    barTooltipNoun: 'people',
    donutTooltipNoun: 'people',
}

export const revalidate = 30

/**
 * Loading skeleton for the Recruits page.
 */
function RecruitsLoading(): React.ReactElement {
    return (
        <div className="space-y-6">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-12 w-full max-w-lg" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-80 w-full rounded-xl" />
                ))}
            </div>
        </div>
    )
}

/**
 * Server component for the Recruits page.
 *
 * @description Fetches enriched People marketplace listings with trust signals,
 * recommendations, and saved state. Renders the AI Talent Finder above the
 * standard MarketplaceBrowse grid.
 *
 * @returns Recruits page with AI talent finder and enriched people cards
 */
export default async function RecruitsPage(): Promise<React.ReactElement> {
    let listings: MarketplaceListing[] = []
    let enrichedListings: EnrichedPersonListing[] = []
    let recommendations: MarketplaceRecommendation[] = []
    let savedIds: string[] = []
    let savedListings: MarketplaceListing[] = []

    // Fetch enriched People listings, foundry context, and stats in parallel
    const [enrichedResult, plainListingsResult, foundryContext, statsResult] = await Promise.allSettled([
        getEnrichedPeopleListings(),
        getMarketplaceListings('People'),
        getFoundryContext(),
        getRecruitsStats(),
    ])

    if (enrichedResult.status === 'fulfilled') {
        enrichedListings = enrichedResult.value
        // Use enriched listings as the main listings for the grid
        listings = enrichedResult.value
    } else if (plainListingsResult.status === 'fulfilled') {
        // Fallback to plain listings if enrichment fails
        listings = plainListingsResult.value
    }

    const ctx = foundryContext.status === 'fulfilled' ? foundryContext.value : null
    const recruitsStats = statsResult.status === 'fulfilled' ? statsResult.value : null

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
        // SECURITY: Get user ID for defense-in-depth filtering on saved listings
        const { data: { user } } = await supabase.auth.getUser()

        const [recsResult, savedResult, savedListingsResult] = await Promise.allSettled([
            supabase.rpc('get_marketplace_recommendations', {
                p_foundry_id: foundryId,
                p_limit: 5,
            }),
            user
                ? supabase.from('saved_marketplace_listings').select('listing_id').eq('user_id', user.id)
                : Promise.resolve({ data: [] }),
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
            <div className="space-y-6">
                {/* AI Talent Finder - the "aha moment" */}
                <TalentFinderWrapper />

                {/* Standard marketplace browse with enriched People cards */}
                <MarketplaceBrowse
                    initialListings={listings}
                    recommendations={recommendations}
                    initialSavedIds={savedIds}
                    initialSavedListings={savedListings}
                    foundryContext={ctx || undefined}
                    allowedCategories={['People']}
                    pageTitle="Recruits"
                    pageSubtitle="Find expert talent to grow your team"
                    stats={recruitsStats ?? undefined}
                    statsLabels={RECRUITS_STATS_LABELS}
                />
            </div>
        </Suspense>
    )
}
