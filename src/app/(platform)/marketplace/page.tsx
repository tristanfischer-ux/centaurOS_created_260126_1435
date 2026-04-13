import type { Metadata } from 'next'
import { Suspense } from 'react'
import { searchMarketplaceListings, getSavedMarketplaceListings } from '@/actions/marketplace'
import { MARKETPLACE_PAGE_SIZE } from '@/lib/marketplace-constants'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getFoundryContext } from '@/actions/foundry-context'
import { getMarketplaceStats } from '@/actions/marketplace-stats'
import { MarketplaceBrowse } from '../marketplace-v2/components/MarketplaceBrowse'
import { ProjectContextBanner } from '@/components/marketplace/project-context-banner'
import { getProcessCategoryCounts } from '@/actions/marketplace-process-discovery'
import { getActiveProjectContext } from '@/actions/marketplace-project-context'
import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'
import { generatePageBriefing } from '@/actions/specialist-page-insights'
import { Skeleton } from '@/components/ui/skeleton'
import { typography } from '@/lib/design-system'
import type { MarketplaceListing, MarketplaceRecommendation } from '@/actions/marketplace'
import type { MarketplaceStats } from '@/actions/marketplace-stats'

export const metadata: Metadata = {
  title: 'Marketplace',
  description: 'Find manufacturing partners, fractional experts, and playbooks for your hardware startup',
  openGraph: {
    title: 'Marketplace | ForgeOS',
    description: 'Find manufacturing partners, fractional experts, and playbooks for your hardware startup',
    type: 'website',
  },
}

export const revalidate = 30

function MarketplaceLoading() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-12 w-full max-w-lg" />
            <div className="flex gap-3">
                {[1, 2, 3, 4].map((i) => (
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

export default async function MarketplacePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const params = await searchParams
    let listings: MarketplaceListing[] = []
    let totalCount = 0
    let hasMore = false
    let categoryCounts: Record<string, number> = {}
    let recommendations: MarketplaceRecommendation[] = []
    let savedIds: string[] = []
    let savedListings: MarketplaceListing[] = []
    let stats: MarketplaceStats | null = null

    // Fetch first page of listings (Products + Services), foundry context, and stats in parallel
    const [searchResult, foundryContext, statsResult, processCountsResult, projectContextResult] = await Promise.allSettled([
        searchMarketplaceListings({
            categories: ['Products', 'Services'],
            page: 1,
            pageSize: MARKETPLACE_PAGE_SIZE,
            sort: 'verified',
        }),
        getFoundryContext(),
        getMarketplaceStats(),
        getProcessCategoryCounts(),
        getActiveProjectContext(),
    ])

    if (searchResult.status === 'fulfilled') {
        listings = searchResult.value.data
        totalCount = searchResult.value.totalCount
        hasMore = searchResult.value.hasMore
        categoryCounts = searchResult.value.categoryCounts
    } else {
        console.error('[Marketplace] Failed to fetch listings:', searchResult.reason)
    }

    const ctx = foundryContext.status === 'fulfilled' ? foundryContext.value : null

    if (statsResult.status === 'fulfilled') {
        stats = statsResult.value
    } else {
        console.error('[Marketplace] Failed to fetch stats:', statsResult.reason)
    }

    const processGroups = processCountsResult.status === 'fulfilled' ? processCountsResult.value : []
    if (processCountsResult.status === 'rejected') {
        console.error('[Marketplace] Failed to fetch process counts:', processCountsResult.reason)
    }
    const projectContext = projectContextResult.status === 'fulfilled' ? projectContextResult.value : null

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
            // Only include Products & Services recommendations for this view
            recommendations = (recsResult.value.data as MarketplaceRecommendation[])
                .filter(r => r.category === 'Products' || r.category === 'Services')
        }

        if (savedResult.status === 'fulfilled' && savedResult.value.data) {
            savedIds = savedResult.value.data.map((r: { listing_id: string }) => r.listing_id)
        }

        if (savedListingsResult.status === 'fulfilled' && savedListingsResult.value.data) {
            // Only include Products & Services saved listings for this view
            savedListings = savedListingsResult.value.data.filter(
                (l: MarketplaceListing) => l.category === 'Products' || l.category === 'Services'
            )
        }
    }

    // INTENT: Generate Chase's briefing at the page level so it appears ABOVE the tabs,
    // not buried inside the Browse All tab's MarketplaceBrowse component.
    const briefingContext = `Marketplace: ${totalCount} listings across Products & Services. ${Object.entries(categoryCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}.`
    const briefing = await generatePageBriefing('vp-supply-chain', briefingContext, 'success').catch(() => ({ narrative: null, severity: 'success' as const }))

    return (
        <div className="space-y-6">
            {/* Page header — above everything */}
            <div className="pb-4 border-b border-muted">
                <div className={typography.pageHeader}>
                    <div className={typography.pageHeaderAccent} />
                    <h1 className={typography.h1}>Marketplace</h1>
                </div>
                <p className={typography.pageSubtitle}>
                    Find suppliers, services, and tools for your hardware venture
                </p>
            </div>

            {/* Chase specialist briefing — above tabs */}
            <SpecialistBriefingHero
                specialistId="vp-supply-chain"
                specialistName="Chase"
                specialistTitle="Supply Chain"
                narrative={briefing.narrative}
                fallbackMessage="Chase here. I've catalogued suppliers so you don't have to cold-email factories at 2am. Filter by category, capability, lead time, or just describe what you need and the search will surface matches you'd never find on Alibaba. Start typing what you're looking for."
                isLoading={false}
                severity={briefing.severity}
                context={{ type: 'general', title: 'Marketplace', description: briefingContext, metadata: {} }}
                storageKey="marketplace"
            />

            {/* Project context banner — connects CAD Lab projects to supplier discovery */}
            {projectContext && (
                <ProjectContextBanner context={projectContext} />
            )}

            {/* Supplier browse — ProcessDiscoveryGrid rendered inside, reactive to client search state */}
            <Suspense fallback={<MarketplaceLoading />}>
                <MarketplaceBrowse
                    initialListings={listings}
                    initialTotalCount={totalCount}
                    initialHasMore={hasMore}
                    initialCategoryCounts={categoryCounts}
                    recommendations={recommendations}
                    initialSavedIds={savedIds}
                    initialSavedListings={savedListings}
                    foundryContext={ctx || undefined}
                    allowedCategories={['Products', 'Services']}
                    pageSubtitle="Find products and services to grow your business"
                    stats={stats || undefined}
                    hidePageHeader
                    hideSpecialistBriefing
                    processGroups={processGroups}
                />
            </Suspense>
        </div>
    )
}
