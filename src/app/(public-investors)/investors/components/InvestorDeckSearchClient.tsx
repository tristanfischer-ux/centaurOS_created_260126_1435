/**
 * @file InvestorDeckSearchClient.tsx
 *
 * @description Paste-deck → investor match layout for the authenticated /investors page.
 * Replaces the Phase-G Fiona-banner + tabs pattern with the three-state mockup design:
 *   State 1 — empty (no search yet)
 *   State 2 — free tier post-search (5 visible + paywall + locked blurred cards)
 *   State 3 — paid tier post-search (all cards unlocked + usage meter)
 *
 * @mockup FORGEOS-INVESTORS-PAGE-MOCKUP.html (2026-04-24)
 *
 * Score breakdown pillars (Thesis / Stage / Geo / Cheque / Activity / Confidence):
 * computeMatchScores() now returns { score, pillars } per firm. Each match card
 * renders all 6 pillar bars via MatchPillarBars below the thesis paragraph.
 */

'use client'

import { useState, useCallback, useTransition, useRef, useMemo, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  searchInvestors,
  computeMatchScores,
  enrichInvestorMatchOnDemand,
  addToShortlist,
  removeFromShortlist,
  type InvestorFirm,
  type ShortlistStage,
  type InvestorTierAccess,
  type InvestorMatchOutputView,
  type InvestorViewCapResult,
  type FirmMatchResult,
} from '@/actions/investors'
import { Loader2 } from 'lucide-react'
import { extractDocumentText } from '@/actions/extract-document-text'
import { InvestorStatsCharts } from './InvestorStatsCharts'
import { MatchPillarBars } from '@/app/(platform)/investors/components/MatchPillarBars'
import type { InvestorDirectoryStats } from '@/actions/investors'

// ─── Types ────────────────────────────────────────────────────────────────────

type ResolvedTier = 'free' | 'seed' | 'starter' | 'professional' | 'enterprise' | 'anonymous'

interface ExtractedProfile {
  stage?: string | null
  sector?: string | null
  geo?: string | null
  raise?: string | null
  keywords?: string[]
}

