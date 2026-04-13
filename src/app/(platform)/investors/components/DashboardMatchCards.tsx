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

export function DashboardMatchCards({
  firms,
  companyContext,
  profile,
  limit = 10,
  title = 'Top Matches',
  subtitle,
}: DashboardMatchCardsProps) {
  const ranked = useMemo(() => {
    const p = profile ?? buildProfileFromContext(companyContext)
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
  }, [firms, companyContext, profile, limit])

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
