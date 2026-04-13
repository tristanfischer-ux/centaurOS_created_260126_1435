/**
 * @file MatchPillarBars.tsx
 *
 * @description 6-pillar match breakdown visualisation. Ported from
 * Forge-Capital-Dashboard.html:1446 (`renderScoreDimS`). Consumes the
 * `pillars` object emitted by `calculateMatchScore` so the table and the
 * matches panel always show the same reasoning.
 */

'use client'

import { cn } from '@/lib/utils'
import type { MatchBreakdown } from '@/lib/investor-match'

interface MatchPillarBarsProps {
  pillars: MatchBreakdown['pillars']
  /** Optional composite % to display above the bars (from `compositePillarScore`). */
  compositeScore?: number
  /** Compact = small bars with tiny labels; suitable for table cells. */
  compact?: boolean
  className?: string
}

const PILLAR_ORDER: Array<{ key: keyof MatchBreakdown['pillars']; label: string }> = [
  { key: 'thesis', label: 'THESIS' },
  { key: 'stage', label: 'STAGE' },
  { key: 'geo', label: 'GEO' },
  { key: 'cheque', label: 'CHEQUE' },
  { key: 'activity', label: 'ACTIVITY' },
  { key: 'confidence', label: 'CONFIDENCE' },
]

function fillColor(value: number): string {
  if (value >= 70) return 'bg-success'
  if (value >= 40) return 'bg-warning'
  return 'bg-muted-foreground'
}

export function MatchPillarBars({ pillars, compositeScore, compact = false, className }: MatchPillarBarsProps) {
  if (compact) {
    return (
      <div className={cn('grid grid-cols-6 gap-1.5', className)}>
        {PILLAR_ORDER.map(({ key, label }) => {
          const value = pillars[key] ?? 0
          return (
            <div key={key} className="flex flex-col items-center gap-0.5" title={`${label}: ${value}%`}>
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', fillColor(value))}
                  style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                />
              </div>
              <span className="text-[9px] font-medium text-muted-foreground leading-none tabular-nums">
                {value}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {compositeScore != null && (
        <div className="flex items-baseline justify-end gap-1">
          <span className="text-xl font-bold text-international-orange tabular-nums">{compositeScore}%</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">match</span>
        </div>
      )}
      <div className="grid grid-cols-6 gap-2">
        {PILLAR_ORDER.map(({ key, label }) => {
          const value = pillars[key] ?? 0
          return (
            <div key={key} className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', fillColor(value))}
                  style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {label}
                </span>
                <span className="text-[10px] font-medium text-foreground tabular-nums">
                  {value}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