interface Props {
  initialFirms: InvestorFirm[]
  initialTotal: number
  initialMatchScores: Record<string, FirmMatchResult>
  initialShortlistIds: Record<string, ShortlistStage>
  initialMatchOutputs: Record<string, InvestorMatchOutputView>
  resolvedTier: ResolvedTier
  access: InvestorTierAccess
  companyContext: {
    sector?: string | null
    stage?: string | null
    fundingStatus?: string | null
    seekingFunding?: boolean
  }
  viewCapStatus: InvestorViewCapResult | null
  /** Directory overview stats for the pre-search chart panel. Null = loading/unavailable. */
  investorStats: InvestorDirectoryStats | null
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAID_TIERS = new Set(['seed', 'starter', 'professional', 'enterprise'])
/** Free tier sees 5 results before the paywall. */
const FREE_VISIBLE = 5

/**
 * Forge Capital top-matches pagination — `Forge-Capital-Search.html` uses 8
 * per page. Tristan 2026-04-27: porting the "← Prev / Page N of M / Next →"
 * pattern verbatim, plus the 10-34% Near-Misses bucket and the Advisory
 * Intelligence section below the top matches.
 */
const TOP_PER_PAGE = 8

/** Top-matches threshold.
 * W46 fix 2026-04-28: lowered from 50 → 35 so all firms the engine returns
 * with a meaningful score appear in the ranked main list. At 50 only ~65 of
 * 200 candidates made the top bucket; founders saw a misleadingly short list.
 * Firms scoring < 35 are still dropped as noise. Near-miss grouping is now
 * only applied to < 35 firms (edge case — those groups will usually be empty
 * for a well-formed query returning 200 candidates). */
const TOP_MATCH_COMPOSITE_FLOOR = 35
const NEAR_MISS_COMPOSITE_FLOOR = 10

const NEAR_MISS_GROUP_LABELS = {
  'Stage Mismatch':       'These investors match your thesis but invest at a different stage.',
  'Geography Gap':        "Strong thesis match, but their geographic focus doesn't include your region.",
  'Cheque Size Mismatch': "Good alignment on thesis and stage, but their typical cheque size differs from what you're seeking.",
  'Thesis Alignment':     'Partial thesis overlap — they invest in adjacent sectors or related technologies.',
} as const

type NearMissGroupKey = keyof typeof NEAR_MISS_GROUP_LABELS

const EXAMPLE_CHIPS = [
  'Try: "Climate tech hardware, Seed, UK"',
  'Try: "AI drug discovery, Pre-Seed, London"',
  'Try: "B2B SaaS for supply chain, Series A"',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pull a rough extracted profile from the query text and firm attributes. */
function extractProfile(query: string, firms: InvestorFirm[]): ExtractedProfile {
  const lower = query.toLowerCase()
  // Stage detection
  const stageMatch = lower.match(/\b(pre-?seed|seed|series [a-c]|growth)\b/i)
  const stage = stageMatch ? stageMatch[0].replace(/pre-?seed/i, 'Pre-Seed').replace(/seed/i, 'Seed').replace(/series ([a-c])/i, (_: string, s: string) => `Series ${s.toUpperCase()}`) : null

  // Geography
  const geoMatch = lower.match(/\b(united kingdom|uk|london|edinburgh|manchester|dublin|europe|us|usa|united states)\b/i)
  const geo = geoMatch ? geoMatch[0].replace(/^uk$/i, 'United Kingdom').replace(/^us$|^usa$/i, 'United States') : null

  // Try to infer sector from common term clusters
  const sectorKeywords: [RegExp, string][] = [
    [/aquacu|salmon|seafood|marine|water treatment/i, 'Aquaculture · Climate · Hardware'],
    [/climate|clean tech|greentech|sustainability|carbon/i, 'Climate Tech'],
    [/ai|machine learning|deep tech/i, 'Artificial Intelligence · Deep Tech'],
    [/saas|software|b2b tech/i, 'Business-to-Business Software'],
    [/biotech|drug|pharma|life science/i, 'Life Sciences · Biotech'],
    [/hardware|robotics|iot|sensors/i, 'Hardware · Robotics'],
    [/energy|power|storage|battery|grid/i, 'Energy · Storage'],
  ]
  let sector: string | null = null
  for (const [re, label] of sectorKeywords) {
    if (re.test(query)) { sector = label; break }
  }

  // Keywords: pull significant words from query (>5 chars, not stopwords)
  const stopwords = new Set(['about','their','these','those','there','which','would','could','should','startup','company','building','based','offer','offers','currently','sector'])
  const keywords = query
    .split(/[\s,\.]+/)
    .filter(w => w.length > 5 && !stopwords.has(w.toLowerCase()))
    .slice(0, 5)
    .map(w => w.toLowerCase())

  // Infer raise from stage
  const raiseMap: Record<string, string> = {
    'Pre-Seed': '£100k–£500k',
    'Seed': '£500k–£2m',
    'Series A': '£2m–£10m',
    'Series B': '£10m–£30m',
    'Series C': '£30m+',
  }
  const raise = stage ? (raiseMap[stage] ?? null) : null

  // Fall back: try to pick geo and sector from top firm results
  if (!sector && firms.length > 0) {
    const topFirmSectors = firms.slice(0, 3).flatMap(f => f.attributes.sectors ?? [])
    if (topFirmSectors.length > 0) sector = topFirmSectors.slice(0, 2).join(' · ')
  }

  return { stage, sector, geo, raise, keywords: keywords.length > 0 ? keywords : undefined }
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function InvestorDeckSearchClient({
  initialFirms,
  initialTotal,
  initialMatchScores,
  initialShortlistIds,
  initialMatchOutputs,
  resolvedTier,
  access,
  companyContext,
  viewCapStatus,
  investorStats,
}: Props) {
  const [query, setQuery] = useState('')
  const [firms, setFirms] = useState<InvestorFirm[]>(initialFirms)
  const [total, setTotal] = useState(initialTotal)
  const [matchScores, setMatchScores] = useState<Record<string, FirmMatchResult>>(initialMatchScores)
  const [matchOutputs, setMatchOutputs] = useState<Record<string, InvestorMatchOutputView>>(initialMatchOutputs)
  const [shortlistIds, setShortlistIds] = useState<Record<string, ShortlistStage>>(initialShortlistIds)
  const [tier, setTier] = useState<ResolvedTier>(resolvedTier)
  const [hasSearched, setHasSearched] = useState(false)
  const [lastQuery, setLastQuery] = useState('')
  const [extractedProfile, setExtractedProfile] = useState<ExtractedProfile | null>(null)
  const [searchFailureMessage, setSearchFailureMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // W45b: URL persistence for back-nav restore
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const restoredFromUrl = useRef(false)

  // Forge Capital top-matches pagination state. Resets to page 0 on every
  // new search so the founder always sees their best matches first.
  const [topPage, setTopPage] = useState(0)

  const isPaid = PAID_TIERS.has(tier)
  const isFree = tier === 'free'

  // View cap
  const cap = viewCapStatus?.cap ?? null
  const usedThisMonth = viewCapStatus?.viewsUsedThisMonth ?? 0
  const viewsRemaining = viewCapStatus?.viewsRemaining ?? null

  // ── Search ────────────────────────────────────────────────────────────────

  // W45b: restore search from URL on back-nav. Placed before runSearch def
  // so the effect can reference the stable callback after mount.
  // NOTE: effect is defined here but useEffect runs after all hooks —
  // runSearch is assigned before effects fire, so this is safe. We use
  // a separate useEffect below after runSearch is defined.
  const runSearchRef = useRef<((q: string) => void) | null>(null)

  const runSearch = useCallback((q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 10) {
      toast.error('Please describe your startup in a little more detail.')
      return
    }
    setLastQuery(trimmed)
    setHasSearched(true)
    setSearchFailureMessage(null)
    // W45b: mirror query to URL so back-nav restores it
    const params = new URLSearchParams(searchParams.toString())
    params.set('q', trimmed)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    startTransition(async () => {
      try {
        const result = await searchInvestors({
          query: trimmed,
          sortBy: 'match',
          page: 1,
          // Tristan 2026-04-27: "Why are you only showing the top 50 most
          // relevant matches and not all of the matches?" — bump to 200 (the
          // ceiling the underlying pgvector RPC returns).
          pageSize: 200,
          skipMatchEnrichment: true,
        })
        setFirms(result.firms)
        setTotal(result.total)
        setMatchOutputs(result.matchOutputs ?? {})
        if (result.resolvedTier) setTier(result.resolvedTier as ResolvedTier)
        setExtractedProfile(extractProfile(trimmed, result.firms))
        // Surface engine failures as a visible callout rather than a silent empty state
        if (result.semanticFailed || result.rateLimited) {
          setSearchFailureMessage(result.failureMessage ?? 'Search temporarily unavailable — please try again.')
        } else if (result.firms.length === 0) {
          toast.info('No matching investors found. Try a broader description.')
        }
        // Fire-and-forget: score all returned firms and store { score, pillars }
        // so each card can render the 6-pillar breakdown. Pass the cosine
        // similarities the search already computed — without them the thesis
        // pillar bottoms out at 0 for free-text queries (no structured
        // profile.sector), which displays as a ~50% composite even on strong
        // semantic matches. Fixed 2026-04-27.
        if (result.firms.length > 0) {
          const ids = result.firms.map(f => f.id)
          const sims: Record<string, number> = {}
          for (const f of result.firms) {
            const s = (f.attributes as Record<string, unknown>)?._similarity
            if (typeof s === 'number') sims[f.id] = s
          }
          computeMatchScores(ids, sims)
            .then(scores => {
              setMatchScores(prev => ({ ...prev, ...scores }))
              // W47: re-sort firms so display order matches displayed % (the
              // score from computeMatchScores). Server sort used _fcComposite;
              // the card displays scores[id].score — they can disagree.
              // After scores land, re-order to be strictly descending by the
              // value the founder actually sees on each card.
              setFirms(prev =>
                [...prev].sort((a, b) => (scores[b.id]?.score ?? 0) - (scores[a.id]?.score ?? 0))
              )
            })
            .catch(() => { /* non-critical — cards show without bars */ })
        }
      } catch (err) {
        console.error('[InvestorDeckSearchClient] search failed:', err)
        toast.error('Search failed — please try again.')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router, searchParams])

  // W45b: sync runSearch ref so the restoration effect below can call it
  runSearchRef.current = runSearch

  // W45b: on mount, restore search state if ?q= is present in the URL
  // (happens when user presses Back from /investors/[id]).
  useEffect(() => {
    if (restoredFromUrl.current) return
    const q = searchParams.get('q')
    if (q && q.trim().length >= 10) {
      restoredFromUrl.current = true
      setQuery(q.trim())
      if (textareaRef.current) textareaRef.current.value = q.trim()
      runSearchRef.current?.(q.trim())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — run once on mount only

  const handleChipClick = (chipText: string) => {
    // Extract the quoted example from the chip label
    const match = chipText.match(/"([^"]+)"/)
    const q = match ? match[1] : chipText
    setQuery(q)
    if (textareaRef.current) textareaRef.current.value = q
    runSearch(q)
  }

  const handleFindInvestors = () => {
    runSearch(query)
  }

  const handleReRun = () => {
    if (lastQuery) runSearch(lastQuery)
  }

  // ── Shortlist ─────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (firm: InvestorFirm) => {
    const isSaved = !!shortlistIds[firm.id]
    if (isSaved) {
      setShortlistIds(prev => { const n = { ...prev }; delete n[firm.id]; return n })
      try {
        await removeFromShortlist(firm.id)
        toast.success(`Removed ${firm.title} from shortlist`)
      } catch {
        setShortlistIds(prev => ({ ...prev, [firm.id]: 'researching' as ShortlistStage }))
        toast.error('Failed to remove — please try again')
      }
    } else {
      setShortlistIds(prev => ({ ...prev, [firm.id]: 'researching' as ShortlistStage }))
      try {
        await addToShortlist(firm.id, 'researching')
        toast.success(`Saved ${firm.title} to shortlist`)
      } catch {
        setShortlistIds(prev => { const n = { ...prev }; delete n[firm.id]; return n })
        toast.error('Failed to save — please try again')
      }
    }
  }, [shortlistIds])

  // ── Per-card enrichment ───────────────────────────────────────────────────

  const handleRevealWhyFit = useCallback(async (firmId: string) => {
    if (matchOutputs[firmId]) return
    const output = await enrichInvestorMatchOnDemand(firmId)
    if (output) {
      setMatchOutputs(prev => ({ ...prev, [firmId]: output }))
    } else {
      toast.error('Could not load the insight — please try again.')
    }
  }, [matchOutputs])

  // ── Visible cards logic ───────────────────────────────────────────────────

  // Forge Capital partition: composite ≥ 35 = "top match" (W46 fix 2026-04-28,
  // was ≥ 50), 10-34 = "near miss", < 10 dropped. `_fcComposite` is set
  // server-side by searchInvestors when the
  // semantic path runs. Firms without it (keyword fallback, no query) all
  // bucket as top-matches so the UX doesn't break.
  const partitioned = useMemo(() => {
    const top: InvestorFirm[] = []
    const nearMiss: InvestorFirm[] = []
    for (const f of firms) {
      const c = f.attributes._fcComposite
      if (c == null) {
        top.push(f)
        continue
      }
      if (c >= TOP_MATCH_COMPOSITE_FLOOR) top.push(f)
      else if (c >= NEAR_MISS_COMPOSITE_FLOOR) nearMiss.push(f)
    }
    return { top, nearMiss }
  }, [firms])

  // Free tier still shows the first 5 + paywall on top matches; pagination
  // and Near Misses + Advisory only render for paid tiers.
  const visibleFirms = isPaid ? partitioned.top : partitioned.top.slice(0, FREE_VISIBLE)
  const lockedFirms = isPaid ? [] : partitioned.top.slice(FREE_VISIBLE, FREE_VISIBLE + 2)
  const hiddenCount = isPaid ? 0 : Math.max(0, partitioned.top.length - FREE_VISIBLE)

  // Paginated slice of top matches (paid only). Reset to page 0 whenever the
  // firms list changes (new search).
  const totalTopPages = Math.max(1, Math.ceil(visibleFirms.length / TOP_PER_PAGE))
  const safeTopPage = Math.min(topPage, totalTopPages - 1)
  const paginatedTop = useMemo(
    () => visibleFirms.slice(safeTopPage * TOP_PER_PAGE, (safeTopPage + 1) * TOP_PER_PAGE),
    [visibleFirms, safeTopPage],
  )

  // Reset to page 0 on every fresh search.
  const visibleFirmsKey = visibleFirms.map(f => f.id).join(',')
  useEffect(() => {
    if (topPage !== 0) setTopPage(0)
    // We intentionally only reset when the underlying ID list changes, not on
    // page click. eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFirmsKey])

  // Near-miss grouping: bucket each firm into the dimension where it's
  // weakest. Mirrors `Forge-Capital-Search.html` lines 824-833.
  const nearMissGroups = useMemo(() => {
    const groups: Record<NearMissGroupKey, InvestorFirm[]> = {
      'Stage Mismatch': [],
      'Geography Gap': [],
      'Cheque Size Mismatch': [],
      'Thesis Alignment': [],
    }
    for (const f of partitioned.nearMiss) {
      const p = f.attributes._fcPillars
      if (!p) {
        groups['Thesis Alignment'].push(f)
        continue
      }
      let weakest: NearMissGroupKey = 'Thesis Alignment'
      let weakestVal = p.thesis
      if (p.stage  != null && p.stage  < weakestVal) { weakest = 'Stage Mismatch';       weakestVal = p.stage  }
      if (p.geo    != null && p.geo    < weakestVal) { weakest = 'Geography Gap';        weakestVal = p.geo    }
      if (p.cheque != null && p.cheque < weakestVal) { weakest = 'Cheque Size Mismatch'; weakestVal = p.cheque }
      groups[weakest].push(f)
    }
    return groups
  }, [partitioned.nearMiss])

  // Advisory Intelligence — derived from near-misses + top-matches.
  // Three flavours mirror Forge-Capital-Search.html lines 877-961:
  //   1. Geographic expansion: firms with strong thesis but in regions the
  //      top-matches don't cover.
  //   2. Stage adjacency: stage-mismatched firms with strong thesis.
  //   3. Alternative capital sources: non-VC types with thesis match.
  const advisoryItems = useMemo(() => {
    const items: Array<{ title: string; body: string }> = []

    // 1. Geographic expansion
    const topGeos = new Set<string>()
    for (const f of partitioned.top.slice(0, 20)) {
      const arr = f.attributes.geo_focus ?? []
      for (const g of arr) topGeos.add(g.toLowerCase().trim())
    }
    const geoBuckets: Record<string, InvestorFirm[]> = {}
    for (const f of partitioned.nearMiss) {
      const p = f.attributes._fcPillars
      if (!p || p.thesis < 40) continue
      const arr = f.attributes.geo_focus ?? []
      for (const g of arr) {
        const key = g.trim()
        if (!key) continue
        if (topGeos.has(key.toLowerCase())) continue
        if (!geoBuckets[key]) geoBuckets[key] = []
        geoBuckets[key].push(f)
      }
    }
    const sortedGeos = Object.entries(geoBuckets)
      .filter(([, list]) => list.length >= 3)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
    for (const [region, list] of sortedGeos) {
      const avgThesis = Math.round(
        list.reduce((s, r) => s + ((r.attributes._fcPillars?.thesis ?? 0)), 0) / list.length,
      )
      items.push({
        title: `Expand to ${region}?`,
        body: `${list.length} investors in ${region} have thesis alignment with your company (avg ${avgThesis}% thesis match). They're not in your top matches because of geographic focus — if you positioned for ${region}, these become viable targets.`,
      })
    }

    // 2. Stage adjacency
    const stageNearMisses = partitioned.nearMiss.filter(f => {
      const p = f.attributes._fcPillars
      return p && p.stage != null && p.stage < 60 && p.thesis > 50
    })
    if (stageNearMisses.length >= 3) {
      const stageCounts: Record<string, number> = {}
      for (const f of stageNearMisses) {
        const stages = f.attributes.stage_focus ?? []
        for (const s of stages) stageCounts[s] = (stageCounts[s] ?? 0) + 1
      }
      const top = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0]
      if (top) {
        items.push({
          title: 'Stage timing opportunity',
          body: `${stageNearMisses.length} investors have strong thesis alignment but primarily invest at ${top[0]} stage. These could be valuable relationships to build now for a future round, or for introductions to their portfolio companies.`,
        })
      }
    }

    // 3. Alternative capital sources
    const altTypes = partitioned.nearMiss.filter(f => {
      const t = f.attributes.firm_type
      const p = f.attributes._fcPillars
      return t && t !== 'VC' && t !== 'PE' && p && p.thesis > 45
    })
    if (altTypes.length >= 3) {
      const typeCounts: Record<string, number> = {}
      for (const f of altTypes) {
        const t = f.attributes.firm_type as string
        typeCounts[t] = (typeCounts[t] ?? 0) + 1
      }
      const top = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]
      if (top) {
        const [typeName, count] = top
        const note: Record<string, string> = {
          Government:      'Government grants and programmes can provide non-dilutive funding alongside (or instead of) equity.',
          'Corporate VC':  'Corporate VCs can offer strategic partnerships alongside investment — useful for go-to-market acceleration.',
          Accelerator:     'Accelerators can provide mentorship, network, and follow-on funding connections.',
          'Family Office': 'Family offices often have longer time horizons and more flexible terms than institutional VCs.',
        }
        items.push({
          title: 'Alternative capital sources',
          body: `${count} ${typeName} entities match your thesis but have different engagement models. ${note[typeName] ?? 'These could complement traditional VC funding.'}`,
        })
      }
    }

    return items
  }, [partitioned.top, partitioned.nearMiss])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0">
      {/* ── Paid: usage meter ─────────────────────────────────────────────── */}
      {isPaid && cap !== null && (
        <UsageMeter
          used={usedThisMonth}
          cap={cap}
          remaining={viewsRemaining}
        />
      )}

      {/* ── Paste panel ───────────────────────────────────────────────────── */}
      <PastePanel
        query={query}
        setQuery={setQuery}
        textareaRef={textareaRef}
        onChipClick={handleChipClick}
        onFindInvestors={handleFindInvestors}
        onReRun={hasSearched ? handleReRun : undefined}
        hasSearched={hasSearched}
        isPending={isPending}
        companyContext={companyContext}
        isPaid={isPaid}
      />

      {/* ── Extracted profile ─────────────────────────────────────────────── */}
      {hasSearched && extractedProfile && (
        <ExtractedProfileCard profile={extractedProfile} />
      )}

      {/* ── Results bar ───────────────────────────────────────────────────── */}
      {hasSearched && firms.length > 0 && (
        <ResultsBar
          total={total}
          visibleCount={visibleFirms.length}
          isPaid={isPaid}
          isFree={isFree}
          freeVisible={FREE_VISIBLE}
          lastQuery={lastQuery}
          isPending={isPending}
        />
      )}

      {/* ── Match cards (paginated for paid; first 5 only for free) ──────── */}
      {hasSearched && (isPaid ? paginatedTop : visibleFirms).map((firm, i) => {
        const rank = isPaid ? safeTopPage * TOP_PER_PAGE + i + 1 : i + 1
        return (
          <MatchCard
            key={firm.id}
            rank={rank}
            firm={firm}
            matchScore={matchScores[firm.id]?.score}
            pillars={matchScores[firm.id]?.pillars}
            matchOutput={matchOutputs[firm.id]}
            isSaved={!!shortlistIds[firm.id]}
            onSave={() => handleSave(firm)}
            onRevealWhyFit={isPaid ? () => handleRevealWhyFit(firm.id) : undefined}
            isLocked={false}
            isPaid={isPaid}
          />
        )
      })}

      {/* ── Top-matches pagination (paid only, > 1 page) ─────────────────── */}
      {hasSearched && isPaid && totalTopPages > 1 && (
        <TopMatchesPagination
          page={safeTopPage}
          totalPages={totalTopPages}
          onPrev={() => setTopPage(p => Math.max(0, p - 1))}
          onNext={() => setTopPage(p => Math.min(totalTopPages - 1, p + 1))}
        />
      )}

      {/* ── Paywall (free + results) ──────────────────────────────────────── */}
      {hasSearched && isFree && firms.length > 0 && (
        <PaywallCard hiddenCount={hiddenCount} />
      )}

      {/* ── Locked blurred cards (preview of what's behind paywall) ──────── */}
      {hasSearched && lockedFirms.map((firm, i) => (
        <MatchCard
          key={firm.id}
          rank={FREE_VISIBLE + i + 1}
          firm={firm}
          matchScore={matchScores[firm.id]?.score}
          pillars={matchScores[firm.id]?.pillars}
          matchOutput={undefined}
          isSaved={false}
          onSave={undefined}
          onRevealWhyFit={undefined}
          isLocked={true}
          isPaid={false}
        />
      ))}

      {/* ── Near Misses (paid only) ──────────────────────────────────────── */}
      {hasSearched && isPaid && partitioned.nearMiss.length > 0 && (
        <NearMissesSection groups={nearMissGroups} totalCount={partitioned.nearMiss.length} />
      )}

      {/* ── Advisory Intelligence (paid only) ────────────────────────────── */}
      {hasSearched && isPaid && advisoryItems.length > 0 && (
        <AdvisorySection items={advisoryItems} />
      )}

      {/* ── Pre-search charts (visible before search, hidden after results) ── */}
      {!hasSearched && investorStats && (
        <InvestorStatsCharts stats={investorStats} />
      )}

      {/* ── Empty state (before search, no stats available) ──────────────── */}
      {!hasSearched && !investorStats && <EmptyState />}

      {/* ── Search failure callout (engine error / rate limit) ───────────── */}
      {hasSearched && !isPending && searchFailureMessage && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 mt-6 flex items-start gap-3">
          <span className="mt-0.5 text-amber-500 shrink-0" aria-hidden>&#9888;</span>
          <div>
            <p className="text-sm font-medium text-amber-800">{searchFailureMessage}</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Your query was received — the issue is on our end. Waiting a moment and searching again usually resolves it.
            </p>
          </div>
        </div>
      )}

      {/* ── Empty results (search with 0 results, no engine failure) ─────── */}
      {hasSearched && !isPending && firms.length === 0 && !searchFailureMessage && (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center mt-6">
          <p className="text-sm font-medium text-foreground">No investors matched that description</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto leading-relaxed">
            Try broadening your description — include the sector, stage, and geography.
          </p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// ── Usage meter (paid tier) ─────────────────────────────────────────────────

function UsageMeter({ used, cap, remaining }: { used: number; cap: number; remaining: number | null }) {
  const pct = Math.min(100, (used / cap) * 100)
  const resetDate = new Date()
  resetDate.setMonth(resetDate.getMonth() + 1, 1)
  const resetLabel = resetDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg shadow-sm bg-card px-5 py-3.5 mb-6">
      <span className="text-sm text-foreground">
        Usage this month:{' '}
        <strong className="text-international-orange">{used} of {cap} investor views</strong>
        {' '}· resets {resetLabel}
      </span>
      <div className="flex-1 max-w-[200px] h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-international-orange rounded-full" style={{ width: `${pct}%` }} />
      </div>
      {remaining !== null && remaining > 0 && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {remaining} left · £0.50/view over
        </span>
      )}
      {remaining !== null && remaining <= 0 && (
        <span className="text-xs text-destructive whitespace-nowrap">Cap reached · £0.50/view</span>
      )}
    </div>
  )
}

// ── Paste panel ─────────────────────────────────────────────────────────────

interface PastePanelProps {
  query: string
  setQuery: (v: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onChipClick: (chip: string) => void
  onFindInvestors: () => void
  onReRun?: () => void
  hasSearched: boolean
  isPending: boolean
  companyContext: Props['companyContext']
  isPaid: boolean
}

function PastePanel({
  query,
  setQuery,
  textareaRef,
  onChipClick,
  onFindInvestors,
  onReRun,
  hasSearched,
  isPending,
  isPaid,
}: PastePanelProps) {
  const [isExtracting, setIsExtracting] = useState(false)

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsExtracting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await extractDocumentText(formData)
      if ('success' in result && result.success) {
        setQuery(result.text.slice(0, 2000))
        toast.success(`Text extracted from ${result.fileName}`)
      } else {
        toast.error(('error' in result && result.error) ? result.error : 'Could not extract text from file')
      }
    } catch {
      toast.error('Failed to extract text from file')
    } finally {
      setIsExtracting(false)
      // Reset so the same file can be re-selected if needed
      e.target.value = ''
    }
  }, [setQuery])

  return (
    <div className="bg-card rounded-xl p-7 mb-7 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-5 mb-4">
        <div>
          <h3 className="text-lg font-bold text-foreground mb-1">
            {hasSearched ? (isPaid ? 'Search another deck' : 'What are you building?') : 'What are you building?'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasSearched
              ? 'Edit above to re-run, or paste a new deck.'
              : 'A paragraph, an exec summary, or a full deck. Anything with some specifics works.'}
          </p>
        </div>
        {hasSearched && onReRun && (
          <button
            onClick={onReRun}
            className="inline-flex items-center gap-2 border border-border text-foreground bg-card font-semibold px-5 py-2.5 rounded-lg text-sm cursor-pointer hover:bg-muted/50 transition-colors whitespace-nowrap"
          >
            ↻ Rerun
          </button>
        )}
        {hasSearched && isPaid && !onReRun && (
          <button
            onClick={() => {}}
            className="inline-flex items-center gap-2 border border-border text-foreground bg-card font-semibold px-5 py-2.5 rounded-lg text-sm cursor-pointer hover:bg-muted/50 transition-colors"
          >
            + New search
          </button>
        )}
      </div>

      {/* Chips — only show before first search */}
      {!hasSearched && (
        <div className="flex gap-2 flex-wrap mb-3.5">
          {EXAMPLE_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => onChipClick(chip)}
              className="text-xs px-3 py-1.5 rounded-full bg-muted text-muted-foreground border border-border cursor-pointer hover:border-international-orange hover:text-international-orange transition-all"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        className="w-full min-h-[128px] border border-input rounded-lg px-4 py-3.5 text-sm leading-relaxed resize-y outline-none bg-muted/30 text-foreground focus:border-international-orange focus:bg-card transition-colors"
        placeholder="FFT is a UK-based startup in the water treatment and aquaculture sector that offers a proprietary photocatalytic oxidation platform..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      {/* Actions row */}
      <div className="flex items-center justify-between mt-3.5 gap-4 flex-wrap">
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground px-3 py-2 border border-dashed border-input rounded-lg cursor-pointer hover:border-international-orange hover:text-international-orange transition-all">
          {isExtracting ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting…</>
          ) : (
            '📎 or upload .pdf .pptx .docx'
          )}
          <input
            type="file"
            accept=".pdf,.pptx,.docx"
            className="hidden"
            onChange={handleFileChange}
            disabled={isExtracting}
          />
        </label>
        <button
          onClick={onFindInvestors}
          disabled={isPending || query.trim().length < 10}
          className="inline-flex items-center gap-2.5 bg-international-orange text-white font-bold px-6 py-3 rounded-lg text-sm cursor-pointer hover:bg-international-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Searching…</>
          ) : (
            'Find Investors →'
          )}
        </button>
      </div>
    </div>
  )
}

// ── Extracted profile card ──────────────────────────────────────────────────

function ExtractedProfileCard({ profile }: { profile: ExtractedProfile }) {
  return (
    <div className="bg-international-orange/[0.06] border border-international-orange/20 rounded-lg px-5 py-4 mb-7">
      <div className="flex items-center justify-between mb-2.5">
        <strong className="text-xs text-international-orange tracking-wider uppercase">Extracted from your deck</strong>
        <button className="text-xs text-international-orange underline">Edit →</button>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {profile.stage && (
          <ProfilePill label="Stage" value={profile.stage} />
        )}
        {profile.sector && (
          <ProfilePill label="Sector" value={profile.sector} />
        )}
        {profile.geo && (
          <ProfilePill label="Geo" value={profile.geo} />
        )}
        {profile.raise && (
          <ProfilePill label="Raise" value={profile.raise} />
        )}
        {profile.keywords && profile.keywords.length > 0 && (
          <ProfilePill label="Keywords" value={profile.keywords.join(' · ')} />
        )}
        {!profile.stage && !profile.sector && !profile.geo && (
          <ProfilePill label="Query" value="Analysed — results ranked by thesis fit" />
        )}
      </div>
    </div>
  )
}

function ProfilePill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex gap-1.5 items-center bg-card border border-international-orange/20 rounded-full px-3.5 py-1.5 text-xs">
      <span className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</span>
      <span className="text-foreground font-bold">{value}</span>
    </span>
  )
}

// ── Results bar ─────────────────────────────────────────────────────────────

function ResultsBar({
  total,
  visibleCount,
  isPaid,
  isFree,
  freeVisible,
  lastQuery,
  isPending,
}: {
  total: number
  visibleCount: number
  isPaid: boolean
  isFree: boolean
  freeVisible: number
  lastQuery: string
  isPending: boolean
}) {
  // Council audit 2026-04-26: founders flagged "Found 199 matching investors"
  // as feeling fake/template-driven — every query came back ~200 because the
  // RPC match_count is capped at 200. Reframed to lead with the visible count
  // (the actual ranked subset) and demote the wider candidate-pool number to
  // a secondary caption. Honest about what's shown and what's available.
  const shownNow = isPending ? '…' : (isFree ? Math.min(freeVisible, total) : visibleCount)
  return (
    <div className="flex flex-col gap-1 py-4 mb-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-foreground">
          {lastQuery && <span className="text-muted-foreground mr-1">{lastQuery.slice(0, 40)}{lastQuery.length > 40 ? '…' : ''} ·</span>}
          <strong className="text-international-orange">
            Top {shownNow} most relevant {isFree ? '(free preview)' : 'matches'}
          </strong>
        </div>
        <div className="flex gap-2 flex-wrap">
          <FilterChip active>Best match</FilterChip>
          <FilterChip>VCs only</FilterChip>
          <FilterChip>+ Grants</FilterChip>
          <FilterChip>United Kingdom</FilterChip>
          {isPaid && <FilterChip>⇩ Export</FilterChip>}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Ranked by thesis fit, stage, geography, cheque size, and recent activity. Cards below are the top {shownNow} of {total}+ candidates surfaced from your description.
      </div>
    </div>
  )
}

function FilterChip({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-all ${
      active
        ? 'bg-international-orange/10 border-international-orange text-international-orange font-semibold'
        : 'border-border bg-card text-muted-foreground hover:border-international-orange/50'
    }`}>
      {children}
    </span>
  )
}

// ── Match card ──────────────────────────────────────────────────────────────
// DECISION: Ported from Forge Capital 07b-export-python.py lines 2347-2360.
// Structure: header row (rank + name + type chip | composite %) · meta line ·
// 6-column scorecard grid · 260-char thesis · sector tags row.
// Behaviour (why-fit / pitch-guidance / shortlist / lock-state / view-cap) is
// unchanged — only the visual shell is replaced.

const SCORECARD_PILLARS: Array<{ key: keyof FirmMatchResult['pillars']; label: string; weight: string }> = [
  { key: 'thesis',     label: 'Thesis',     weight: '55%' },
  { key: 'stage',      label: 'Stage',      weight: '10%' },
  { key: 'geo',        label: 'Geo',        weight: '15%' },
  { key: 'cheque',     label: 'Cheque',     weight: '10%' },
  { key: 'activity',   label: 'Activity',   weight: '3%'  },
  { key: 'confidence', label: 'Confidence', weight: '2%'  },
]

interface MatchCardProps {
  rank: number
  firm: InvestorFirm
  matchScore?: number
  /** 6-pillar breakdown from calculateMatchScore — drives scorecard grid. */
  pillars?: FirmMatchResult['pillars']
  matchOutput?: InvestorMatchOutputView
  isSaved: boolean
  onSave?: () => void
  onRevealWhyFit?: () => Promise<void>
  isLocked: boolean
  isPaid: boolean
}

function MatchCard({
  rank,
  firm,
  matchScore,
  pillars,
  matchOutput,
  isSaved,
  onSave,
  onRevealWhyFit,
  isLocked,
  isPaid,
}: MatchCardProps) {
  const attrs = firm.attributes
  const firmType = attrs.firm_type
    ? normaliseFirmType(attrs.firm_type)
    : firm.subcategory ?? 'VC'
  const city = attrs.hq_city ?? attrs.location ?? null

  // Meta line: {geo} · {cheque-range} · {stage}
  const chequeMin  = attrs.cheque_range_gbp?.min
  const chequeMax  = attrs.cheque_range_gbp?.max
  const chequeStr  = chequeMin || chequeMax
    ? [chequeMin ? `£${fmtCheque(chequeMin)}` : null, chequeMax ? `£${fmtCheque(chequeMax)}` : null]
        .filter(Boolean).join('–')
    : null
  const stageFocusArr = attrs.stage_focus ?? []
  const stageStr = stageFocusArr.slice(0, 2).join(' / ') || null

  // Lead with ideal_company_profile (per Forge Capital structure) — falls back
  // to investment_thesis then description. Tristan 2026-04-27: ICP is the
  // single most useful thing for a founder reading a search-result card.
  // Tristan 2026-04-27 mandate: result cards must show investment_thesis first
  // (e.g. "Climate VC is a SEIS fund, fully deployed, focusing on pre-seed and
  // seed stage climate startups…"), NOT the ideal_company_profile shorthand
  // ("Elite founding teams that are building solutions to decarbonise…").
  // Fall back to ICP / description only when thesis is null. Mirrors the
  // Forge-Capital-Search.html result-card snippet (line 795: r.td → 200 chars).
  const thesis  = attrs.investment_thesis ?? attrs.ideal_company_profile ?? firm.description ?? null
  const sectors = attrs.sectors ?? []

  // Why-fit / how-to-pitch — expand state
  const [expanded, setExpanded] = useState(false)
  const [isEnriching, startEnrichTransition] = useTransition()
  const [enrichFailed, setEnrichFailed] = useState(false)

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isPaid) return
    if (!expanded && !matchOutput && onRevealWhyFit) {
      setExpanded(true)
      startEnrichTransition(async () => {
        try {
          await onRevealWhyFit()
        } catch {
          setEnrichFailed(true)
        }
      })
    } else {
      setExpanded(prev => !prev)
    }
  }

  const handleSaveClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSave?.()
  }

  // When locked, render as a div. When unlocked, render as a Link.
  if (isLocked) {
    return (
      // STRUCTURE: Forge Capital search-result-card (locked variant)
      // 1px border · white bg · 12px radius · 14px padding (p-3.5)
      <div
        className={`bg-card border border-border/40 shadow-sm rounded-xl p-3.5 mb-2.5 transition-all opacity-80`}
      >
      {/* ── Header row: rank + name + type chip | composite % ── */}
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0 flex-1">
          {/* Result name */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`font-bold text-sm text-foreground leading-snug blur-[5px] select-none`}>
              {rank}. {'████████ Capital'}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-bold tracking-wider uppercase flex-shrink-0">
              {firmType}
            </span>
          </div>
          {/* Meta line: geo · cheque · stage */}
          <div className={`text-xs text-muted-foreground mt-0.5 blur-[5px]`}>
            {[city, chequeStr, stageStr].filter(Boolean).join(' · ') || ' '}
          </div>
        </div>

        {/* Composite score — top right */}
        <div className="text-right flex-shrink-0">
          {matchScore !== undefined ? (
            <>
              <div className="text-xl font-black text-foreground leading-none tabular-nums">
                {Math.round(matchScore)}%
              </div>
              <div className="text-[10px] text-muted-foreground leading-none mt-0.5">match</div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}

          {/* Hardware fit score badge */}
          {(() => {
            const hwScore = (firm.attributes as { hardware_fit_score?: number }).hardware_fit_score ??
                            (firm as unknown as { hardware_fit_score?: number }).hardware_fit_score
            if (typeof hwScore === 'number' && hwScore >= 0 && hwScore <= 10) {
              let badgeColor = 'bg-muted text-muted-foreground'
              if (hwScore >= 7.0) badgeColor = 'bg-green-100 text-green-700'
              else if (hwScore >= 4.0) badgeColor = 'bg-amber-100 text-amber-700'

              return (
                <div className={`mt-1 text-[10px] px-2 py-0.5 rounded-full inline-flex items-center ${badgeColor}`}>
                  Hardware fit {hwScore.toFixed(1)}/10
                </div>
              )
            }
            return null
          })()}

        </div>
      </div>

      {/* Thesis paragraph — blurred for locked cards */}
      {thesis && (
        <p className="text-xs text-muted-foreground mb-2.5 leading-relaxed blur-[5px] select-none">
          {'██████ seed-stage ██████ & hardware. £███k–£███m cheques. Portfolio includes ██████████ — active deployer.'}
        </p>
      )}
    </div>
    )
  }

  // Unlocked card — W27 "cover-link" pattern:
  //   - Outer div is position:relative and holds all content.
  //   - An absolutely-positioned <Link> (the "cover") fills the entire card.
  //     It is the only <a> tag so HTML5 interactive-inside-interactive is
  //     avoided. It uses aria-hidden + tabIndex=-1 so screen-readers use the
  //     card's own landmark, not a duplicate link.
  //   - Interactive children (Save button, accordion) sit above the cover via
  //     position:relative + z-index:10. They call e.stopPropagation() so their
  //     own onClick fires without the cover's href navigation also triggering.
  //   - This approach (a) works in real browsers, (b) is traversable by
  //     agent-browser / Playwright via the native <a> href, (c) keeps the
  //     card content semantically outside the anchor so it's valid HTML5.
  return (
    <div
      className={`relative bg-card border border-border/40 shadow-sm rounded-xl p-3.5 mb-2.5 transition-all cursor-pointer hover:shadow-md hover:-translate-y-px`}
    >
      {/* Cover link — makes the whole card navigable via native <a> href */}
      <Link
        href={`/investors/${firm.id}`}
        className="absolute inset-0 rounded-xl"
        aria-hidden
        tabIndex={-1}
      />
      {/* ── Header row: rank + name + type chip | composite % ── */}
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0 flex-1">
          {/* Result name */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`font-bold text-sm text-foreground leading-snug`}>
              {rank}. {firm.title}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-bold tracking-wider uppercase flex-shrink-0">
              {firmType}
            </span>
          </div>
          {/* Meta line: geo · cheque · stage */}
          <div className={`text-xs text-muted-foreground mt-0.5`}>
            {[city, chequeStr, stageStr].filter(Boolean).join(' · ') || ' '}
          </div>
        </div>

        {/* Composite score — top right */}
        <div className="text-right flex-shrink-0">
          {matchScore !== undefined ? (
            <>
              <div className="text-xl font-black text-foreground leading-none tabular-nums">
                {Math.round(matchScore)}%
              </div>
              <div className="text-[10px] text-muted-foreground leading-none mt-0.5">match</div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">—</div>
          )}

          {/* Hardware fit score badge */}
          {(() => {
            const hwScore = (firm.attributes as { hardware_fit_score?: number }).hardware_fit_score ??
                            (firm as unknown as { hardware_fit_score?: number }).hardware_fit_score
            if (typeof hwScore === 'number' && hwScore >= 0 && hwScore <= 10) {
              let badgeColor = 'bg-muted text-muted-foreground'
              if (hwScore >= 7.0) badgeColor = 'bg-green-100 text-green-700'
              else if (hwScore >= 4.0) badgeColor = 'bg-amber-100 text-amber-700'

              return (
                <div className={`mt-1 text-[10px] px-2 py-0.5 rounded-full inline-flex items-center ${badgeColor}`}>
                  Hardware fit {hwScore.toFixed(1)}/10
                </div>
              )
            }
            return null
          })()}

          {/* Save button — below score, paid only. relative z-10 lifts above cover link. */}
          {onSave && (
            <button
              type="button"
              onClick={handleSaveClick}
              className={`relative z-10 mt-1.5 text-[10px] px-2 py-0.5 rounded border transition-all ${
                isSaved
                  ? 'border-international-orange text-international-orange bg-international-orange/10'
                  : 'border-border text-muted-foreground hover:border-international-orange hover:text-international-orange'
              }`}
            >
              {isSaved ? '★ Saved' : '☆ Save'}
            </button>
          )}
        </div>
      </div>

      {/* ── Metadata chip row: firm type · stage focus · cheque range · active deploying ── */}
      {(() => {
        // Probe cheque_range_gbp shape at runtime (could be null, object {min,max}, or array)
        const chequeRange = attrs.cheque_range_gbp
        let chequeChip: string | null = null
        if (chequeRange && typeof chequeRange === 'object' && !Array.isArray(chequeRange)) {
          const { min, max } = chequeRange as { min?: number; max?: number }
          if (min || max) {
            chequeChip = [
              min ? `£${fmtCheque(min)}` : null,
              max ? `£${fmtCheque(max)}` : null,
            ].filter(Boolean).join(' – ')
          }
        } else if (Array.isArray(chequeRange) && chequeRange.length >= 2) {
          const arr = chequeRange as unknown as [number, number]
          chequeChip = `£${fmtCheque(arr[0])} – £${fmtCheque(arr[1])}`
        }

        const stageFocusChips = (attrs.stage_focus ?? []).slice(0, 3)
        const isActiveDeploying: boolean | null =
          typeof attrs.is_active_deploying === 'boolean' ? attrs.is_active_deploying : null
        const firmTypeChip = attrs.firm_type ? normaliseFirmType(attrs.firm_type) : null

        const hasAnyChip = firmTypeChip || stageFocusChips.length > 0 || chequeChip || isActiveDeploying !== null
        if (!hasAnyChip) return null

        return (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {/* Firm type */}
            {firmTypeChip && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-foreground font-semibold uppercase tracking-wide">
                {firmTypeChip}
              </span>
            )}

            {/* Stage focus — up to 3 chips */}
            {stageFocusChips.map((stage) => (
              <span
                key={stage}
                className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-foreground uppercase tracking-wide"
              >
                {stage}
              </span>
            ))}

            {/* Cheque range */}
            {chequeChip && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-foreground uppercase tracking-wide">
                {chequeChip}
              </span>
            )}

            {/* Active deploying */}
            {isActiveDeploying === true && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                ✓ Active
              </span>
            )}
            {isActiveDeploying === false && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground italic">
                Not actively deploying
              </span>
            )}
          </div>
        )
      })()}

      {/* ── 6-column scorecard grid (Forge Capital renderScoreDimS pattern) ── */}
      <div className="grid gap-1.5 mb-2.5" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        {SCORECARD_PILLARS.map(({ key, label, weight }) => {
          const raw   = pillars?.[key]
          const hasScore = raw !== undefined
          const value = hasScore ? raw : 0
          const isNA  = !hasScore

          // Colour tiers from Forge Capital CSS (lines 937-950 of 07b)
          let fillColor = '#d1d5db' // score-na grey
          if (!isNA) {
            if (value >= 70) fillColor = '#16a34a'      // green  (score-high)
            else if (value >= 40) fillColor = '#f59e0b' // amber  (score-mid)
            else fillColor = '#dc2626'                   // red    (score-low)
          }

          return (
            <div key={key} className="text-center">
              {/* 9px uppercase label */}
              <div
                className="font-medium uppercase mb-0 truncate"
                style={{ fontSize: '9px', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.3px' }}
              >
                {label}
              </div>
              {/* Weight annotation — shows the formula contribution */}
              <div
                className="mb-1 truncate"
                style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))', opacity: 0.6 }}
              >
                wt {weight}
              </div>
              {/* 5px-tall bar */}
              <div
                className="w-full overflow-hidden"
                style={{ height: '5px', borderRadius: '3px', background: '#e5e7eb' }}
              >
                {!isNA && (
                  <div
                    style={{
                      height: '100%',
                      borderRadius: '3px',
                      width: `${Math.min(100, Math.max(0, value))}%`,
                      background: fillColor,
                    }}
                  />
                )}
              </div>
              {/* Small bold value below */}
              <div
                className="font-semibold mt-0.5 tabular-nums"
                style={{ fontSize: '10px', color: isNA ? '#9ca3af' : 'hsl(var(--foreground))' }}
              >
                {isNA ? 'N/A' : value}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Formula key — shows weights so composite % is verifiable ── */}
      {pillars && matchScore !== undefined && (
        <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
          Composite {Math.round(matchScore)}% = thesis×55% + geo×15% + stage×10% + cheque×10% + activity×3% + confidence×2% (missing dimensions excluded and weights renormalised)
        </p>
      )}

      {/* ── Thesis paragraph — 260 chars max ── */}
      {thesis && (
        <p className="text-xs text-muted-foreground mb-2.5 leading-relaxed">
          {thesis.length > 260 ? thesis.slice(0, 260) + '…' : thesis}
        </p>
      )}

      {/* ── Sector tags — max 4 visible ── */}
      {sectors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {sectors.slice(0, 4).map(s => (
            <span
              key={s}
              className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground truncate max-w-[120px]"
            >
              {s.length > 16 ? s.slice(0, 15) + '…' : s}
            </span>
          ))}
        </div>
      )}

      {/* ── Why-fit / how-to-pitch expand panel (paid only) ── */}
      {/* relative z-10 lifts the accordion above the cover-link overlay so clicks reach the button. */}
      {isPaid && (
        <div className="relative z-10 mt-1">
          <button
            type="button"
            onClick={handleExpand}
            className="text-xs text-international-orange font-semibold hover:underline cursor-pointer"
          >
            {expanded ? '▲ Hide insight' : '▼ Why this investor · How to pitch'}
          </button>
          {expanded && (
            <div className="mt-3 space-y-3 rounded-lg bg-muted/40 p-4">
              {isEnriching && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating insight…
                </div>
              )}
              {!isEnriching && enrichFailed && (
                <p className="text-sm text-muted-foreground">
                  Could not generate insight — try refining your description.
                </p>
              )}
              {!isEnriching && !enrichFailed && matchOutput && (
                <>
                  <div>
                    <p className="text-[10px] font-bold text-international-orange uppercase tracking-wider mb-1">Why they would back you</p>
                    <p className="text-sm text-foreground leading-relaxed">{matchOutput.whyFit}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-international-orange uppercase tracking-wider mb-1">How to pitch</p>
                    <p className="text-sm text-foreground leading-relaxed">{matchOutput.howToPitch}</p>
                  </div>
                </>
              )}
              {!isEnriching && !enrichFailed && !matchOutput && (
                <p className="text-sm text-muted-foreground">Generating insight…</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
    )
  }

/** Format cheque size as human-readable string (e.g. 500000 → "500k", 2000000 → "2m") */
function fmtCheque(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

// ── Paywall card ─────────────────────────────────────────────────────────────

function PaywallCard({ hiddenCount }: { hiddenCount: number }) {
  return (
    <div className="my-6 rounded-xl p-8 text-center text-white shadow-xl"
      style={{ background: 'linear-gradient(135deg, #ff4500, #ff6a00)' }}>
      <h3 className="text-[22px] font-bold mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
        {hiddenCount > 0
          ? `${hiddenCount} more matches waiting — pick them up for £50/month.`
          : 'Unlock all matches for £50/month.'}
      </h3>
      <p className="text-sm mb-5 opacity-90 max-w-xl mx-auto">
        See every ranked match · unlock all partner names and emails · track which investors you have contacted · export to a spreadsheet · one Forge project per month included.
      </p>
      <div className="inline-flex gap-6 items-center bg-black/20 rounded-lg px-5 py-4 mb-5">
        <div>
          <div className="text-[32px] font-black leading-none">£50</div>
          <div className="text-xs opacity-80">/month</div>
        </div>
        <div className="h-8 w-px bg-white/30" />
        <div className="text-left">
          <div className="text-xs font-bold">50 investor views/month included</div>
          <div className="text-xs opacity-80">£0.50/view over · metered via Stripe · cancel anytime</div>
        </div>
      </div>
      <br />
      <a
        href="/pricing"
        className="inline-flex items-center gap-2 bg-white text-international-orange font-bold px-7 py-3.5 rounded-lg text-sm no-underline hover:bg-orange-50 transition-colors"
      >
        Upgrade to £50/month →
      </a>
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="bg-card border border-dashed border-border rounded-xl px-10 py-[72px] text-center mt-7">
      <div className="text-[40px] mb-4">✨</div>
      <h3 className="text-xl font-bold text-foreground mb-2.5">Your shortlist will appear here</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Paste something above (or click one of the example chips), then press Find Investors. You get 5 ranked matches free — no card, no sign-up waste.
      </p>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseFirmType(raw: string): string {
  const map: Record<string, string> = {
    'VC': 'VC',
    'PE': 'PE',
    'venture_capital': 'VC',
    'private_equity': 'PE',
    'accelerator': 'Accelerator',
    'angel': 'Angel',
    'family_office': 'Family Office',
    'grant': 'Govt',
    'government': 'Govt',
    'corporate_vc': 'Corporate VC',
  }
  return map[raw] ?? raw
}

// ─── Top-matches pagination ──────────────────────────────────────────────────
//
// Verbatim port of `Forge-Capital-Search.html` lines 717-725. Renders only
// when there are 2+ pages of top matches. Disabled state on first/last page.

function TopMatchesPagination({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
}) {
  const atFirst = page === 0
  const atLast = page >= totalPages - 1
  return (
    <div className="flex items-center justify-center gap-3 py-4 mt-2 border-t border-border/30">
      <button
        type="button"
        onClick={onPrev}
        disabled={atFirst}
        className="text-xs font-semibold px-3 py-1.5 rounded-md border border-border bg-card text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:border-international-orange/50 transition-colors"
      >
        ← Prev
      </button>
      <span className="text-xs text-muted-foreground tabular-nums">
        Page {page + 1} of {totalPages}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={atLast}
        className="text-xs font-semibold px-3 py-1.5 rounded-md border border-border bg-card text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:border-international-orange/50 transition-colors"
      >
        Next →
      </button>
    </div>
  )
}

// ─── Near Misses section ─────────────────────────────────────────────────────
//
// Verbatim port of `Forge-Capital-Search.html` lines 802-862. Lists firms
// with composite 10-34%, grouped by the dimension where they're weakest.
// Cap at 8 per group with a "+ N more" tail line.

function NearMissesSection({
  groups,
  totalCount,
}: {
  groups: Record<NearMissGroupKey, InvestorFirm[]>
  totalCount: number
}) {
  return (
    <section className="mt-10 pt-6 border-t border-border/40">
      <div className="flex items-center gap-2 mb-1">
        <span style={{ fontSize: '18px' }}>⚠️</span>
        <h2 className="text-base font-semibold text-foreground">
          Near Misses (10–34%) <span className="text-muted-foreground font-normal">· {totalCount}</span>
        </h2>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Investors who don&apos;t quite hit a 35% match but are worth knowing about — usually one dimension off.
      </p>

      <div className="space-y-6">
        {(Object.keys(groups) as NearMissGroupKey[]).map((key) => {
          const items = groups[key]
          if (items.length === 0) return null
          const desc = NEAR_MISS_GROUP_LABELS[key]
          return (
            <div key={key}>
              <div className="text-sm font-semibold text-foreground mb-1">
                {key} <span className="text-muted-foreground font-normal">({items.length})</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{desc}</p>
              <div className="rounded-lg border border-border/50 divide-y divide-border/30 bg-card">
                {items.slice(0, 8).map((f) => {
                  const composite = f.attributes._fcComposite ?? 0
                  const stage = (f.attributes.stage_focus ?? []).slice(0, 2).join(' / ')
                  const geo   = (f.attributes.geo_focus ?? []).slice(0, 1).join(', ')
                  const meta  = [geo, stage].filter(Boolean).join(' · ')
                  return (
                    <Link
                      key={f.id}
                      href={`/investors/${f.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground truncate">
                          {f.title}
                          {f.attributes.firm_type && (
                            <span className="text-[10px] text-muted-foreground ml-2 uppercase tracking-wider">
                              {f.attributes.firm_type}
                            </span>
                          )}
                        </div>
                        {meta && (
                          <div className="text-[11px] text-muted-foreground truncate">{meta}</div>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-international-orange tabular-nums shrink-0">
                        {composite.toFixed(1)}%
                      </div>
                    </Link>
                  )
                })}
                {items.length > 8 && (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground italic">
                    + {items.length - 8} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Advisory Intelligence section ───────────────────────────────────────────
//
// Verbatim port of `Forge-Capital-Search.html` lines 866-969. Surfaces 3
// kinds of advice based on the near-misses + top-matches: geographic
// expansion, stage adjacency, alternative capital sources.

function AdvisorySection({ items }: { items: Array<{ title: string; body: string }> }) {
  return (
    <section className="mt-10 pt-6 border-t border-border/40">
      <div className="flex items-center gap-2 mb-1">
        <span style={{ fontSize: '18px' }}>💡</span>
        <h2 className="text-base font-semibold text-foreground">Advisory intelligence</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Patterns from your near-misses worth thinking about as you shape your raise.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-lg p-4"
            style={{ background: 'hsl(45 90% 96%)', border: '1px solid hsl(45 75% 85%)' }}
          >
            <div className="text-sm font-semibold mb-1.5" style={{ color: 'hsl(30 70% 32%)' }}>
              {item.title}
            </div>
            <p className="text-xs text-foreground leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
