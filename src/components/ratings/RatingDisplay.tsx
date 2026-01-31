"use client"

/**
 * Rating Display Component
 * Shows star ratings and review counts
 */

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { Star, TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface RatingDisplayProps {
  average: number
  total: number
  showRating?: boolean
  size?: "sm" | "md" | "lg"
  showCount?: boolean
  showTrend?: boolean
  trend?: "improving" | "stable" | "declining" | "new"
  className?: string
}

export function RatingDisplay({
  average,
  total,
  showRating = true,
  size = "md",
  showCount = true,
  showTrend = false,
  trend = "stable",
  className,
}: RatingDisplayProps) {
  const starSize = size === "sm" ? "h-3 w-3" : size === "lg" ? "h-6 w-6" : "h-4 w-4"
  const textSize = size === "sm" ? "text-xs" : size === "lg" ? "text-lg" : "text-sm"

  // If not enough reviews, show "New Provider" badge
  if (!showRating || total < 3) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Badge variant="secondary" className="gap-1">
          <Sparkles className={cn(starSize)} />
          New Provider
        </Badge>
        {total > 0 && showCount && (
          <span className={cn("text-muted-foreground", textSize)}>
            ({total} review{total !== 1 ? "s" : ""})
          </span>
        )}
      </div>
    )
  }

  const fullStars = Math.floor(average)
  const hasHalfStar = average - fullStars >= 0.5
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0)

  const getTrendIcon = () => {
    switch (trend) {
      case "improving":
        return <TrendingUp className="h-3 w-3 text-status-success" />
      case "declining":
        return <TrendingDown className="h-3 w-3 text-destructive" />
      case "stable":
        return <Minus className="h-3 w-3 text-muted-foreground" />
      default:
        return null
    }
  }

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-2", className)}>
        {/* Stars */}
        <div className="flex">
          {/* Full stars */}
          {Array.from({ length: fullStars }).map((_, i) => (
            <Star
              key={`full-${i}`}
              className={cn(starSize, "text-amber-400 fill-amber-400")}
            />
          ))}

          {/* Half star */}
          {hasHalfStar && (
            <div className="relative">
              <Star className={cn(starSize, "text-muted-foreground")} />
              <div className="absolute inset-0 overflow-hidden w-[50%]">
                <Star className={cn(starSize, "text-amber-400 fill-amber-400")} />
              </div>
            </div>
          )}

          {/* Empty stars */}
          {Array.from({ length: emptyStars }).map((_, i) => (
            <Star
              key={`empty-${i}`}
              className={cn(starSize, "text-muted-foreground")}
            />
          ))}
        </div>

        {/* Rating number */}
        <span className={cn("font-medium", textSize)}>{average.toFixed(1)}</span>

        {/* Review count */}
        {showCount && (
          <span className={cn("text-muted-foreground", textSize)}>
            ({total} review{total !== 1 ? "s" : ""})
          </span>
        )}

        {/* Trend indicator */}
        {showTrend && trend !== "new" && (
          <Tooltip>
            <TooltipTrigger>{getTrendIcon()}</TooltipTrigger>
            <TooltipContent>
              <p>
                {trend === "improving"
                  ? "Rating improving recently"
                  : trend === "declining"
                    ? "Rating declining recently"
                    : "Rating stable"}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}

/**
 * Compact rating badge
 */
interface RatingBadgeProps {
  average: number
  total: number
  showRating?: boolean
  className?: string
}

export function RatingBadge({
  average,
  total,
  showRating = true,
  className,
}: RatingBadgeProps) {
  if (!showRating || total < 3) {
    return (
      <Badge variant="secondary" className={cn("gap-1", className)}>
        <Sparkles className="h-3 w-3" />
        New
      </Badge>
    )
  }

  const variant = average >= 4.5 ? "default" : average >= 3.5 ? "secondary" : "secondary"

  return (
    <Badge variant={variant} className={cn("gap-1", className)}>
      <Star className="h-3 w-3 fill-current" />
      {average.toFixed(1)}
    </Badge>
  )
}

/**
 * Rating breakdown with distribution bars
 */
interface RatingBreakdownProps {
  distribution: {
    5: number
    4: number
    3: number
    2: number
    1: number
  }
  total: number
  className?: string
}

export function RatingBreakdown({ distribution, total, className }: RatingBreakdownProps) {
  const getPercentage = (count: number) => {
    if (total === 0) return 0
    return (count / total) * 100
  }

  return (
    <div className={cn("space-y-2", className)}>
      {[5, 4, 3, 2, 1].map((rating) => {
        const count = distribution[rating as keyof typeof distribution]
        const percentage = getPercentage(count)

        return (
          <div key={rating} className="flex items-center gap-2">
            <div className="flex items-center gap-1 w-12">
              <span className="text-sm">{rating}</span>
              <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
            </div>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Wilson score confidence indicator
 */
interface ConfidenceIndicatorProps {
  wilsonScore: number
  className?: string
}

export function ConfidenceIndicator({ wilsonScore, className }: ConfidenceIndicatorProps) {
  const getConfidenceLevel = () => {
    if (wilsonScore >= 4) return { label: "High confidence", color: "text-status-success" }
    if (wilsonScore >= 3) return { label: "Medium confidence", color: "text-status-warning" }
    return { label: "Low confidence", color: "text-muted-foreground" }
  }

  const { label, color } = getConfidenceLevel()

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span className={cn("text-xs", color, className)}>{label}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>
            The Wilson score ({wilsonScore.toFixed(2)}/5) measures confidence in the
            rating based on the number and distribution of reviews. Higher scores
            indicate more reliable ratings.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default RatingDisplay
