/**
 * @file MatchPillarBars.tsx
 *
 * @description 7-pillar match breakdown visualisation aligned with
 * forge-capital-app's 7-dimension scoring system. Consumes the `pillars`
 * object emitted by `calculateMatchScore` so the table and the matches
 * panel always show the same reasoning.
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
  /** When true, pillars with value 0 show "N/A" instead of 0. Useful for marketing previews where 0 means "no data". */
  hideZeroValues?: boolean
  className?: string
}

const PILLAR_ORDER: Array<{ key: keyof MatchBreakdown['pillars']; label: string }> = [
  { key: 'thesis', label: 'THESIS' },
  { key: 'stage', label: 'STAGE' },
  { key: 'geo', label: 'GEO' },
  { key: 'cheque', label: 'CHEQUE' },
  { key: 'activity', label: 'ACTIVITY' },
  { key: 'data', label: 'DATA' },
  { key: 'hardware', label: 'HARDWARE' },
]

// DECISION: Use inline style colours rather than Tailwind classes. The marketing
// route (src/app/page.tsx → investor-preview) and the authenticated route
// (/investors) sometimes end up in different CSS bundles — Tailwind classes like
// `bg-success` can silently fail to render on one when both use this component.
// Hex fallbacks guarantee colour parity across every entry point.
//
// Tristan 2026-04-28 (design audit cross-cutting fix #2): swapped from
// green/amber/grey to a brand-orange ramp. Keeps the 3-step legibility cue
// without fighting the #ff4500 accent. Audit P0: "replace non-brand green
// and yellow with the orange ramp on Match Scorecard."
function fillHex(value: number): string {
  if (value >= 70) return '#ff4500' // international-orange — strong match
  if (value >= 40) return '#fdba74' // orange-300 — moderate
  return '#cbd5e1'                   // slate-300 — weak (neutral, not alarming)
}

export function MatchPillarBars({ pillars, compositeScore, compact = false, hideZeroValues = false, className }: MatchPillarBarsProps) {
  if (compact) {
    return (
      <div className={cn('grid grid-cols-7 gap-1.5', className)}>
        {PILLAR_ORDER.map(({ key, label }) => {
          const value = pillars[key] ?? 0
          const isNA = hideZeroValues && value === 0
          return (
            <div key={key} className="flex flex-col items-center gap-0.5" title={isNA ? `${label}: N/A` : `${label}: ${value}%`}>
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                {!isNA && (
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(0, value))}%`,
                      backgroundColor: fillHex(value),
                    }}
                  />
                )}
              </div>
              <span className="text-[9px] font-medium text-muted-foreground leading-none tabular-nums">
                {isNA ? 'N/A' : value}
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
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-x-2 gap-y-3">
        {PILLAR_ORDER.map(({ key, label }) => {
          const value = pillars[key] ?? 0
          const isNA = hideZeroValues && value === 0
          return (
            <div key={key} className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                {!isNA && (
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(0, value))}%`,
                      backgroundColor: fillHex(value),
                    }}
                  />
                )}
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {label}
                </span>
                <span className="text-[10px] font-medium text-foreground tabular-nums">
                  {isNA ? 'N/A' : value}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
