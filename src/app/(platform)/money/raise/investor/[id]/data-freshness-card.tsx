'use client'

/**
 * @file data-freshness-card.tsx
 *
 * Trust-signal card summarising how recent + how complete the firm record
 * is. Pulls `data_quality_score` (top-level), `last_enriched_at`, and
 * `attributes.data_source`. Always renders — even "no signal" is useful
 * context for the user deciding whether to trust the rest of the page.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldCheck } from 'lucide-react'

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)))
}

function qualityLabel(score: number | null | undefined): string {
  if (typeof score !== 'number') return 'Unknown'
  if (score >= 9) return 'High'
  if (score >= 7) return 'Good'
  if (score >= 5) return 'Fair'
  return 'Low'
}

export function DataFreshnessCard({
  dataQualityScore,
  lastEnrichedAt,
  dataSource,
}: {
  dataQualityScore: number | null | undefined
  lastEnrichedAt: string | null | undefined
  dataSource: string | null | undefined
}) {
  const days = daysSince(lastEnrichedAt)
  const label = qualityLabel(dataQualityScore)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
          Data freshness
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Quality</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {typeof dataQualityScore === 'number'
                ? `${dataQualityScore.toFixed(1)} / 10`
                : '—'}{' '}
              <span className="text-xs text-muted-foreground">({label})</span>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Last verified</dt>
            <dd className="font-medium text-foreground">
              {days === null
                ? 'Unknown'
                : days === 0
                  ? 'Today'
                  : days === 1
                    ? '1 day ago'
                    : `${days} days ago`}
            </dd>
          </div>
          {dataSource && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Source</dt>
              <dd className="font-medium text-foreground text-right truncate">
                {dataSource}
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}
