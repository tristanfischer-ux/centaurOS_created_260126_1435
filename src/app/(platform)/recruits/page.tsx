/**
 * @file Recruits page — People-focused marketplace with personalized talent matching.
 *
 * @description Two-tab layout: "For You" shows top 20 auto-matched executives
 * based on company needs (gaps, objectives, tasks), "Browse All" shows the full
 * People marketplace with search and filters.
 *
 * @related
 * - Marketplace page (Products & Services): src/app/(platform)/marketplace/page.tsx
 * - Browse component: src/app/(platform)/marketplace-v2/components/MarketplaceBrowse.tsx
 * - People actions: src/actions/people-marketplace.ts
 * - Recruit matching: src/app/api/recruits/match/route.ts
 */

import { getSavedMarketplaceListings } from '@/actions/marketplace'
import { getEnrichedPeopleListings, getDemoPeopleCount, enrichPeopleListingsBatch } from '@/actions/people-marketplace'
import { getRecruitsStats } from '@/actions/recruits-stats'
import { getMatchAlerts } from '@/actions/match-alerts'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getFoundryContext } from '@/actions/foundry-context'
import { MarketplaceBrowse } from '../marketplace-v2/components/MarketplaceBrowse'
import { MatchAlertBanner } from '@/components/marketplace/match-alert-banner'
import { TalentFinderWrapper } from './talent-finder-wrapper'
import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'
import { generatePageBriefing } from '@/actions/specialist-page-insights'
import { RecruitPageTabs } from './components/RecruitPageTabs'
import { RecruitMatchView } from './components/RecruitMatchView'
import type { MarketplaceListing, MarketplaceRecommendation } from '@/actions/marketplace'
import type { MatchAlert } from '@/actions/match-alerts'
import { typography } from '@/lib/design-system'
import type { StatsLabels } from '../marketplace-v2/components/MarketplaceStatsSection'

const RECRUITS_STATS_LABELS: StatsLabels = {
    sectionTitle: 'Recruits Insights',
    kpi1Label: 'Total Talent',
    kpi1Icon: 'users',
    kpi3Label: 'Specializations',
    kpi3Icon: 'briefcase',
    chart1Title: 'Specialization Distribution',
    chart2Title: 'Availability Breakdown',
    chart3Title: 'Regional Coverage',
    chart4Title: 'Domain Expertise',
    chart5Title: 'Certification Distribution',
    chart6Title: 'Specialization Breakdown',
    barTooltipNoun: 'people',
    donutTooltipNoun: 'people',
}

export const revalidate = 30

/**
 * Server component for the Recruits page.
 *
 * @description Two-tab layout: "For You" auto-matches executives via SSE streaming,
 * "Browse All" shows the full People marketplace. Harper provides hiring context
 * via the specialist briefing hero.
 */
export default async function RecruitsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.ReactElement> {
    const params = await searchParams
    const showDemo = params.demo === '1'
    let listings: MarketplaceListing[] = []
    let recommendations: MarketplaceRecommendation[] = []
    let savedIds: string[] = []
    let savedListings: MarketplaceListing[] = []
    let matchAlerts: MatchAlert[] = []

    // Fetch enriched People listings, foundry context, stats, and match alerts in parallel
    const parallelResults = await Promise.allSettled([
        getEnrichedPeopleListings({ includeDemo: showDemo }),
        getFoundryContext(),
        getRecruitsStats(),
        getMatchAlerts({ unreadOnly: true, limit: 8 }),
        getDemoPeopleCount(),
    ])

    const enrichedResult = parallelResults[0]
    const foundryContext = parallelResults[1]
    const statsResult = parallelResults[2]
    const alertsResult = parallelResults[3]
    const demoCountResult = parallelResults[4]

    if (enrichedResult.status === 'fulfilled') {
        listings = enrichedResult.value
    }
    if (alertsResult.status === 'fulfilled') {
        matchAlerts = alertsResult.value
    }
    const demoPeopleCount = demoCountResult.status === 'fulfilled' ? demoCountResult.value : 0

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
            recommendations = (recsResult.value.data as MarketplaceRecommendation[])
                .filter(r => r.category === 'People')
        }

        if (savedResult.status === 'fulfilled' && savedResult.value.data) {
            savedIds = savedResult.value.data.map((r: { listing_id: string }) => r.listing_id)
        }

        if (savedListingsResult.status === 'fulfilled' && savedListingsResult.value.data) {
            savedListings = savedListingsResult.value.data.filter(
                (l: MarketplaceListing) => l.category === 'People'
            )
        }
    }

    const categories = Array.from(new Set(listings.map(l => l.subcategory).filter(Boolean)))

    // INTENT: Harper analyses team gaps and available talent to give actionable hiring advice.
    const gapCategories = ctx?.gapCategories ?? []
    const briefingContext = `Available talent: ${listings.length} people across ${categories.length} specialisations (${categories.slice(0, 5).join(', ')}).
Team gaps identified: ${gapCategories.length > 0 ? gapCategories.join(', ') : 'none detected yet — set up your team coverage map'}.
Industry: ${ctx?.industry ?? 'not set'}. Stage: ${ctx?.stage ?? 'not set'}.`
    const severity = gapCategories.length > 2 ? 'warning' as const : 'success' as const
    const briefing = await generatePageBriefing('hiring-team', briefingContext, severity).catch(() => ({ narrative: null, severity }))

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="pb-4 border-b border-muted">
                <div className={typography.pageHeader}>
                    <div className={typography.pageHeaderAccent} />
                    <h1 className={typography.h1}>Recruits</h1>
                </div>
                <p className={typography.pageSubtitle}>
                    Find expert talent to grow your team
                </p>
            </div>

            <SpecialistBriefingHero
                specialistId="hiring-team"
                specialistName="Harper"
                specialistTitle="Hiring"
                narrative={briefing.narrative}
                fallbackMessage="Find fractional executives and specialists ready to join your team. Filter by skills, availability, and experience to find the right match."
                isLoading={false}
                severity={briefing.severity}
                context={{ type: 'general', title: 'Recruits', description: 'Harper on recruits.', metadata: {} }}
                storageKey="recruits"
            />

            {/* Match alert banner — shows unread match notifications */}
            {matchAlerts.length > 0 && (
                <MatchAlertBanner alerts={matchAlerts} />
            )}

            {/* Two-tab layout: For You (auto-matched) + Browse All (marketplace) */}
            <RecruitPageTabs
                forYouContent={<RecruitMatchView />}
                browseContent={
                    <div className="space-y-6">
                        {/* AI Talent Finder */}
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
                            statsDefaultExpanded={false}
                            postFetchTransform={enrichPeopleListingsBatch}
                            hideSpecialistBriefing
                            hidePageHeader
                        />
                    </div>
                }
                demoPeopleCount={demoPeopleCount}
                showDemo={showDemo}
            />
        </div>
    )
}
