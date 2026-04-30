/**
 * @file MatchCard.tsx
 *
 * @description Progressive-disclosure investor match card with three visual states:
 *
 *   - **Closed** (scan): rank badge + firm name + type chip + composite match %
 *     + hardware fit badge + 2-line thesis excerpt + stage/sector/cheque chips
 *     + save button. Compact — designed for rapid scanning in a list.
 *
 *   - **Medium** (decide): everything from closed PLUS 6-pillar score bars,
 *     full thesis text, sector tags, and a "Why they might back you / How to pitch"
 *     section. Plus a hint to click for the full inline profile.
 *
 *   - **Full** (deep dive): everything from medium PLUS the FactStrip and
 *     CollapsibleSection content rendered inline, populated from existing props.
 *     Optionally enriched with a deep profile passed from the parent.
 *
 * Click cycle: closed → medium → full → medium → closed.
 * Each single click advances one step. No double-click, no page navigation.
 *
 * @see InvestorDeckSearchClient.tsx — parent consumer
 */

'use client'

import { useCallback, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { CollapsibleSection } from '@/app/(platform)/investors/[id]/components/CollapsibleSection'
import { FactStrip } from '@/app/(platform)/investors/[id]/components/FactStrip'
import type {
  InvestorFirm,
  InvestorMatchOutputView,
  FirmMatchResult,
} from '@/actions/investors'

// ─── Constants ───────────────────────────────────────────────────────────────

const SCORECARD_PILLARS: Array<{ key: keyof FirmMatchResult['pillars']; label: string; weight: string }> = [
  { key: 'thesis',   label: 'Thesis',     weight: '20' },
  { key: 'stage',    label: 'Stage',      weight: '20' },
  { key: 'geo',      label: 'Geo',        weight: '15' },
  { key: 'cheque',   label: 'Cheque',     weight: '15' },
  { key: 'activity', label: 'Activity',   weight: '15' },
  { key: 'data',     label: 'Confidence', weight: '10' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format cheque size as human-readable string (e.g. 500000 → "500k", 2000000 → "2m") */
function fmtCheque(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

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

/** Format a number as a compact currency label. Returns null if value is absent. */
function fmtCurrency(n: number | undefined | null): string | null {
  if (n == null) return null
  if (n >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`
  return `£${n}`
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type MatchCardState = 'closed' | 'medium' | 'full'

export interface MatchCardProps {
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
  /**
   * Phase A.5 click telemetry. Fired on `open` (cover-link click) and
   * `expand` (Why-fit accordion). Card never blocks user interaction on
   * this — it's fire-and-forget.
   */
  onTrackClick?: (clickType: 'open' | 'expand') => void
  /** Override the initial card state. Defaults to 'closed'. */
  initialCardState?: MatchCardState
  /**
   * Optional deep profile data fetched by the parent when the user enters
   * the full state. Passed down once available; card shows a loading state
   * while null and onRequestDeepProfile has been called.
   */
  deepProfile?: Record<string, unknown> | null
  /**
   * Called when the card transitions into the full state for the first time.
   * The parent uses this to kick off a background fetch of the deep profile.
   */
  onRequestDeepProfile?: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MatchCard({
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
  onTrackClick,
  initialCardState = 'closed',
  deepProfile,
  onRequestDeepProfile,
}: MatchCardProps) {
  const [cardState, setCardState] = useState<MatchCardState>(initialCardState)
  // Track whether we've already requested the deep profile to avoid double-firing
  const [deepProfileRequested, setDeepProfileRequested] = useState(false)

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

  // DECISION: Tristan 2026-04-27 mandate — show investment_thesis first, fall
  // back to ideal_company_profile / description.
  const thesis  = attrs.investment_thesis ?? attrs.ideal_company_profile ?? firm.description ?? null
  const sectors = attrs.sectors ?? []

  // Why-fit / how-to-pitch — expand state (used in medium + full card states)
  const [whyFitExpanded, setWhyFitExpanded] = useState(false)
  const [isEnriching, startEnrichTransition] = useTransition()
  const [enrichFailed, setEnrichFailed] = useState(false)

  const handleWhyFitExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isPaid) return
    if (!whyFitExpanded) onTrackClick?.('expand')
    if (!whyFitExpanded && !matchOutput && onRevealWhyFit) {
      setWhyFitExpanded(true)
      startEnrichTransition(async () => {
        try {
          await onRevealWhyFit()
        } catch {
          setEnrichFailed(true)
        }
      })
    } else {
      setWhyFitExpanded(prev => !prev)
    }
  }

  const handleSaveClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSave?.()
  }

  // Simple 3-state cycle: closed → medium → full → medium → closed
  const handleCardClick = useCallback(() => {
    setCardState(prev => {
      if (prev === 'closed') return 'medium'
      if (prev === 'medium') return 'full'
      return 'medium' // full → medium (one step back, not all the way to closed)
    })
  }, [])

  const handleCardKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleCardClick()
    }
  }, [handleCardClick])

  // Fire onRequestDeepProfile the first time we enter the full state
  const handleEnterFull = useCallback(() => {
    if (!deepProfileRequested && onRequestDeepProfile) {
      setDeepProfileRequested(true)
      onRequestDeepProfile()
    }
  }, [deepProfileRequested, onRequestDeepProfile])

  // Derived labels for FactStrip
  const fundSizeLabel = fmtCurrency((attrs as { fund_size_gbp?: number }).fund_size_gbp)
  const aumLabel      = fmtCurrency((attrs as { aum_gbp?: number }).aum_gbp)

  // Hardware fit score badge (shared between states)
  const hwScoreBadge = (() => {
    const hwScore = (firm.attributes as { hardware_fit_score?: number }).hardware_fit_score ??
                    (firm as unknown as { hardware_fit_score?: number }).hardware_fit_score
    if (typeof hwScore === 'number' && hwScore >= 0 && hwScore <= 10) {
      let badgeColor = 'bg-muted text-muted-foreground'
      if (hwScore >= 7.0) badgeColor = 'bg-international-orange/10 text-international-orange'
      else if (hwScore >= 4.0) badgeColor = 'bg-muted text-muted-foreground'

      return (
        <div className={`mt-1 text-[10px] px-2 py-0.5 rounded-full inline-flex items-center ${badgeColor}`}>
          Hardware fit {hwScore.toFixed(1)}/10
        </div>
      )
    }
    return null
  })()

  // ── Locked card variant ──────────────────────────────────────────────────
  if (isLocked) {
    return (
      <div className="bg-card border border-border/40 shadow-sm rounded-xl p-3.5 mb-2.5 transition-all opacity-80">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-sm text-foreground leading-snug blur-[5px] select-none">
                {rank}. {'████████ Capital'}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-bold tracking-wider uppercase flex-shrink-0">
                {firmType}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 blur-[5px]">
              {[city, chequeStr, stageStr].filter(Boolean).join(' · ') || ' '}
            </div>
          </div>
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
            {hwScoreBadge}
          </div>
        </div>
        {thesis && (
          <p className="text-xs text-muted-foreground mb-2.5 leading-relaxed blur-[5px] select-none">
            {'██████ seed-stage ██████ & hardware. £███k–£███m cheques. Portfolio includes ██████████ — active deployer.'}
          </p>
        )}
      </div>
    )
  }

  // ── Closed card state ────────────────────────────────────────────────────
  if (cardState === 'closed') {
    return (
      <div
        className="relative bg-card border border-border/40 shadow-sm rounded-xl p-3.5 mb-2.5 transition-all cursor-pointer hover:shadow-md hover:-translate-y-px"
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
      >
        {/* ── Header row: rank + name + type chip | composite % ── */}
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-sm text-foreground leading-snug">
                {rank}. {firm.title}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-bold tracking-wider uppercase flex-shrink-0">
                {firmType}
              </span>
            </div>
            {/* Meta line: geo · cheque · stage */}
            <div className="text-xs text-muted-foreground mt-0.5">
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
            {hwScoreBadge}

            {/* Save button */}
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

        {/* ── Chip row: stage focus · cheque range · active deploying ── */}
        <ClosedChipRow attrs={attrs} firmType={firmType} />

        {/* ── Thesis excerpt — 2 lines max (roughly 160 chars) ── */}
        {thesis && (
          <p className="text-xs text-muted-foreground mb-1.5 leading-relaxed line-clamp-2">
            {thesis}
          </p>
        )}

        {/* ── Sector tags — max 3 in closed state ── */}
        {sectors.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {sectors.slice(0, 3).map(s => (
              <span
                key={s}
                className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground truncate max-w-[120px]"
              >
                {s.length > 16 ? s.slice(0, 15) + '…' : s}
              </span>
            ))}
            {sectors.length > 3 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                +{sectors.length - 3}
              </span>
            )}
          </div>
        )}

        {/* ── Expand hint ── */}
        <div className="text-[10px] text-muted-foreground mt-2 select-none">
          ▼ Click to expand
        </div>
      </div>
    )
  }

  // ── Shared header block (used in both medium and full states) ──────────────
  const sharedHeader = (
    <>
      {/* ── Header row: rank + name + type chip | composite % ── */}
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm text-foreground leading-snug">
              {rank}. {firm.title}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-bold tracking-wider uppercase flex-shrink-0">
              {firmType}
            </span>
          </div>
          {/* Meta line: geo · cheque · stage */}
          <div className="text-xs text-muted-foreground mt-0.5">
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
          {hwScoreBadge}

          {/* Save button */}
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

      {/* ── Metadata chip row ── */}
      <ClosedChipRow attrs={attrs} firmType={firmType} />

      {/* ── 6-column scorecard grid (Forge Capital renderScoreDimS pattern) ── */}
      <div className="grid gap-1.5 mb-2.5" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        {SCORECARD_PILLARS.map(({ key, label, weight }) => {
          const raw   = pillars?.[key]
          const hasScore = raw !== undefined
          const value = hasScore ? raw : 0
          const isNA  = !hasScore

          let fillColor = '#e5e7eb' // N/A: neutral
          if (!isNA) {
            if (value >= 70) fillColor = '#ff4500'      // international-orange — strong
            else if (value >= 40) fillColor = '#fdba74' // orange-300 — moderate
            else fillColor = '#cbd5e1'                   // slate-300 — weak
          }

          return (
            <div key={key} className="text-center">
              <div
                className="font-medium uppercase mb-0 truncate"
                style={{ fontSize: '9px', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.3px' }}
              >
                {label}
              </div>
              <div
                className="mb-1 truncate"
                style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))', opacity: 0.6 }}
              >
                wt {weight}
              </div>
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

      {/* ── Formula key ── */}
      {pillars && matchScore !== undefined && (
        <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
          Composite {Math.round(matchScore)}% = thesis x 55% + geo x 15% + stage x 10% + cheque x 10% + activity x 3% + confidence x 2% (missing dimensions excluded and weights renormalised)
        </p>
      )}

      {/* ── Full thesis text ── */}
      {thesis && (
        <p className="text-xs text-muted-foreground mb-2.5 leading-relaxed">
          {thesis}
        </p>
      )}

      {/* ── Sector tags — show all in medium/full state ── */}
      {sectors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {sectors.slice(0, 8).map(s => (
            <span
              key={s}
              className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground truncate max-w-[140px]"
            >
              {s.length > 20 ? s.slice(0, 19) + '…' : s}
            </span>
          ))}
          {sectors.length > 8 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              +{sectors.length - 8} more
            </span>
          )}
        </div>
      )}

      {/* ── Why-fit / how-to-pitch expand panel (paid only) ── */}
      {isPaid && (
        <div className="relative z-10 mt-1">
          <button
            type="button"
            onClick={handleWhyFitExpand}
            className="text-xs text-international-orange font-semibold hover:underline cursor-pointer"
          >
            {whyFitExpanded ? '▲ Hide insight' : '▼ Why this investor · How to pitch'}
          </button>
          {whyFitExpanded && (
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
    </>
  )

  // ── Medium card state ────────────────────────────────────────────────────
  if (cardState === 'medium') {
    return (
      <div
        className="relative bg-card border border-border/40 shadow-sm rounded-xl p-3.5 mb-2.5 transition-all cursor-pointer hover:shadow-md hover:-translate-y-px"
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
      >
        {sharedHeader}

        {/* ── Hint ── */}
        <div className="text-[10px] text-muted-foreground mt-3 select-none">
          ▼ Click to see full profile
        </div>
      </div>
    )
  }

  // ── Full card state ──────────────────────────────────────────────────────
  // Fire the deep-profile request hook when we first render this state
  if (!deepProfileRequested) {
    handleEnterFull()
  }

  return (
    <div
      className="relative bg-card border border-border/40 shadow-sm rounded-xl p-3.5 mb-2.5 transition-all cursor-pointer hover:shadow-md"
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      {sharedHeader}

      {/* ── Divider ── */}
      <div className="border-t border-border/40 my-3" />

      {/* ── Fact strip: key facts, focus, provenance ── */}
      <div className="mb-4" onClick={e => e.stopPropagation()}>
        <FactStrip
          attrs={attrs as Parameters<typeof FactStrip>[0]['attrs']}
          fundSizeLabel={fundSizeLabel}
          aumLabel={aumLabel}
        />
      </div>

      {/* ── Thesis deep-dive section ── */}
      {thesis && (
        <div className="mb-3" onClick={e => e.stopPropagation()}>
          <CollapsibleSection number={1} title="Thesis" defaultOpen={true}>
            <p className="text-sm text-foreground leading-relaxed">{thesis}</p>
            {attrs.ideal_company_profile && attrs.ideal_company_profile !== thesis && (
              <div className="mt-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Ideal company profile</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{attrs.ideal_company_profile}</p>
              </div>
            )}
          </CollapsibleSection>
        </div>
      )}

      {/* ── Investment pattern section ── */}
      {(stageFocusArr.length > 0 || sectors.length > 0 || attrs.geo_focus) && (
        <div className="mb-3" onClick={e => e.stopPropagation()}>
          <CollapsibleSection number={2} title="Investment Pattern" defaultOpen={false}>
            <div className="space-y-3">
              {stageFocusArr.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Stage focus</p>
                  <div className="flex flex-wrap gap-1">
                    {stageFocusArr.map(s => (
                      <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wide">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {sectors.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Sectors</p>
                  <div className="flex flex-wrap gap-1">
                    {sectors.map(s => (
                      <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray((attrs as { geo_focus?: string[] }).geo_focus) && (attrs as { geo_focus?: string[] }).geo_focus!.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Geography</p>
                  <div className="flex flex-wrap gap-1">
                    {(attrs as { geo_focus?: string[] }).geo_focus!.map(g => (
                      <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{g}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* ── Deep profile sections — shown when deepProfile is available ── */}
      {deepProfileRequested && !deepProfile && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground my-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading full profile…
        </div>
      )}

      {/* ── Collapse hint ── */}
      <div className="text-[10px] text-muted-foreground mt-3 select-none">
        ▲ Click to collapse
      </div>
    </div>
  )
}

// ─── Shared sub-components ───────────────────────────────────────────────────

/**
 * Chip row shared between closed, medium, and full states: firm type, stage
 * focus, cheque range, active deploying status.
 */
function ClosedChipRow({
  attrs,
  firmType,
}: {
  attrs: InvestorFirm['attributes']
  firmType: string
}) {
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
      {firmTypeChip && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-foreground font-semibold uppercase tracking-wide">
          {firmTypeChip}
        </span>
      )}
      {stageFocusChips.map((stage) => (
        <span
          key={stage}
          className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-foreground uppercase tracking-wide"
        >
          {stage}
        </span>
      ))}
      {chequeChip && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-foreground uppercase tracking-wide">
          {chequeChip}
        </span>
      )}
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
}
