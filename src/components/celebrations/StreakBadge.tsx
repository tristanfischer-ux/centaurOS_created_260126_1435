/**
 * StreakBadge — Displays the team's current task completion streak.
 * 
 * @description Shows how many consecutive days the team has completed
 * at least one task. Provides positive reinforcement and creates
 * a habit-forming loop.
 * 
 * @example
 * <StreakBadge streak={5} />
 */

"use client"

import { Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface StreakBadgeProps {
  /** Number of consecutive days with task completions */
  streak: number
  /** Additional CSS classes */
  className?: string
}

/**
 * Visual streak indicator with flame icon and day count.
 * Only renders when streak >= 2 days.
 */
export function StreakBadge({ streak, className }: StreakBadgeProps): React.ReactElement | null {
  if (streak < 2) return null

  const isHot = streak >= 7
  const isWarm = streak >= 3

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "gap-1 font-semibold transition-colors",
              isHot && "border-international-orange text-international-orange bg-international-orange/5",
              isWarm && !isHot && "border-amber-400 text-amber-600 bg-amber-50",
              !isWarm && "border-muted text-muted-foreground",
              className
            )}
          >
            <Flame className={cn(
              "h-3.5 w-3.5",
              isHot && "text-international-orange",
              isWarm && !isHot && "text-amber-500",
            )} />
            {streak}d
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{streak}-day completion streak</p>
          <p className="text-xs text-muted-foreground">
            {isHot
              ? "Your team is on fire! Keep it going."
              : isWarm
                ? "Great consistency! Aim for 7 days."
                : "Building momentum. Keep completing tasks daily."}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
