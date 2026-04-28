'use client'

/**
 * @file match-score-display.tsx
 *
 * Compact match-score badge + 6-pillar mini bars for the investor detail
 * header. Mirrors the band + hex-fill choices in /money/raise/for-you so the
 * score reads identically across Money surfaces.
 */

import type { MatchBreakdown } from '@/lib/money/match-types'
import { cn } from '@/lib/utils'

type ScoreBand = 'green' | 'blue' | 'amber' | 'grey'

function scoreBand(score: number): ScoreBand {
  if (score >= 80) return 'green'
  if (score >= 60) return 'blue'
  if (score >= 40) return 'amber'
  return 'grey'
}

function bandFillHex(band: ScoreBand): string {
  switch (band) {
    case 'green':
      return '#22c55e'
    case 'blue':
      return '#3b82f6'
    case 'amber':
      return '#f59e0b'
    case 'grey':
      return '#94a3b8'
  }
}

function bandRingClass(band: ScoreBand): string {
  switch (band) {
    case 'green':
      return 'border-emerald-500/50 bg-emerald-50 text-emerald-700'
    case 'blue':
      return 'border-blue-500/50 bg-blue-50 text-blue-700'
    case 'amber':
      return 'border-amber-500/50 bg-amber-50 text-amber-700'
    case 'grey':
      return 'border-border bg-muted/50 text-muted-foreground'
  }
}

const PILLAR_ORDER: Array<{
  key: keyof MatchBreakdown['pillars']
  label: string
  full: string
}> = [
  { key: 'thesis', label: 'Thesis', full: 'Thesis' },
  { key: 'geography', label: 'Geo', full: 'Geography' },
  { key: 'stage', label: 'Stage', full: 'Stage' },
  { key: 'cheque', label: 'Cheque', full: 'Cheque' },
  { key: 'activity', label: 'Activity', full: 'Activity' },
  { key: 'confidence', label: 'Confidence', full: 'Confidence' },
]

export function MatchScoreDisplay({ breakdown }: { breakdown: MatchBreakdown }) {
  const band = scoreBand(breakdown.total)
  const fill = bandFillHex(band)
  const reasons = (breakdown.reasons ?? []).slice(0, 3)
  const ariaPillars = PILLAR_ORDER.map(
    (p) => `${p.full} ${breakdown.pillars[p.key] ?? 0}`,
  ).join(', ')

  return (
    <div className="flex items-start gap-4 rounded-lg border bg-muted/30 p-3">
      <div
        role="img"
        aria-label={`Match score: ${breakdown.total} out of 100`}
        className={cn(
          'flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 font-semibold leading-none',
          bandRingClass(band),
        )}
      >
        <span className="text-xl tabular-nums">{breakdown.total}</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider opacity-70">
          /100
        </span>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div
          role="img"
          aria-label={`Pillar breakdown: ${ariaPillars}`}
          className="grid grid-cols-6 gap-1.5"
        >
          {PILLAR_ORDER.map(({ key, label, full }) => {
            const v = Math.max(0, Math.min(100, breakdown.pillars[key] ?? 0))
            return (
              <div
                key={key}
                className="flex flex-col items-center gap-1"
                title={`${full}: ${v}`}
              >
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${v}%`, backgroundColor: fill }}
                  />
                </div>
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-none">
                  {label}
                </span>
              </div>
            )
          })}
        </div>
        {reasons.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="shrink-0">·</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
