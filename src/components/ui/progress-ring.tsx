'use client'

import { cn } from '@/lib/utils'

interface ProgressRingProps {
  /** Progress value 0-100 */
  progress: number
  /** Ring diameter in pixels */
  size?: number
  /** Ring stroke width */
  strokeWidth?: number
  /** Additional className */
  className?: string
  /** Show percentage text in center */
  showLabel?: boolean
  /** Color variant based on health */
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

const VARIANT_COLORS = {
  default: 'stroke-international-orange',
  success: 'stroke-status-success',
  warning: 'stroke-status-warning',
  danger: 'stroke-status-error',
}

const VARIANT_TRACK = {
  default: 'stroke-muted',
  success: 'stroke-status-success/20',
  warning: 'stroke-status-warning/20',
  danger: 'stroke-status-error/20',
}

/** Determine variant from progress percentage */
export function getHealthVariant(progress: number): ProgressRingProps['variant'] {
  if (progress >= 70) return 'success'
  if (progress >= 40) return 'warning'
  if (progress > 0) return 'danger'
  return 'default'
}

export function ProgressRing({
  progress,
  size = 48,
  strokeWidth = 4,
  className,
  showLabel = true,
  variant = 'default',
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(Math.max(progress, 0), 100) / 100) * circumference

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={VARIANT_TRACK[variant]}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(VARIANT_COLORS[variant], 'transition-all duration-500 ease-out')}
        />
      </svg>
      {showLabel && (
        <span className="absolute text-[10px] font-semibold text-foreground tabular-nums">
          {Math.round(progress)}%
        </span>
      )}
    </div>
  )
}
