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

import { useState, useCallback, useTransition, useRef } from 'react'
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
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isPaid = PAID_TIERS.has(tier)
  const isFree = tier === 'free'

  // View cap
  const cap = viewCapStatus?.cap ?? null
  const usedThisMonth = viewCapStatus?.viewsUsedThisMonth ?? 0
  const viewsRemaining = viewCapStatus?.viewsRemaining ?? null

  // ── Search ────────────────────────────────────────────────────────────────

  const runSearch = useCallback((q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 10) {
      toast.error('Please describe your startup in a little more detail.')
      return
    }
    setLastQuery(trimmed)
    setHasSearched(true)
    startTransition(async () => {
      try {
        const result = await searchInvestors({
          query: trimmed,
          sortBy: 'match',
          page: 1,
          pageSize: 50,
          skipMatchEnrichment: true,
        })
        setFirms(result.firms)
        setTotal(result.total)
        setMatchOutputs(result.matchOutputs ?? {})
        if (result.resolvedTier) setTier(result.resolvedTier as ResolvedTier)
        setExtractedProfile(extractProfile(trimmed, result.firms))
        if (result.firms.length === 0) {
          toast.info('No matching investors found. Try a broader description.')
        }
        // Fire-and-forget: score all returned firms and store { score, pillars }
        // so each card can render the 6-pillar breakdown.
        if (result.firms.length > 0) {
          const ids = result.firms.map(f => f.id)
          computeMatchScores(ids)
            .then(scores => setMatchScores(prev => ({ ...prev, ...scores })))
            .catch(() => { /* non-critical — cards show without bars */ })
        }
      } catch (err) {
        console.error('[InvestorDeckSearchClient] search failed:', err)
        toast.error('Search failed — please try again.')
      }
    })
  }, [])

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

  const visibleFirms = isPaid ? firms : firms.slice(0, FREE_VISIBLE)
  const lockedFirms = isPaid ? [] : firms.slice(FREE_VISIBLE, FREE_VISIBLE + 2)
  const hiddenCount = isPaid ? 0 : Math.max(0, total - FREE_VISIBLE)

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
          isPaid={isPaid}
          isFree={isFree}
          freeVisible={FREE_VISIBLE}
          lastQuery={lastQuery}
          isPending={isPending}
        />
      )}

      {/* ── Match cards (visible) ─────────────────────────────────────────── */}
      {hasSearched && visibleFirms.map(firm => (
        <MatchCard
          key={firm.id}
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
      ))}

      {/* ── Paywall (free + results) ──────────────────────────────────────── */}
      {hasSearched && isFree && firms.length > 0 && (
        <PaywallCard hiddenCount={hiddenCount} />
      )}

      {/* ── Locked blurred cards (preview of what's behind paywall) ──────── */}
      {hasSearched && lockedFirms.map(firm => (
        <MatchCard
          key={firm.id}
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

      {/* ── Pre-search charts (visible before search, hidden after results) ── */}
      {!hasSearched && investorStats && (
        <InvestorStatsCharts stats={investorStats} />
      )}

      {/* ── Empty state (before search, no stats available) ──────────────── */}
      {!hasSearched && !investorStats && <EmptyState />}

      {/* ── Empty results (search with 0 results) ────────────────────────── */}
      {hasSearched && !isPending && firms.length === 0 && (
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
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-5 py-3.5 mb-6">
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
  return (
    <div className="bg-card border border-border rounded-xl p-7 mb-7 shadow-sm">
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
            className="inline-flex items-center gap-2 border border-border text-foreground bg-card font-semibold px-5 py-2.5 rounded-lg text-sm cursor-pointer hover:bg-muted/50 transition-colors"
          >
            ↻ Re-run
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
          📎 or upload .pdf .pptx .docx
          <input type="file" accept=".pdf,.pptx,.docx" className="hidden" />
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
  isPaid,
  isFree,
  freeVisible,
  lastQuery,
  isPending,
}: {
  total: number
  isPaid: boolean
  isFree: boolean
  freeVisible: number
  lastQuery: string
  isPending: boolean
}) {
  return (
    <div className="flex items-center justify-between py-4 mb-0">
      <div className="text-sm text-foreground">
        {lastQuery && <span className="text-muted-foreground mr-1">{lastQuery.slice(0, 40)}{lastQuery.length > 40 ? '…' : ''} ·</span>}
        Found{' '}
        <strong className="text-international-orange">{isPending ? '…' : `${total} matching investors`}</strong>
        {isFree && ` · showing ${Math.min(freeVisible, total)} free`}
        {isPaid && ' · all visible'}
      </div>
      <div className="flex gap-2 flex-wrap">
        <FilterChip active>Best match</FilterChip>
        <FilterChip>VCs only</FilterChip>
        <FilterChip>+ Grants</FilterChip>
        <FilterChip>United Kingdom</FilterChip>
        {isPaid && <FilterChip>⇩ Export</FilterChip>}
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

interface MatchCardProps {
  firm: InvestorFirm
  matchScore?: number
  /** 6-pillar breakdown from calculateMatchScore — drives MatchPillarBars. */
  pillars?: FirmMatchResult['pillars']
  matchOutput?: InvestorMatchOutputView
  isSaved: boolean
  onSave?: () => void
  onRevealWhyFit?: () => Promise<void>
  isLocked: boolean
  isPaid: boolean
}

function MatchCard({
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
  const thesis = attrs.investment_thesis ?? firm.description ?? null
  const stages = attrs.stage_focus ?? []
  const sectors = attrs.sectors ?? []
  const contactEmail = attrs.contact_email ?? null

  // Why-fit / how-to-pitch — expand state
  const [expanded, setExpanded] = useState(false)
  const [isEnriching, startEnrichTransition] = useTransition()
  const [enrichFailed, setEnrichFailed] = useState(false)

  const handleExpand = () => {
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

  return (
    <div className={`bg-card border border-border rounded-xl px-5 py-4.5 mb-2.5 grid gap-5 transition-all hover:border-international-orange/30 hover:shadow-sm ${
      isLocked ? 'opacity-80' : ''
    }`} style={{ gridTemplateColumns: '1fr 88px' }}>
      {/* Left col */}
      <div>
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-2 flex-wrap">
          <span className={`font-bold text-[15px] text-foreground ${isLocked ? 'blur-[5px] select-none' : ''}`}>
            {isLocked ? '████████ Capital' : firm.title}
          </span>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-bold tracking-wider uppercase">
            {firmType}
          </span>
          {city && (
            <span className={`text-xs text-muted-foreground ${isLocked ? 'blur-[5px]' : ''}`}>
              · {isLocked ? '████████' : city}
            </span>
          )}
        </div>

        {/* Thesis */}
        {thesis && (
          <p className={`text-sm text-muted-foreground mb-2.5 leading-relaxed ${isLocked ? 'blur-[5px]' : ''}`}>
            {isLocked
              ? '██████ seed-stage ██████ & hardware. £███k–£███m cheques. Portfolio includes ██████████ — active deployer.'
              : thesis.length > 220 ? thesis.slice(0, 220) + '…' : thesis}
          </p>
        )}

        {/* Pillar chips */}
        <div className="flex gap-2.5 mb-2.5 flex-wrap">
          {/* Overall score pillar */}
          {matchScore !== undefined && (
            <PillarChip label="Fit" value={Math.round(matchScore)} />
          )}
          {stages.slice(0, 2).map(s => (
            <PillarChip key={s} label="Stage" value={s} isText />
          ))}
          {sectors.slice(0, 2).map(s => (
            <PillarChip key={s} label="" value={s} isText />
          ))}
          {/* 6-pillar breakdown bars — wired from calculateMatchScore */}
          {pillars && !isLocked && (
            <MatchPillarBars pillars={pillars} compact className="w-full mt-1" />
          )}
        </div>

        {/* Why-fit / how-to-pitch expand panel (paid only) */}
        {isPaid && !isLocked && (
          <div className="mb-2.5">
            <button
              onClick={handleExpand}
              className="text-xs text-international-orange font-semibold hover:underline cursor-pointer"
            >
              {expanded ? '▲ Hide insight' : '▼ Why this investor · How to pitch'}
            </button>
            {expanded && (
              <div className="mt-3 space-y-3 rounded-lg bg-muted/40 border border-border p-4">
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

        {/* Contact row */}
        <div className={`flex items-center gap-2.5 text-xs text-foreground pt-2.5 border-t border-border/60 ${isLocked ? 'pointer-events-none' : ''}`}>
          <span>{isLocked ? '🔒' : '👤'}</span>
          <span className={`font-bold ${isLocked ? 'blur-[5px]' : ''}`}>
            {isLocked ? '████████' : (firm.attributes.firm_type ? 'Lead partner' : 'Contact')}
          </span>
          {contactEmail && !isLocked && (
            <a
              href={`mailto:${contactEmail}`}
              className="ml-auto text-international-orange font-semibold no-underline hover:underline"
            >
              {contactEmail} →
            </a>
          )}
          {!contactEmail && !isLocked && (
            <span className="ml-auto text-muted-foreground">
              {isPaid ? 'Contact via investor profile →' : 'Upgrade to unlock contact details'}
            </span>
          )}
          {isLocked && (
            <a href="#" className="ml-auto text-international-orange/50 blur-[5px]">████@████.com →</a>
          )}
        </div>
      </div>

      {/* Right col — score */}
      <div className="text-right self-start pt-1 flex flex-col items-end gap-2">
        {matchScore !== undefined ? (
          <>
            <div className="text-[28px] font-black text-international-orange leading-none">
              {isLocked ? Math.round(matchScore) : Math.round(matchScore)}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Fit</div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">—</div>
        )}
        {onSave && !isLocked && (
          <button
            onClick={onSave}
            className={`text-xs px-2.5 py-1 rounded-md border transition-all ${
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
  )
}

function PillarChip({ label, value, isText }: { label: string; value: number | string; isText?: boolean }) {
  return (
    <span className="text-[10px] px-2 py-1 rounded-full bg-muted text-foreground">
      {label && <span className="mr-1">{label}</span>}
      <strong className="text-international-orange">{isText ? value : value}</strong>
    </span>
  )
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
