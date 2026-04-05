/**
 * @file InvestorSearchHeroClient.tsx
 *
 * @description Client wrapper that orchestrates semantic search for investors.
 * When user submits a search query from the hero, this passes it to InvestorBrowser
 * which handles the actual filtering/pagination.
 *
 * FLOW:
 * 1. User types/uploads text in InvestorSearchHero
 * 2. Clicks "Search investors"
 * 3. We store the query and signal InvestorBrowser to use it
 * 4. Tab auto-switches to "Browse All"
 * 5. InvestorBrowser applies the semantic search and displays results
 */

'use client'

import { useState, useCallback } from 'react'
import { InvestorSearchHero } from './InvestorSearchHero'
import { InvestorBrowser } from './InvestorBrowser'
import type { InvestorFirm, ShortlistStage, InvestorTierAccess } from '@/actions/investors'

interface InvestorSearchHeroClientProps {
  initialFirms: InvestorFirm[]
  initialTotal: number
  initialHasMore: boolean
  initialMatchScores?: Record<string, number>
  initialShortlistIds?: Record<string, ShortlistStage>
  access?: InvestorTierAccess
  productSectors?: string[]
}

export function InvestorSearchHeroClient({
  initialFirms,
  initialTotal,
  initialHasMore,
  initialMatchScores = {},
  initialShortlistIds = {},
  access,
  productSectors = [],
}: InvestorSearchHeroClientProps) {
  const [heroSearchQuery, setHeroSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  const handleHeroSearch = useCallback((query: string) => {
    setHeroSearchQuery(query)
    setIsSearching(true)
    // INTENT: InvestorBrowser will handle the actual search via its internal state
    // We just need to trigger it to use this query. The browser will call searchInvestors.
    // Set a flag that browser can see to trigger its own search action.
  }, [])

  // INTENT: When hero search completes (or starts), browser takes over.
  // We wrap browser and pass the initial search query.
  return (
    <div className="space-y-8">
      <InvestorSearchHero onSearch={handleHeroSearch} isSearching={isSearching} />
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
