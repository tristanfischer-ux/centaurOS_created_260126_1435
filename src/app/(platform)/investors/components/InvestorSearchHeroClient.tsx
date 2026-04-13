/**
 * @file InvestorSearchHeroClient.tsx
 *
 * @description Single-surface semantic search for the For You tab. Owns the
 * query state, calls searchInvestors (pgvector cosine similarity), and renders
 * the ranked results as DashboardMatchCards. Deliberately does NOT mount the
 * InvestorBrowser here — that lived on the For You tab previously and produced
 * a confusing "second search section" below the ranked cards. The full directory
 * remains available on the Investors tab.
 */

'use client'

import { useState, useCallback, useTransition } from 'react'
import { toast } from 'sonner'
import { InvestorSearchHero } from './InvestorSearchHero'
import { DashboardMatchCards } from './DashboardMatchCards'
import { searchInvestors, type InvestorFirm, type ShortlistStage, type InvestorTierAccess } from '@/actions/investors'

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
  companyContext,
}: InvestorSearchHeroClientProps) {
  // firms currently shown. Defaults to the alphabetical initial slice until the
  // user actively searches, at which point semantic-search results replace them.
  const [firms, setFirms] = useState<InvestorFirm[]>(initialFirms)
  const [lastQuery, setLastQuery] = useState<string>('')
  const [hasSearched, setHasSearched] = useState<boolean>(false)
  const [isPending, startTransition] = useTransition()

  const runSearch = useCallback((query: string) => {
    const trimmed = query.trim()
    if (trimmed.length < 6) {
      toast.error('Please describe your startup in a little more detail (6+ characters).')
      return
    }
    setLastQuery(trimmed)
    setHasSearched(true)
    startTransition(async () => {
      try {
        const result = await searchInvestors({
          query: trimmed,
          sortBy: 'name', // server ranks by similarity when query > 5 chars
          page: 1,
          pageSize: 500, // dashboard-parity — show every firm that cleared the RPC
        })
        setFirms(result.firms)
        if (result.firms.length === 0) {
          toast.info('No matching investors found. Try a broader description.')
        }
      } catch (err) {
        console.error('[investor-search] failed:', err)
        toast.error('Search failed — please try again.')
      }
    })
  }, [])

  const handleCancel = useCallback(() => {
    setLastQuery('')
    setHasSearched(false)
    setFirms(initialFirms)
  }, [initialFirms])

  const cardsTitle = hasSearched ? 'Top Matches for your search' : 'Top Matches'
  const cardsSubtitle = hasSearched
    ? `Ranked by thesis similarity against "${lastQuery.length > 60 ? lastQuery.slice(0, 60) + '…' : lastQuery}"`
    : 'Type a description or drop your pitch deck above to find your strongest investor matches.'

  return (
    <div className="space-y-8">
      <InvestorSearchHero
        onSearch={runSearch}
        onCancel={handleCancel}
        isSearching={isPending}
        companyContext={companyContext}
      />

      {hasSearched ? (
        <DashboardMatchCards
          firms={firms}
          queryText={lastQuery}
          limit={500}
          title={cardsTitle}
          subtitle={cardsSubtitle}
        />
      ) : (
        <EmptyMatchState />
      )}
    </div>
  )
}

function EmptyMatchState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center">
      <p className="text-sm font-medium text-foreground">
        Describe your startup to see your top investor matches
      </p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto leading-relaxed">
        Paste your pitch, drop a pitch deck, or click one of the example chips above.
        We rank investors by thesis fit, stage, geography, cheque size, activity and data confidence.
      </p>
    </div>
  )
}
