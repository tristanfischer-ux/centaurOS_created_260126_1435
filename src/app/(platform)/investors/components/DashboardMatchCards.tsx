/**
 * @file DashboardMatchCards.tsx
 *
 * @description Ranked match cards styled after Forge-Capital-Dashboard.html
 * (the Top Matches section at lines 1440-1465). Client-side only: takes firms
 * that are already fetched, scores them with the shared `calculateMatchScore`
 * function, and renders the top N sorted by composite pillar score.
 *
 * INTENT: Zero server roundtrip, zero LLM call, so results render instantly —
 * replacing the previous SSE-backed InvestorMatchView which was slow and showed
 * an "Analysing matches 1 of 10…" loader for many seconds.
 */

'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { MatchPillarBars } from './MatchPillarBars'
import { calculateMatchScore, compositePillarScore, type FoundryProfile } from '@/lib/investor-match'
import type { InvestorFirm } from '@/actions/investors'
import { formatFundSize } from '@/lib/format'

interface DashboardMatchCardsProps {
  firms: InvestorFirm[]
  companyContext?: {
    sector?: string | null
    stage?: string | null
    fundingStatus?: string | null
    seekingFunding?: boolean
  }
  /** If provided, overrides companyContext — lets a caller build a profile from
   * a PDF upload or from the search query. */
  profile?: FoundryProfile
  /** Raw search text. When present, stage/geo/sector signals are parsed out
   * and used as the scoring profile — mirrors Forge-Capital-Dashboard.html
   * where stageFit/geoFit read from the query text, not from user DB state. */
  queryText?: string
  /** How many cards to show. Default 10 (matches dashboard's initial render). */
  limit?: number
  /** Heading shown above the cards. */
  title?: string
  /** Sub-title / explanation line. */
  subtitle?: string
}

function buildProfileFromContext(ctx: DashboardMatchCardsProps['companyContext']): FoundryProfile {
  return {
    stage: ctx?.stage ?? null,
    sector: ctx?.sector ?? null,
    industry: null,
  }
}

/**
 * Extract a scoring profile from free-text search input. Mirrors Forge-Capital-
 * Dashboard.html's stageFit/geoFit which read directly from the query string
 * instead of a stored user profile. Critical for anonymous or profile-less users
 * — without this, stage/sector/geo pillars all collapse to zero and composite
 * scores land ~30 points below the dashboard's.
 */
function parseQueryProfile(text: string): FoundryProfile {
  const low = text.toLowerCase()
  const STAGE_PATTERNS: Array<[RegExp, string]> = [
    [/\bpre[- ]?seed\b/i, 'pre_seed'],
    [/\bseries\s*a\b/i, 'series_a'],
    [/\bseries\s*b\b/i, 'series_b'],
    [/\bseries\s*c\b/i, 'series_c'],
    [/\b(late[- ]stage|growth)\b/i, 'growth'],
    [/\bseed\b/i, 'seed'],
  ]
  let stage: string | null = null
  for (const [p, label] of STAGE_PATTERNS) { if (p.test(low)) { stage = label; break } }

  // Sector: pull the most salient domain keyword. Investor-match treats this
  // as a substring check against each firm's sectors, so even a broad term
  // like "manufacturing" produces a useful signal.
  const SECTOR_VOCAB = [
    'critical raw materials', 'critical minerals', 'rare earth',
    'advanced manufacturing', 'manufacturing', 'hardware', 'deep tech',
    'climate tech', 'clean energy', 'renewable', 'battery', 'solar',
    'biotech', 'medtech', 'aerospace', 'defense', 'defence',
    'ai', 'robotics', 'mobility', 'fintech', 'semiconductors',
    'recycling', 'materials', 'mining',
  ]
  let sector: string | null = null
  for (const s of SECTOR_VOCAB) {
    const pattern = s.includes(' ')
      ? new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (pattern.test(low)) { sector = s; break }
  }

  // Additional keywords boost the thesisBonus pillar inside calculateMatchScore.
  // We lift every noun-like token > 5 chars — the scorer does its own
  // intersection against investor thesis text.
  const businessKeywords = Array.from(
    new Set(
      low
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 6 && !STOP_WORDS.has(w)),
    ),
  ).slice(0, 20)

  return { stage, sector, industry: null, businessKeywords }
}

