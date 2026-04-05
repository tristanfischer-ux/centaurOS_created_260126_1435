/**
 * @file investors/page.tsx
 *
 * @description Investor page with semantic search hero and two tabs:
 * - Hero: "Find your ideal investors" — describes startup, semantic search matches
 * - "For You" (tab default) — AI-matched top 50 investors based on company profile
 * - "Browse All" — UK Investor Directory with filters + semantic search results
 *
 * Revalidates every 60 seconds (ISR) since investor data changes infrequently.
 */

import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { searchInvestors, getInvestorStats, computeMatchScores, getShortlistIds, getInvestorTierAccess } from '@/actions/investors'
import { getProducts } from '@/actions/products'
import { createClient } from '@/lib/supabase/server'
import type { InvestorStats, ShortlistStage, InvestorTierAccess } from '@/actions/investors'
import { InvestorBrowser } from './components/InvestorBrowser'
import { InvestorInsightsPanel } from './components/InvestorInsightsPanel'
import { InvestorPageTabs } from './components/InvestorPageTabs'
import { InvestorSpecialistBanner } from './components/InvestorSpecialistBanner'
import { InvestorSearchHeroClient } from './components/InvestorSearchHeroClient'

export const revalidate = 60

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function InvestorDirectoryLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-80" />
      <div className="flex gap-3">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Skeleton key={i} className="h-72 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InvestorDirectoryPage() {
  let initialFirms: Awaited<ReturnType<typeof searchInvestors>>['firms'] = []
  let initialTotal = 0
  let initialHasMore = false
  let stats: InvestorStats | null = null
  let matchScores: Record<string, number> = {}
  let shortlistIds: Record<string, ShortlistStage> = {}
  // Default to free-tier fallback so export menu always renders
  let access: InvestorTierAccess = {
    tier: 'free',
    detailAccess: false,
    contactsVisible: false,
    deepAccess: false,
    intelligenceAccess: false,
  }

  const [searchResult, statsResult, shortlistResult, accessResult] = await Promise.allSettled([
    searchInvestors({ page: 1, pageSize: 24 }),
    getInvestorStats(),
    getShortlistIds(),
    getInvestorTierAccess(),
  ])

  if (searchResult.status === 'fulfilled') {
    initialFirms = searchResult.value.firms
    initialTotal = searchResult.value.total
    initialHasMore = searchResult.value.hasMore
  } else {
    console.error('[InvestorDirectoryPage] Failed to fetch investors:', searchResult.reason)
  }

  if (statsResult.status === 'fulfilled') {
    stats = statsResult.value
  } else {
    console.error('[InvestorDirectoryPage] Failed to fetch stats:', statsResult.reason)
  }

  if (shortlistResult.status === 'fulfilled') {
    shortlistIds = shortlistResult.value
  } else {
    console.error('[InvestorDirectoryPage] Failed to fetch shortlist:', shortlistResult.reason)
  }

  if (accessResult.status === 'fulfilled') {
    access = accessResult.value
  }

  // Compute match scores for initial firms
  if (initialFirms.length > 0) {
    try {
      matchScores = await computeMatchScores(initialFirms.map(f => f.id))
    } catch {
      // Non-critical — scores just won't show
    }
  }

  // INTENT: Fetch company profile data so Fiona's briefing gives actionable advice
  // (e.g., "You're pre-seed in manufacturing, here are 23 active VCs in your sector")
  let companyContext: { sector?: string | null; stage?: string | null; fundingStatus?: string | null; seekingFunding?: boolean } = {}
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('foundry_id').eq('id', user.id).single()
      if (profile?.foundry_id) {
        const { data: foundry } = await supabase
          .from('foundries')
          .select('sector, stage, company_profile')
          .eq('id', profile.foundry_id)
          .single()
        if (foundry) {
          const cp = foundry.company_profile as { funding_status?: string; seeking_funding?: boolean } | null
          companyContext = {
            sector: foundry.sector,
            stage: foundry.stage,
            fundingStatus: cp?.funding_status ?? null,
            seekingFunding: cp?.seeking_funding ?? false,
          }
        }
      }
    }
  } catch {
    // Non-critical — Fiona falls back to generic advice
  }

  // FLOW: Fetch product sectors for "Product Fit" badges on investor cards
  let productSectors: string[] = []
  try {
    const productsResult = await getProducts()
    if (productsResult.data && productsResult.data.length > 0) {
      // INTENT: Extract searchable terms from product names and descriptions
      productSectors = productsResult.data.flatMap(p => {
        const terms: string[] = []
        if (p.name) terms.push(p.name.toLowerCase())
        if (p.description) {
          // Extract key terms from description (words > 4 chars)
          const words = p.description.toLowerCase().split(/\s+/).filter(w => w.length > 4)
          terms.push(...words.slice(0, 10))
        }
        return terms
      })
    }
  } catch {
    // Non-critical — Product Fit badges just won't show
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="pb-4 border-b border-muted">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-8 w-1.5 bg-international-orange rounded-full shadow-[0_0_10px_rgba(255,69,0,0.5)]" />
          <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">Investors</h1>
        </div>
        <p className="text-muted-foreground text-sm font-medium pl-4">
          {stats
            ? `${stats.total.toLocaleString()} firms · ${stats.forgeCapitalCount.toLocaleString()} deep-profiled · ${stats.partnerCount.toLocaleString()} partners`
            : 'Find the right investors for your company'}
        </p>
      </div>

      {/* Semantic search hero above tabs */}
      <Suspense fallback={null}>
        <InvestorSearchHeroClient
          initialFirms={initialFirms}
          initialTotal={initialTotal}
          initialHasMore={initialHasMore}
          initialMatchScores={matchScores}
          initialShortlistIds={shortlistIds}
          access={access}
          productSectors={productSectors}
        />
      </Suspense>

      {/* Tabbed view: For You + Browse All */}
      <InvestorPageTabs
        headerContent={
          <InvestorSpecialistBanner
            companyContext={companyContext}
            investorStats={stats ? {
              total: stats.total,
              activeDeploying: stats.activeDeployingCount,
              deepProfiled: stats.forgeCapitalCount,
              partnerCount: stats.partnerCount,
            } : undefined}
            shortlistCount={Object.keys(shortlistIds).length}
          />
        }
        browseContent={
          <>
            {/* Insights panel */}
            {stats && <InvestorInsightsPanel stats={stats} />}

            {/* Color legend */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground border-b border-border pb-4">
              <span className="font-medium text-foreground text-sm">Legend:</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-flex h-2 w-2 rounded-full bg-success" />
                Actively deploying
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block px-2 py-0.5 rounded text-xs bg-destructive/10 text-destructive font-medium">Priority A</span>
                High priority
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block px-2 py-0.5 rounded text-xs bg-warning/10 text-warning font-medium">Priority B</span>
                Medium priority
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground font-medium">Priority C</span>
                Lower priority
              </span>
            </div>
          </>
        }
      />
    </div>
  )
}
