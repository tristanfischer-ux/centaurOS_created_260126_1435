/**
 * @file investors/page.tsx
 *
 * @description Investor Match page — paste-deck → ranked investor matches.
 *
 * Auth'd render: mockup-faithful paste-deck + extracted-profile + match-cards
 * layout per FORGEOS-INVESTORS-PAGE-MOCKUP.html (2026-04-24).
 *
 * Anonymous render: unchanged curated teaser via AnonymousInvestorsView.
 */

import type { Metadata } from 'next'
import { searchInvestors, computeMatchScores, getShortlistIds, getInvestorTierAccess, getInvestorViewCapStatus, getAnonymousInvestorsTeaser, getInvestorDirectoryStats, type FirmMatchResult } from '@/actions/investors'
import type { InvestorDirectoryStats } from '@/actions/investors'
import { createClient } from '@/lib/supabase/server'
import { InvestorDeckSearchClient } from './components/InvestorDeckSearchClient'
import { AnonymousInvestorsView } from '../../(platform)/investors/components/AnonymousInvestorsView'

export const metadata: Metadata = {
  title: 'Investor Match',
  description: 'Paste your deck. Get the investors who would back it.',
  openGraph: {
    title: 'Investor Match',
    description: 'Paste your deck. Get the investors who would back it.',
    type: 'website',
  },
}

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InvestorDirectoryPage() {
  // ── Auth gate ─────────────────────────────────────────────────────────────
  const supabaseAuth = await createClient()
  const {
    data: { user: authedUser },
  } = await supabaseAuth.auth.getUser()
  if (!authedUser) {
    const teaser = await getAnonymousInvestorsTeaser()
    return <AnonymousInvestorsView teaser={teaser} />
  }

  // ── Parallel data fetches ─────────────────────────────────────────────────
  // PERF: skipMatchEnrichment=true — the paste-deck layout doesn't pre-load
  // results; firms are fetched on demand when the founder hits Find Investors.
  // We still pre-fetch tier/shortlist/cap so the client has the right initial
  // state without a second round-trip.
  type SearchFirms = Awaited<ReturnType<typeof searchInvestors>>['firms']
  type SearchOutputs = Awaited<ReturnType<typeof searchInvestors>>['matchOutputs']
  type SearchTier = Awaited<ReturnType<typeof searchInvestors>>['resolvedTier']

  const initialFirms: SearchFirms = []
  const initialTotal = 0
  const initialMatchOutputs: SearchOutputs = {}
  let resolvedTier: SearchTier = 'free'
  const matchScores: Record<string, FirmMatchResult> = {}
  let shortlistIds: Record<string, import('@/actions/investors').ShortlistStage> = {}
  let access: import('@/actions/investors').InvestorTierAccess = {
    tier: 'free',
    detailAccess: false,
    contactsVisible: false,
    deepAccess: false,
    intelligenceAccess: false,
  }
  let viewCapStatus: import('@/actions/investors').InvestorViewCapResult | null = null
  let companyContext: {
    sector?: string | null
    stage?: string | null
    fundingStatus?: string | null
    seekingFunding?: boolean
  } = {}

  const [shortlistResult, accessResult, viewCapResult, statsResult] = await Promise.allSettled([
    getShortlistIds(),
    getInvestorTierAccess(),
    getInvestorViewCapStatus(),
    getInvestorDirectoryStats(),
  ])

  if (shortlistResult.status === 'fulfilled') {
    shortlistIds = shortlistResult.value
  }
  if (accessResult.status === 'fulfilled') {
    access = accessResult.value
    resolvedTier = access.tier
  }
  if (viewCapResult.status === 'fulfilled') {
    viewCapStatus = viewCapResult.value
  }
  let investorStats: InvestorDirectoryStats | null = null
  if (statsResult.status === 'fulfilled') {
    investorStats = statsResult.value
  }

  // Fetch company context for pre-seeding the textarea
  try {
    const supabase = await createClient()
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('foundry_id')
      .eq('id', authedUser.id)
      .maybeSingle()
    if (profileRow?.foundry_id) {
      const { data: foundry } = await supabase
        .from('foundries')
        .select('sector, stage, company_profile')
        .eq('id', profileRow.foundry_id)
        .maybeSingle()
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
  } catch {
    // Non-critical
  }

  // ── Page header + client component ───────────────────────────────────────

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="pb-6 mb-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-8 w-1.5 bg-international-orange rounded-full shadow-[0_0_10px_rgba(255,69,0,0.5)]" />
          <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">Investor Match</h1>
        </div>
        <p className="text-muted-foreground text-sm font-medium pl-4">
          Paste your deck. Get the investors who would back it. Free for the first 5 matches.
        </p>
      </div>

      {/* Paste-deck → results surface (all 3 states) */}
      <InvestorDeckSearchClient
        initialFirms={initialFirms}
        initialTotal={initialTotal}
        initialMatchScores={matchScores}
        initialShortlistIds={shortlistIds}
        initialMatchOutputs={initialMatchOutputs}
        resolvedTier={resolvedTier as 'free' | 'seed' | 'starter' | 'professional' | 'enterprise' | 'anonymous'}
        access={access}
        companyContext={companyContext}
        viewCapStatus={viewCapStatus}
        investorStats={investorStats}
      />
    </div>
  )
}
