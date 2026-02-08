'use client'

/**
 * SmartScoreCard - Visual indicator for SMART goal quality.
 *
 * @description Displays 5 pill indicators (S-M-A-R-T) showing how well
 * a goal meets each SMART dimension. Each pill is color-coded:
 * green = strong (4-5), amber = could improve (2-3), gray = missing (1).
 * Hover tooltips show the dimension name and improvement suggestion.
 *
 * @component
 *
 * @example
 * <SmartScoreCard
 *   score={{ specific: 4, measurable: 2, achievable: 5, relevant: 4, timeBound: 1 }}
 *   suggestions={["Add a measurable metric", "Set a deadline"]}
 * />
 */

import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import type { SmartScore } from '@/actions/smart-goals'

/** SMART dimension metadata */
const SMART_DIMENSIONS = [
  { key: 'specific' as const, label: 'Specific', letter: 'S', tip: 'Clear and unambiguous' },
  { key: 'measurable' as const, label: 'Measurable', letter: 'M', tip: 'Has concrete metrics' },
  { key: 'achievable' as const, label: 'Achievable', letter: 'A', tip: 'Realistic to accomplish' },
  { key: 'relevant' as const, label: 'Relevant', letter: 'R', tip: 'Aligned with your goals' },
  { key: 'timeBound' as const, label: 'Time-bound', letter: 'T', tip: 'Has a clear deadline' },
] as const

interface SmartScoreCardProps {
  /** Per-dimension SMART scores (1-5 each) */
  score: SmartScore
  /** Optional improvement suggestions to show in tooltips */
  suggestions?: string[]
  /** Compact mode for inline use (smaller pills) */
  compact?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Returns the color class for a score value.
 * 4-5 = success (green), 2-3 = warning (amber), 1 = muted (gray)
 */
function getScoreColor(value: number): string {
  if (value >= 4) return 'bg-status-success text-status-success-foreground'
  if (value >= 2) return 'bg-status-warning text-status-warning-foreground'
  return 'bg-muted text-muted-foreground'
}

/**
 * Returns a human-friendly label for a score value.
 */
function getScoreLabel(value: number): string {
  if (value >= 4) return 'Strong'
  if (value >= 2) return 'Could improve'
  return 'Missing'
}

/**
 * Calculates the overall average SMART score.
 */
export function getOverallScore(score: SmartScore): number {
  const values = Object.values(score)
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

export function SmartScoreCard({
  score,
  suggestions = [],
  compact = false,
  className,
}: SmartScoreCardProps): React.ReactElement {
  const overall = getOverallScore(score)

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          'flex items-center',
          compact ? 'gap-1' : 'gap-1.5',
          className
        )}
        role="group"
        aria-label={`SMART score: ${overall} out of 5`}
      >
        {SMART_DIMENSIONS.map((dim) => {
          const value = score[dim.key]
          const suggestion = suggestions.find(
            (s) => s.toLowerCase().includes(dim.label.toLowerCase())
          )

          return (
            <Tooltip key={dim.key}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'flex items-center justify-center rounded-full font-semibold transition-colors cursor-default',
                    getScoreColor(value),
                    compact
                      ? 'h-5 w-5 text-[10px]'
                      : 'h-6 w-6 text-xs'
                  )}
                  aria-label={`${dim.label}: ${value}/5 - ${getScoreLabel(value)}`}
                >
                  {dim.letter}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px]">
                <p className="font-medium">
                  {dim.label}: {value}/5
                </p>
                <p className="text-muted-foreground">
                  {suggestion || dim.tip}
                </p>
              </TooltipContent>
            </Tooltip>
          )
        })}

        {!compact && (
          <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
            {overall}/5
          </span>
        )}
      </div>
    </TooltipProvider>
  )
}