const STOP_WORDS = new Set([
  'company', 'companies', 'startup', 'startups', 'raising', 'currently',
  'building', 'platform', 'offering', 'significant', 'through', 'currently',
  'business', 'industries', 'industry', 'technology', 'technologies',
  'strategic', 'proprietary', 'flexible', 'advantages', 'autonomy',
])

export function DashboardMatchCards({
  firms,
  companyContext,
  profile,
  queryText,
  limit = 10,
  title = 'Top Matches',
  subtitle,
}: DashboardMatchCardsProps) {
  const ranked = useMemo(() => {
    // Precedence: explicit profile > parsed-from-query > companyContext.
    // queryText usually wins because the user just typed what they want NOW.
    const p = profile
      ?? (queryText && queryText.trim().length >= 6 ? parseQueryProfile(queryText) : null)
      ?? buildProfileFromContext(companyContext)
    return firms
      .map(firm => {
        const breakdown = calculateMatchScore(firm, p)
        // DECISION: When the server ran a semantic search, each firm carries
        // `_similarity` (pgvector cosine, 0-1) on its attributes. That value is
        // the dashboard's "thesis" pillar — it reflects how close the firm's
        // thesis text is to the user's typed description. Use it directly when
        // present; fall back to the generic pillar mapping otherwise.
        const similarity = (firm.attributes as Record<string, unknown>)._similarity
        const thesisFromSim = typeof similarity === 'number'
          ? Math.round(Math.max(0, Math.min(1, similarity)) * 100)
          : null
        const pillars = thesisFromSim != null
          ? { ...breakdown.pillars, thesis: thesisFromSim }
          : breakdown.pillars
        const composite = compositePillarScore(pillars)
        return { firm, breakdown: { ...breakdown, pillars }, composite }
      })
      .sort((a, b) => b.composite - a.composite)
      .slice(0, limit)
  }, [firms, companyContext, profile, queryText, limit])

  if (ranked.length === 0) return null

  return (
    <section className="space-y-4" aria-labelledby="top-matches-heading">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 id="top-matches-heading" className="text-base font-semibold text-foreground">
            {title} <span className="text-muted-foreground font-normal">({ranked.length})</span>
          </h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>

      <div className="space-y-3">
        {ranked.map(({ firm, breakdown, composite }, index) => {
          const attrs = firm.attributes
          const sectors = Array.isArray(attrs.sectors) ? attrs.sectors : []
          const stages = Array.isArray(attrs.stage_focus) ? attrs.stage_focus : []
          const thesis = (attrs.investment_thesis as string | undefined) || ''
          const geoFocus = Array.isArray(attrs.geo_focus) ? attrs.geo_focus : []
          const cheque = attrs.cheque_range_gbp
          const fundSize = attrs.fund_size_gbp

          return (
            <Card key={firm.id} className="hover:-translate-y-0.5 transition-transform duration-200">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                        {index + 1}.
                      </span>
                      <Link
                        href={`/investors/${firm.id}`}
                        className="font-semibold text-foreground hover:text-international-orange transition-colors"
                      >
                        {firm.title}
                      </Link>
                      {attrs.firm_type && (
                        <Badge variant="outline" className="text-[10px]">{attrs.firm_type}</Badge>
                      )}
                    </div>
                    {(geoFocus.length > 0 || cheque || stages.length > 0) && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {[
                          geoFocus.slice(0, 4).join(', '),
                          cheque && (cheque.min != null || cheque.max != null)
                            ? `${formatFundSize(cheque.min) ?? '—'} – ${formatFundSize(cheque.max) ?? '—'}`
                            : null,
                          stages.slice(0, 4).join(', '),
                          fundSize ? `Fund ${formatFundSize(fundSize)}` : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1 shrink-0">
                    <span className="text-2xl font-bold text-international-orange tabular-nums">
                      {composite}%
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      match
                    </span>
                  </div>
                </div>

                <MatchPillarBars pillars={breakdown.pillars} />

                {thesis && (
                  <p className="text-sm text-foreground/80 leading-snug line-clamp-2">
                    {thesis}
                  </p>
                )}

                {sectors.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {sectors.slice(0, 6).map(s => (
                      <Badge key={s} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
