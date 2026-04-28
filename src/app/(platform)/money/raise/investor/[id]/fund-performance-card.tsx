'use client'

/**
 * @file fund-performance-card.tsx
 *
 * Compact metrics card for fund-level performance — IRR, MOIC, TVPI, vintage,
 * fund size, notable exits, history. Sources (all inside
 * `marketplace_listings.attributes`):
 *   - `fund_performance` → object with allowlisted numeric/text fields
 *   - `fund_history`     → string summary of funds I..N
 *   - `exits`            → string | string[] of notable exits
 *
 * Hidden entirely when no data is present.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp } from 'lucide-react'

// SECURITY: Allowlist of fund_performance keys shown to users. Prevents
// unexpected internal fields from leaking through to the UI if the JSONB
// shape drifts upstream.
const PERFORMANCE_DISPLAY_KEYS: Record<string, string> = {
  net_irr: 'Net IRR',
  gross_irr: 'Gross IRR',
  moic: 'MOIC',
  tvpi: 'TVPI',
  dpi: 'DPI',
  rvpi: 'RVPI',
  vintage_year: 'Vintage',
  fund_size: 'Fund size',
  deployed_pct: 'Deployed',
  follow_on_ratio: 'Follow-on ratio',
}

function formatValue(key: string, value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'number') {
    if (key === 'vintage_year') return String(value)
    if (key.endsWith('_pct') || key === 'deployed_pct') return `${value}%`
    if (key.endsWith('_irr')) return `${value}%`
    return String(value)
  }
  return typeof value === 'string' ? value : JSON.stringify(value)
}

export function FundPerformanceCard({
  fundPerformance,
  fundHistory,
  exits,
}: {
  fundPerformance: unknown
  fundHistory: unknown
  exits: unknown
}) {
  const perfObject =
    fundPerformance && typeof fundPerformance === 'object' && !Array.isArray(fundPerformance)
      ? (fundPerformance as Record<string, unknown>)
      : null

  const perfRows = perfObject
    ? Object.entries(perfObject)
        .filter(([key, v]) => PERFORMANCE_DISPLAY_KEYS[key] && v != null && typeof v !== 'object')
        .map(([key, value]) => ({
          key,
          label: PERFORMANCE_DISPLAY_KEYS[key] ?? key,
          value: formatValue(key, value),
        }))
    : []

  const hasPerf = perfRows.length > 0
  const hasHistory = typeof fundHistory === 'string' && fundHistory.trim().length > 0
  const exitList = Array.isArray(exits)
    ? (exits as unknown[]).filter((e): e is string => typeof e === 'string')
    : typeof exits === 'string' && exits.trim().length > 0
      ? [exits]
      : []
  const hasExits = exitList.length > 0

  if (!hasPerf && !hasHistory && !hasExits) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden />
          Fund performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasPerf && (
          <dl className="space-y-1.5">
            {perfRows.map((row) => (
              <div key={row.key} className="flex justify-between gap-4 text-sm">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-medium text-foreground tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {hasHistory && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Fund history
            </p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
              {fundHistory as string}
            </p>
          </div>
        )}

        {hasExits && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Notable exits
            </p>
            <ul className="space-y-0.5">
              {exitList.map((exit, i) => (
                <li key={i} className="text-sm text-foreground">
                  · {exit}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
