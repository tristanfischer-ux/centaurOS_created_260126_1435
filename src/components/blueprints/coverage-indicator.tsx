'use client'

import { cn } from '@/lib/utils'
import type { CoverageStatus } from '@/types/blueprints'
import { COVERAGE_STATUS_COLORS } from '@/types/blueprints'
import { CheckCircle2, AlertCircle, Circle, MinusCircle } from 'lucide-react'

interface CoverageIndicatorProps {
  status: CoverageStatus
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  showIcon?: boolean
  className?: string
}

const statusLabels: Record<CoverageStatus, string> = {
  covered: 'Covered',
  partial: 'Partial',
  gap: 'Gap',
  not_needed: 'Not Needed',
}

const statusIcons = {
  covered: CheckCircle2,
  partial: AlertCircle,
  gap: Circle,
  not_needed: MinusCircle,
}

const sizeClasses = {
  sm: {
    dot: 'h-2 w-2',
    icon: 'h-3.5 w-3.5',
    text: 'text-xs',
    gap: 'gap-1',
  },
  md: {
    dot: 'h-2.5 w-2.5',
    icon: 'h-4 w-4',
    text: 'text-sm',
    gap: 'gap-1.5',
  },
  lg: {
    dot: 'h-3 w-3',
    icon: 'h-5 w-5',
    text: 'text-base',
    gap: 'gap-2',
  },
}

export function CoverageIndicator({
  status,
  size = 'md',
  showLabel = true,
  showIcon = false,
  className,
}: CoverageIndicatorProps) {
  const colors = COVERAGE_STATUS_COLORS[status]
  const Icon = statusIcons[status]
  const sizes = sizeClasses[size]

  return (
    <div className={cn('flex items-center', sizes.gap, className)}>
      {showIcon ? (
        <Icon className={cn(sizes.icon, colors.text)} />
      ) : (
        <div className={cn('rounded-full', sizes.dot, colors.dot)} />
      )}
      {showLabel && (
        <span className={cn(sizes.text, 'font-medium', colors.text)}>
          {statusLabels[status]}
        </span>
      )}
    </div>
  )
}

interface CoverageBarProps {
  covered: number
  partial: number
  gaps: number
  notNeeded?: number
  className?: string
  showLabels?: boolean
}

export function CoverageBar({
  covered,
  partial,
  gaps,
  notNeeded = 0,
  className,
  showLabels = false,
}: CoverageBarProps) {
  const total = covered + partial + gaps + notNeeded
  if (total === 0) return null

  const coveredPct = (covered / total) * 100
  const partialPct = (partial / total) * 100
  const gapsPct = (gaps / total) * 100

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="bg-emerald-500 transition-all"
          style={{ width: `${coveredPct}%` }}
        />
        <div
          className="bg-amber-500 transition-all"
          style={{ width: `${partialPct}%` }}
        />
        <div
          className="bg-rose-500 transition-all"
          style={{ width: `${gapsPct}%` }}
        />
      </div>
      {showLabels && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{covered} covered</span>
          <span>{partial} partial</span>
          <span>{gaps} gaps</span>
        </div>
      )}
    </div>
  )
}

interface CoverageScoreProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

export function CoverageScore({
  score,
  size = 'md',
  showLabel = true,
  className,
}: CoverageScoreProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600'
    if (score >= 50) return 'text-amber-600'
    return 'text-rose-600'
  }

  const sizeStyles = {
    sm: 'text-lg font-semibold',
    md: 'text-2xl font-bold',
    lg: 'text-4xl font-bold',
  }

  return (
    <div className={cn('flex items-baseline gap-1', className)}>
      <span className={cn(sizeStyles[size], getScoreColor(score))}>
        {Math.round(score)}%
      </span>
      {showLabel && (
        <span className="text-sm text-muted-foreground">coverage</span>
      )}
    </div>
  )
}
