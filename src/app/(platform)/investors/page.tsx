/**
 * @file investors/page.tsx
 *
 * @description Investor Intelligence page with 5 tabs matching Forge Capital parity:
 * - Hero: Semantic search + company context auto-fill
 * - "For You" — AI-matched top 50 investors
 * - "Browse All" — Full directory with filters, grid/table/board/map views
 * - "Contacts" — 49K+ partner directory with search
 * - "Portfolio" — 92K+ portfolio companies across all investors
 * - "Grants" — 3K+ non-dilutive funding sources
 *
 * Revalidates every 60 seconds (ISR) since investor data changes infrequently.
 */

import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { searchInvestors, getInvestorStats, computeMatchScores, getShortlistIds, getInvestorTierAccess, getInvestorViewCapStatus } from '@/actions/investors'
import { getProducts } from '@/actions/products'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { InvestorStats, ShortlistStage, InvestorTierAccess, InvestorViewCapResult } from '@/actions/investors'
import { InvestorBrowser } from './components/InvestorBrowser'
import { InvestorInsightsPanel } from './components/InvestorInsightsPanel'
import { InvestorPageTabs } from './components/InvestorPageTabs'
import { InvestorSpecialistBanner } from './components/InvestorSpecialistBanner'
import { InvestorSearchHeroClient } from './components/InvestorSearchHeroClient'
import { ContactsDirectoryTab } from './components/ContactsDirectoryTab'
import { GrantsDirectoryTab } from './components/GrantsDirectoryTab'
import { PortfolioDirectoryTab } from './components/PortfolioDirectoryTab'

export const metadata: Metadata = {
  title: 'Investor Intelligence',
  description: 'Discover, match, and track investors for your hardware startup with personalised recommendations',
  openGraph: {
    title: 'Investor Intelligence',
    description: 'Discover, match, and track investors for your hardware startup with personalised recommendations',
    type: 'website',
  },
}

export const dynamic = 'force-dynamic'

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

  const [searchResult, statsResult, shortlistResult, accessResult, viewCapResult] = await Promise.allSettled([
    searchInvestors({ page: 1, pageSize: 24 }),
    getInvestorStats(),
    getShortlistIds(),
    getInvestorTierAccess(),
    getInvestorViewCapStatus(),
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

  let viewCapStatus: InvestorViewCapResult | null = null
  if (viewCapResult.status === 'fulfilled') {
    viewCapStatus = viewCapResult.value
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

  // FLOW: Fetch tab counts for Investors, Contacts, Portfolio, Grants
  // GOTCHA: Must use admin client — createClient() lacks auth cookies in server
  // component context, causing RLS to deny access and return 0 for all counts.
  let investorCount = 0
  let contactCount = 0
  let portfolioCount = 0
  let grantsCount = 0
  try {
    const adminDb = createAdminClient()
    const [investorResult, contactResult, portfolioResult, grantsResult] = await Promise.allSettled([
      adminDb.from('marketplace_listings').select('id', { count: 'exact', head: true }).eq('category', 'Finance'),
      adminDb.from('vc_pe_contacts').select('id', { count: 'exact', head: true }),
      // DECISION: Use RPC for deduplicated company count (raw table has ~89K rows = one per investor-company pair,
      // but only ~689 unique companies). RPC from migration 20260406600000.
      adminDb.rpc('count_unique_portfolio_companies'),
      adminDb.from('investor_grants').select('id', { count: 'exact', head: true }),
    ])
    if (investorResult.status === 'fulfilled') investorCount = investorResult.value.count ?? 0
    if (contactResult.status === 'fulfilled') contactCount = contactResult.value.count ?? 0
    if (portfolioResult.status === 'fulfilled') portfolioCount = (portfolioResult.value.data as number) ?? 0
    if (grantsResult.status === 'fulfilled') grantsCount = grantsResult.value.count ?? 0
  } catch {
    // Non-critical — tab counts just won't show
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
          {investorCount > 0
            ? `${investorCount.toLocaleString()} firms · ${contactCount.toLocaleString()} contacts · ${grantsCount.toLocaleString()} grants`
            : 'Find the right investors for your company'}
        </p>
      </div>

      {/* Views remaining banner — soft nudge for capped tiers */}
      {viewCapStatus && viewCapStatus.cap !== null && viewCapStatus.viewsRemaining !== null && viewCapStatus.viewsRemaining > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border px-4 py-2.5 text-sm">
          <svg className="h-4 w-4 text-muted-foreground shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">
              {viewCapStatus.viewsRemaining} new investor {viewCapStatus.viewsRemaining === 1 ? 'view' : 'views'}
            </span>
            {' '}remaining this month
            {viewCapStatus.librarySize > 0 && (
              <>{' · '}<span className="font-medium text-foreground">{viewCapStatus.librarySize}</span>{' in your library'}</>
            )}
            {viewCapStatus.viewsRemaining <= 3 && (
              <>{' · '}<a href="/pricing" className="text-international-orange hover:underline">Upgrade for more</a></>
            )}
          </span>
        </div>
      )}
      {viewCapStatus && viewCapStatus.cap !== null && viewCapStatus.viewsRemaining !== null && viewCapStatus.viewsRemaining <= 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/20 px-4 py-2.5 text-sm">
          <svg className="h-4 w-4 text-warning shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
          <span className="text-muted-foreground">
            You&apos;ve used all{' '}
            <span className="font-medium text-foreground">{viewCapStatus.cap}</span>
            {' '}new views this month.
            {viewCapStatus.librarySize > 0 && (
              <>{' '}<span className="font-medium text-foreground">{viewCapStatus.librarySize}</span>{' profiles in your library are always accessible.'}</>
            )}
            {' · '}<a href="/pricing" className="text-international-orange hover:underline">Upgrade for more</a>
          </span>
        </div>
      )}

      {/* Specialist banner — right after header, like all other pages */}
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

      {/* Tabs: Overview, For You, Investors, Grants, Contacts, Portfolio */}
      <InvestorPageTabs
        investorCount={investorCount}
        contactCount={contactCount}
        portfolioCount={portfolioCount}
        grantsCount={grantsCount}
        overviewContent={
          stats && <InvestorInsightsPanel stats={stats} grantsCount={grantsCount} portfolioCompanyCount={portfolioCount} />
        }
        forYouContent={
          <div className="space-y-8">
            {/* Semantic search hero */}
            <Suspense fallback={null}>
              <InvestorSearchHeroClient
                initialFirms={initialFirms}
                initialTotal={initialTotal}
                initialHasMore={initialHasMore}
                initialMatchScores={matchScores}
                initialShortlistIds={shortlistIds}
                access={access}
                productSectors={productSectors}
                companyContext={companyContext}
              />
            </Suspense>
          </div>
        }
        investorsContent={
          <InvestorBrowser
            initialFirms={initialFirms}
            initialTotal={initialTotal}
            initialHasMore={initialHasMore}
            initialMatchScores={matchScores}
            initialShortlistIds={shortlistIds}
            access={access}
            productSectors={productSectors}
          />
        }
        contactsContent={
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <ContactsDirectoryTab />
          </Suspense>
        }
        portfolioContent={
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <PortfolioDirectoryTab />
          </Suspense>
        }
        grantsContent={
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <GrantsDirectoryTab />
          </Suspense>
        }
      />
    </div>
  )
}
