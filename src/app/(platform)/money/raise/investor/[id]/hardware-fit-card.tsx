'use client'

/**
 * @file hardware-fit-card.tsx
 *
 * Simple 0-10 gauge for `attributes.hardware_fit_score`. Only rendered when
 * the score is present AND > 0 — unknown / zero scores hide the card rather
 * than implying a signal that isn't there.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'

function scoreCopy(score: number): string {
  if (score >= 8) return 'Strong match for physical-product rounds.'
  if (score >= 5) return 'Some hardware fit — worth a warm intro.'
  return 'Limited hardware signal — prioritise other leads.'
}

function scoreColor(score: number): string {
  if (score >= 8) return 'bg-emerald-500'
  if (score >= 5) return 'bg-blue-500'
  return 'bg-amber-500'
}

export function HardwareFitCard({ score }: { score: number | null | undefined }) {
  if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) return null
  const clamped = Math.max(0, Math.min(10, score))
  const pct = clamped * 10
  const ariaLabel = `Hardware fit score: ${clamped} out of 10`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" aria-hidden />
          Hardware fit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {clamped.toFixed(clamped % 1 === 0 ? 0 : 1)}
          </span>
          <span className="text-xs text-muted-foreground">/ 10</span>
        </div>
        <div
          role="img"
          aria-label={ariaLabel}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn('h-full rounded-full transition-all', scoreColor(clamped))}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{scoreCopy(clamped)}</p>
      </CardContent>
    </Card>
  )
}
