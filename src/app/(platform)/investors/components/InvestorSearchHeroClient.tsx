/**
 * @file InvestorSearchHeroClient.tsx
 *
 * @description Client wrapper that orchestrates semantic search for investors.
 * When user submits a search query from the hero, this passes it to InvestorBrowser
 * which handles the actual filtering/pagination. Above the browser, it also
 * renders the DashboardMatchCards — a fast, client-side ranked preview of the
 * top matches styled after Forge-Capital-Dashboard.html.
 */

'use client'

import { useState, useCallback } from 'react'
import { InvestorSearchHero } from './InvestorSearchHero'
import { InvestorBrowser } from './InvestorBrowser'
import { DashboardMatchCards } from './DashboardMatchCards'
import type { InvestorFirm, ShortlistStage, InvestorTierAccess } from '@/actions/investors'

interface InvestorSearchHeroClientProps {
  initialFirms: InvestorFirm[]
  initialTotal: number
  initialHasMore: boolean
  initialMatchScores?: Record<string, number>
  initialShortlistIds?: Record<string, ShortlistStage>
  access?: InvestorTierAccess
  productSectors?: string[]
  companyContext?: { sector?: string | null; stage?: string | null; fundingStatus?: string | null; seekingFunding?: boolean }
}

export function InvestorSearchHeroClient({
  initialFirms,
  initialTotal,
  initialHasMore,
  initialMatchScores = {},
  initialShortlistIds = {},
  access,
  productSectors = [],
  companyContext,
}: InvestorSearchHeroClientProps) {
  const [heroSearchQuery, setHeroSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  const handleHeroSearch = useCallback((query: string) => {
    setHeroSearchQuery(query)
    setIsSearching(true)
  }, [])

  const handleHeroCancel = useCallback(() => {
    setHeroSearchQuery('')
    setIsSearching(false)
  }, [])

  return (
    <div className="space-y-8">
      <InvestorSearchHero
        onSearch={handleHeroSearch}
        onCancel={handleHeroCancel}
        isSearching={isSearching}
        companyContext={companyContext}
      />

      {/* Dashboard-style ranked match cards. Client-side scoring using the
          shared calculateMatchScore — no SSE, no LLM, renders instantly. */}
      <DashboardMatchCards
        firms={initialFirms}
        companyContext={companyContext}
        limit={10}
        title="Top Matches"
        subtitle="Ranked by thesis fit, stage, geography, cheque size, activity, and data confidence."
      />

      <InvestorBrowser
        initialFirms={initialFirms}
        initialTotal={initialTotal}
        initialHasMore={initialHasMore}
        initialMatchScores={initialMatchScores}
        initialShortlistIds={initialShortlistIds}
        access={access}
        productSectors={productSectors}
        initialSearchQuery={heroSearchQuery}
        onSearchStateChange={(isLoading) => setIsSearching(isLoading)}
      />
    </div>
  )
}
