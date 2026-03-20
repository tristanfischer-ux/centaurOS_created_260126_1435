/**
 * @file MatchScoreBadge.tsx
 *
 * @description Circular 0–100 match score indicator for investor cards.
 * Green >= 70, amber 40-69, gray < 40. Tooltip explains top contributing factors.
 */

'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface MatchScoreBadgeProps {
  score: number
  topFactors?: string[]
  size?: 'sm' | 'md'
}

export function MatchScoreBadge({ score, topFactors, size = 'sm' }: MatchScoreBadgeProps) {
  const colorClass = score >= 70
    ? 'text-success border-success/40 bg-success/10'
    : score >= 40
      ? 'text-warning border-warning/40 bg-warning/10'
      : 'text-muted-foreground border-border bg-muted/50'

  const dimensions = size === 'md' ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-xs'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'rounded-full border font-semibold flex items-center justify-center shrink-0 cursor-help',
              dimensions,
              colorClass
            )}
          >
            {score}
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[200px]">
          <p className="font-medium mb-1">Match Score: {score}/100</p>
          {topFactors && topFactors.length > 0 && (
            <ul className="text-xs space-y-0.5">
              {topFactors.map(f => (
                <li key={f} className="text-muted-foreground">• {f}</li>
              ))}
            </ul>
          )}
          {(!topFactors || topFactors.length === 0) && (
            <p className="text-xs text-muted-foreground">Based on stage, sector, and fund fit</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
