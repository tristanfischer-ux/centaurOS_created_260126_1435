/**
 * @file investors/page.tsx
 *
 * @description UK Investor Directory — server component entry point.
 * Fetches the initial page of Finance-category marketplace listings server-side
 * and passes them to InvestorBrowser for client-side interactive filtering.
 * Also pre-computes match scores and shortlist state.
 *
 * Revalidates every 60 seconds (ISR) since investor data changes infrequently.
 */

import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { searchInvestors, getInvestorStats, computeMatchScores, getShortlistIds, getInvestorTierAccess } from '@/actions/investors'
import type { InvestorStats, ShortlistStage, InvestorTierAccess } from '@/actions/investors'
import { InvestorBrowser } from './components/InvestorBrowser'
import { InvestorInsightsPanel } from './components/InvestorInsightsPanel'

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

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="pb-4 border-b border-muted">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-8 w-1.5 bg-international-orange rounded-full shadow-[0_0_10px_rgba(255,69,0,0.5)]" />
          <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">UK Investor Directory</h1>
        </div>
        <p className="text-muted-foreground text-sm font-medium pl-4">
          {stats
            ? `${stats.total.toLocaleString()} firms · ${stats.forgeCapitalCount.toLocaleString()} deep-profiled · ${stats.partnerCount.toLocaleString()} partners`
            : 'UK venture capital and private equity firms'}
        </p>
      </div>

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

      {/* Browser with filters + grid */}
      <Suspense fallback={<InvestorDirectoryLoading />}>
        <InvestorBrowser
          initialFirms={initialFirms}
          initialTotal={initialTotal}
          initialHasMore={initialHasMore}
          initialMatchScores={matchScores}
          initialShortlistIds={shortlistIds}
          access={access}
        />
      </Suspense>
    </div>
  )
}
