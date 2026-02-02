'use client'

/**
 * InsightCard Component
 * 
 * Displays actionable insights with type-based styling
 */

import { AlertTriangle, Lightbulb, PartyPopper, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { Insight, InsightType } from '@/lib/reports/types'

interface InsightCardProps {
    insight: Insight
    /** Compact mode for widget display */
    compact?: boolean
    /** Additional className */
    className?: string
}

const iconMap: Record<InsightType, typeof AlertTriangle> = {
    warning: AlertTriangle,
    suggestion: Lightbulb,
    celebration: PartyPopper
}

const borderColorMap: Record<InsightType, string> = {
    warning: 'border-l-status-warning',
    suggestion: 'border-l-status-info',
    celebration: 'border-l-status-success'
}

const iconColorMap: Record<InsightType, string> = {
    warning: 'text-status-warning',
    suggestion: 'text-status-info',
    celebration: 'text-status-success'
}

export function InsightCard({ insight, compact = false, className }: InsightCardProps) {
    const Icon = iconMap[insight.type]
    const borderColor = borderColorMap[insight.type]
    const iconColor = iconColorMap[insight.type]
    
    if (compact) {
        return (
            <div
                className={cn(
                    'flex items-start gap-2 p-2 rounded-md bg-muted/50',
                    'border-l-2',
                    borderColor,
                    className
                )}
            >
                <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', iconColor)} />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                        {insight.title}
                    </p>
                    {insight.action && (
                        <Link
                            href={insight.action.href}
                            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                            {insight.action.label}
                            <ArrowRight className="h-3 w-3" />
                        </Link>
                    )}
                </div>
            </div>
        )
    }
    
    return (
        <Card
            className={cn(
                'border-l-4',
                borderColor,
                className
            )}
        >
            <CardContent className="pt-4 flex items-start gap-3">
                <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', iconColor)} />
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">
                        {insight.title}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {insight.description}
                    </p>
                    {insight.action && (
                        <Button 
                            variant="link" 
                            className="p-0 h-auto mt-2 text-sm" 
                            asChild
                        >
                            <Link href={insight.action.href}>
                                {insight.action.label}
                                <ArrowRight className="h-3 w-3 ml-1" />
                            </Link>
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

/**
 * List of insights with optional limit
 */
interface InsightListProps {
    insights: Insight[]
    limit?: number
    compact?: boolean
    className?: string
}

export function InsightList({ insights, limit, compact = false, className }: InsightListProps) {
    const displayInsights = limit ? insights.slice(0, limit) : insights
    
    if (displayInsights.length === 0) {
        return null
    }
    
    return (
        <div className={cn('space-y-2', className)}>
            {displayInsights.map(insight => (
                <InsightCard
                    key={insight.id}
                    insight={insight}
                    compact={compact}
                />
            ))}
        </div>
    )
}
