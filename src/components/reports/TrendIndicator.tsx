'use client'

/**
 * TrendIndicator Component
 * 
 * Displays trend direction with arrow and percentage change
 */

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TrendDirection } from '@/lib/reports/types'

interface TrendIndicatorProps {
    /** Direction of the trend */
    trend: TrendDirection
    /** Percentage change value */
    value: number
    /** Suffix to display after value (default: %) */
    suffix?: string
    /** Whether this is an anomaly */
    isAnomaly?: boolean
    /** Size variant */
    size?: 'sm' | 'md'
    /** Show the value or just the icon */
    showValue?: boolean
    /** Additional className */
    className?: string
}

export function TrendIndicator({
    trend,
    value,
    suffix = '%',
    isAnomaly = false,
    size = 'md',
    showValue = true,
    className
}: TrendIndicatorProps) {
    const Icon = trend === 'up' 
        ? TrendingUp 
        : trend === 'down' 
            ? TrendingDown 
            : Minus
    
    const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
    const textSize = size === 'sm' ? 'text-xs' : 'text-sm'
    
    return (
        <div
            className={cn(
                'inline-flex items-center gap-1 font-medium',
                textSize,
                trend === 'up' && 'text-status-success',
                trend === 'down' && 'text-status-error',
                trend === 'stable' && 'text-muted-foreground',
                isAnomaly && 'animate-pulse',
                className
            )}
        >
            <Icon className={iconSize} />
            {showValue && (
                <span>
                    {value > 0 ? '+' : ''}{value.toFixed(0)}{suffix}
                </span>
            )}
            {isAnomaly && (
                <span className="text-xs opacity-70">(unusual)</span>
            )}
        </div>
    )
}

/**
 * Compact trend badge for inline display
 */
interface TrendBadgeProps {
    trend: TrendDirection
    value: number
    label: string
    className?: string
}

export function TrendBadge({ trend, value, label, className }: TrendBadgeProps) {
    return (
        <div className={cn('flex items-center gap-1.5 text-sm', className)}>
            <span className="text-muted-foreground">{label}:</span>
            <TrendIndicator trend={trend} value={value} size="sm" />
        </div>
    )
}
