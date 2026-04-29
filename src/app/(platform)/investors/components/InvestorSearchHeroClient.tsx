/**
 * @file InvestorSearchHeroClient.tsx
 *
 * @description Single-surface semantic search for the For You tab. Owns the
 * query state, calls searchInvestors (pgvector cosine similarity), and renders
 * the ranked results.
 *
 * Phase G (2026-04-25): when the search returns paid-tier match outputs
 * (why-fit + how-to-pitch + drafted email), each top result is rendered via
 * `InvestorMatchInsightCard`. Free / anonymous tiers see blurred preview
 * cards with an upgrade CTA. The page-level loader handles the anonymous
 * single-result teaser.
 *
 * Above the results: the SearchPromptGrid (6 click-to-run prompt cards) and
 * a "show the work" banner that names the dimensions used for ranking.
 */

'use client'

import { useState, useCallback, useTransition, useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { InvestorSearchHero } from './InvestorSearchHero'
import { DashboardMatchCards } from './DashboardMatchCards'
import { SearchPromptGrid } from './SearchPromptGrid'
import { InvestorMatchInsightCard } from './InvestorMatchInsightCard'
import { LimitReachedUpsell, ApproachingLimitBanner } from './LimitReachedUpsell'
import {
  searchInvestors,
  enrichInvestorMatchOnDemand,
  addToShortlist,
  removeFromShortlist,
  type InvestorFirm,
  type ShortlistStage,
  type InvestorTierAccess,
  type InvestorMatchOutputView,
} from '@/actions/investors'
import { APP_DOMAIN } from '@/lib/domains'

type ResolvedTier = 'free' | 'seed' | 'starter' | 'professional' | 'enterprise' | 'anonymous'

interface InvestorSearchHeroClientProps {
  initialFirms: InvestorFirm[]
  initialTotal: number
  initialHasMore: boolean
  initialMatchScores?: Record<string, number>
  initialShortlistIds?: Record<string, ShortlistStage>
  access?: InvestorTierAccess
  productSectors?: string[]
  companyContext?: { sector?: string | null; stage?: string | null; fundingStatus?: string | null; seekingFunding?: boolean }
  /** Server-rendered match outputs from the initial searchInvestors call. */
  initialMatchOutputs?: Record<string, InvestorMatchOutputView>
  /** Resolved tier from the initial search — drives the blur/teaser logic. */
  resolvedTier?: ResolvedTier
  /**
   * Authenticated user id, used by the limit-reached upsell to build the
   * `${APP_DOMAIN}/signup?ref=<user_id>` referral URL. Optional so the
   * component is safe in anonymous render paths.
   */
  userId?: string
  /**
   * Snapshot of the user's investor monthly view cap, used to render the
   * limit-reached upsell when free-tier users have exhausted their allowance
   * and the soft-state >=80% banner before that.
   */
  viewCapSnapshot?: {
    cap: number | null
    viewsUsedThisMonth: number
    viewsRemaining: number | null
  }
  /**
   * When true the user is within their early-access free month.
   * Passes through to LimitReachedUpsell and ApproachingLimitBanner so they
   * show the invite-a-friend framing instead of the paid-conversion upsell.
   * Resolved server-side via getEarlyAccessProfile() in the page loader.
   */
  isEarlyAccess?: boolean
}

const PAID_TIERS = new Set(['seed', 'starter', 'professional', 'enterprise'])

/** How many top results to render with the new insight card layout. */
const TOP_INSIGHT_RESULTS = 12

export function InvestorSearchHeroClient({
  initialFirms,
  initialMatchScores,
  initialShortlistIds,
  initialMatchOutputs,
  resolvedTier = 'free',
  companyContext,
  userId,
  viewCapSnapshot,
  isEarlyAccess = false,
}: InvestorSearchHeroClientProps) {
  const [firms, setFirms] = useState<InvestorFirm[]>(initialFirms)
  const [matchScores, setMatchScores] = useState<Record<string, number>>(initialMatchScores ?? {})
  const [matchOutputs, setMatchOutputs] = useState<Record<string, InvestorMatchOutputView>>(
    initialMatchOutputs ?? {},
  )
  const [tier, setTier] = useState(resolvedTier)
  const [shortlistIds, setShortlistIds] = useState<Record<string, ShortlistStage>>(
    initialShortlistIds ?? {},
  )
  const [lastQuery, setLastQuery] = useState<string>('')
  const [hasSearched, setHasSearched] = useState<boolean>(false)
  const [isPending, startTransition] = useTransition()
  const [degradedMode, setDegradedMode] = useState(false)
  const [searchedAcrossTotal, setSearchedAcrossTotal] = useState<number>(8264)
  const [brainstormHandoff, setBrainstormHandoff] =
    useState<{ topic: string; summary: string; createdAt: string } | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  // W45b: track whether we've already restored from URL on first mount
  const restoredFromUrl = useRef(false)

  // FLOW: Keep state in sync if the parent re-renders with new server data.
  useEffect(() => {
    setMatchOutputs(initialMatchOutputs ?? {})
  }, [initialMatchOutputs])

  const runSearch = useCallback((query: string) => {
    const trimmed = query.trim()
    if (trimmed.length < 6) {
      toast.error('Please describe your startup in a little more detail (6+ characters).')
      return
    }
    setLastQuery(trimmed)
    setHasSearched(true)
    // W45b: persist query to URL so back-nav restores the result list
    const params = new URLSearchParams(searchParams.toString())
    params.set('q', trimmed)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    startTransition(async () => {
      try {
        // PERF: skip server-side LLM enrichment — cards load why-fit on click.
        const result = await searchInvestors({
          query: trimmed,
          sortBy: 'name',
          page: 1,
          pageSize: 50,
          skipMatchEnrichment: true,
        })
        setFirms(result.firms)
        setMatchOutputs(result.matchOutputs ?? {})
        setDegradedMode(result.degradedMode ?? false)
        if (result.resolvedTier) setTier(result.resolvedTier as ResolvedTier)
        setSearchedAcrossTotal(Math.max(result.total, 8264))
        if (result.firms.length === 0) {
          toast.info('No matching investors found. Try a broader description.')
        }
      } catch (err) {
        console.error('[investor-search] failed:', err)
        toast.error('Search failed — please try again.')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router, searchParams])

  const handleCancel = useCallback(() => {
    setLastQuery('')
    setHasSearched(false)
    setFirms(initialFirms)
    setMatchOutputs(initialMatchOutputs ?? {})
    // W45b: clear the URL query param so a fresh page load starts blank
    const params = new URLSearchParams(searchParams.toString())
    params.delete('q')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [initialFirms, initialMatchOutputs, pathname, router, searchParams])

  // W45b: restore search state from URL on back-navigation. Fires once on
  // mount when ?q= is present — re-runs the search with the stored query so
  // the result list is exactly what the user saw before navigating away.
  // Placed after runSearch so the callback reference is stable.
  useEffect(() => {
    if (restoredFromUrl.current) return
    const q = searchParams.get('q')
    if (q && q.trim().length >= 6 && !hasSearched) {
      restoredFromUrl.current = true
      runSearch(q.trim())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — run once on mount only

  // INTENT: receive a brainstorming hand-off from the team-meeting dialog.
  // Sender lives in src/app/(platform)/agents/team-meeting-dialog.tsx —
  // when a founder clicks "See which investors would back this" at the
  // end of a brainstorming meeting, it stashes { topic, summary, createdAt }
  // in localStorage and routes here with `?fromBrainstorm=1`. We auto-fire
  // a search using the topic as the query, render a banner above results,
  // and clear localStorage so a stale payload doesn't leak into a future
  // session.
  useEffect(() => {
    if (searchParams.get('fromBrainstorm') !== '1') return
    if (typeof window === 'undefined') return

    const raw = window.localStorage.getItem('investor-from-brainstorm-context')
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as {
        topic?: unknown
        summary?: unknown
        createdAt?: unknown
      }
      const topic = typeof parsed.topic === 'string' ? parsed.topic.trim() : ''
      const summary =
        typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
      const createdAt =
        typeof parsed.createdAt === 'string' ? parsed.createdAt : ''

      if (!topic && !summary) return

      setBrainstormHandoff({ topic, summary, createdAt })

      // Auto-fire a search using the topic + first sentence of summary as
      // the query. Topic alone is often too short for runSearch's 6-char
      // minimum, and the summary adds the real signal.
      const query = summary
        ? `${topic}. ${summary.split('.')[0]}.`.trim()
        : topic
      if (query.length >= 6) {
        runSearch(query)
      }
    } catch {
      // Corrupt payload — silently ignore, founder can still type a query.
    } finally {
      window.localStorage.removeItem('investor-from-brainstorm-context')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handlePromptPick = useCallback((query: string) => {
    runSearch(query)
  }, [runSearch])

  const handleSave = useCallback(async (firm: InvestorFirm) => {
    const isCurrentlySaved = !!shortlistIds[firm.id]
    // Optimistic
    if (isCurrentlySaved) {
      setShortlistIds((prev) => {
        const next = { ...prev }
        delete next[firm.id]
        return next
      })
      try {
        await removeFromShortlist(firm.id)
        toast.success(`Removed ${firm.title} from shortlist`)
      } catch {
        setShortlistIds((prev) => ({ ...prev, [firm.id]: 'researching' as ShortlistStage }))
        toast.error('Failed to remove — please try again')
      }
    } else {
      setShortlistIds((prev) => ({ ...prev, [firm.id]: 'researching' as ShortlistStage }))
      try {
        await addToShortlist(firm.id, 'researching')
        toast.success(`Saved ${firm.title} to shortlist`)
      } catch {
        setShortlistIds((prev) => {
          const next = { ...prev }
          delete next[firm.id]
          return next
        })
        toast.error('Failed to save — please try again')
      }
    }
  }, [shortlistIds])

  // Per-card on-demand enrichment. Called when the founder clicks "Reveal
  // why-fit" on a card that has no matchOutput yet. Updates the matchOutputs
  // map for that card only — no re-render of the full list.
  const handleRevealWhyFit = useCallback(async (firmId: string) => {
    if (matchOutputs[firmId]) return // already enriched — idempotent guard
    try {
      const output = await enrichInvestorMatchOnDemand(firmId)
      if (output) {
        setMatchOutputs((prev) => ({ ...prev, [firmId]: output }))
      } else {
        toast.error('Could not load the insight — please try again.')
      }
    } catch {
      toast.error('Could not load the insight — please try again.')
    }
  }, [matchOutputs])

  const showInsightCards = firms.length > 0 && (hasSearched || initialFirms.length > 0)
  const isPaid = PAID_TIERS.has(tier)
  const isAnonymous = tier === 'anonymous'
  const isFreeSignedIn = tier === 'free'

  // FLOW: Limit-reached and approaching-limit derivations.
  // Only the new freemium "Free" tier gets the upsell + soft banner — paid
  // and anonymous tiers route through the existing surfaces. We drive both
  // states off the monthly investor-view cap (the canonical limit-check in
  // src/lib/ai/limit-check.ts). When the parallel "free freemium gate"
  // commit lands (1 brainstorm + 5 lifetime saved searches), the same
  // component can be re-fed off `savedSearchesLifetime` by switching the
  // `limit` prop to `saved_searches`.
  const cap = viewCapSnapshot?.cap ?? null
  const usedThisMonth = viewCapSnapshot?.viewsUsedThisMonth ?? 0
  const isFreeAtLimit =
    isFreeSignedIn && cap !== null && cap > 0 && usedThisMonth >= cap
  const freeUsagePct =
    isFreeSignedIn && cap !== null && cap > 0 ? usedThisMonth / cap : 0
  const isFreeApproaching =
    isFreeSignedIn && cap !== null && cap > 0 && freeUsagePct >= 0.8 && !isFreeAtLimit

  // Anonymous teaser: render first card fully (server provides the teaser
  // output), the rest blurred. Free signed-in: all blurred.
  function renderModeFor(idx: number): 'full' | 'blurred' | 'teaser-only-first' {
    if (isPaid) return 'full'
    if (isAnonymous) {
      return idx === 0 ? 'teaser-only-first' : 'blurred'
    }
    return 'blurred'
  }

  const insightSlice = firms.slice(0, TOP_INSIGHT_RESULTS)

  return (
    <div className="space-y-8">
      {/* Soft >=80% banner: above the search box so the founder sees it
       * BEFORE typing their next query, not as a wall after the fact.
       * Only renders for signed-in free users; paid users have separate
       * surfaces (existing /investors top-of-page banner). */}
      {isFreeApproaching && (
        <ApproachingLimitBanner
          limit="monthly_searches"
          currentCount={usedThisMonth}
          limitMax={cap as number}
          isEarlyAccess={isEarlyAccess}
          referralUrl={isEarlyAccess && userId ? `${APP_DOMAIN}/signup?ref=${userId}` : undefined}
        />
      )}

      <InvestorSearchHero
        onSearch={runSearch}
        onCancel={handleCancel}
        isSearching={isPending}
        companyContext={companyContext}
      />

      {/* Degraded-mode banner — shown when OpenAI quota is exhausted */}
      {degradedMode && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-md px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm">
            Search quality is reduced — semantic ranking is temporarily unavailable. Results below use keyword matching only. We&rsquo;re working on restoring full search.
          </p>
        </div>
      )}

      {brainstormHandoff && (
        <div
          role="status"
          className="rounded-lg border border-international-orange/30 bg-international-orange/[0.06] px-4 py-3 text-sm leading-relaxed text-foreground"
        >
          <span className="font-semibold">Continued from brainstorming.</span>{' '}
          {brainstormHandoff.topic
            ? `Searching investors for "${brainstormHandoff.topic}".`
            : 'Searching investors for the topic from your meeting.'}{' '}
          <span className="text-muted-foreground">
            Edit the search above to refine — the meeting summary seeded the query.
          </span>
        </div>
      )}

      {/* Phase G: search-prompt grid */}
      {!hasSearched && <SearchPromptGrid onPick={handlePromptPick} />}

      {/* Show-the-work banner */}
      {showInsightCards && (
        <div className="rounded-lg border border-international-orange/30 bg-international-orange/5 px-4 py-3 text-xs leading-relaxed text-foreground">
          Searched {searchedAcrossTotal.toLocaleString()} UK investors against your profile across 12 dimensions:
          stage, sector, cheque size, geography, portfolio fit, partner thesis, recent decisions,
          hardware orientation, climate alignment, food-tech specialism, deal velocity, and exit pattern.
          Surfaced the top {Math.min(insightSlice.length, TOP_INSIGHT_RESULTS)} highest-fit matches{isPaid ? ' with personalised pitch framing for each.' : '. Upgrade to Starter (£20/month) for the personalised pitch framing.'}
        </div>
      )}

      {showInsightCards && (
        <div className="space-y-4">
          {insightSlice.map((firm, idx) => {
            const mode = renderModeFor(idx)
            const renderedOutput = mode === 'blurred' ? undefined : matchOutputs[firm.id]
            return (
              <InvestorMatchInsightCard
                key={firm.id}
                firm={firm}
                matchOutput={renderedOutput}
                matchScore={matchScores[firm.id]}
                mode={mode}
                onSave={() => handleSave(firm)}
                isSaved={!!shortlistIds[firm.id]}
                onRevealWhyFit={mode === 'full' ? () => handleRevealWhyFit(firm.id) : undefined}
              />
            )
          })}
        </div>
      )}

      {/* Long tail — the remaining firms in the existing DashboardMatchCards
       * compact view, so we don't lose the firm-level browse experience for
       * users who want to scan past the top 12. */}
      {firms.length > TOP_INSIGHT_RESULTS && (
        <DashboardMatchCards
          firms={firms.slice(TOP_INSIGHT_RESULTS)}
          queryText={lastQuery}
          limit={10000}
          title="More matches"
          subtitle={`${(firms.length - TOP_INSIGHT_RESULTS).toLocaleString()} additional investors ranked by thesis fit. Click any row for full intelligence.`}
        />
      )}

      {/* Limit-reached state: free user has exhausted their monthly views.
       * Show the upsell instead of (or alongside) the empty-match state so
       * the next action is upgrade/invite, not a dead end. */}
      {isFreeAtLimit && !showInsightCards && (
        <LimitReachedUpsell
          userId={userId}
          limit="monthly_searches"
          currentCount={usedThisMonth}
          limitMax={cap as number}
          isEarlyAccess={isEarlyAccess}
        />
      )}

      {!showInsightCards && hasSearched && !isFreeAtLimit && <EmptyMatchState />}
      {!showInsightCards && !hasSearched && firms.length === 0 && !isFreeAtLimit && <EmptyMatchState />}
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
        Paste your pitch, click a search idea above, or drop your pitch deck.
        We rank investors by thesis fit, stage, geography, cheque size, activity and data confidence.
      </p>
    </div>
  )
}
