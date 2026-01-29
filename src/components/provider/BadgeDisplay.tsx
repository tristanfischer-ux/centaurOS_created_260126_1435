'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import {
    Clock,
    Star,
    CheckCircle2,
    Shield,
    TrendingUp,
} from 'lucide-react'
import type { BadgeType, ProviderBadge } from '@/actions/trust-signals'

interface BadgeConfig {
    icon: React.ComponentType<{ className?: string }>
    label: string
    description: string
    color: string
    bgColor: string
}

const BADGE_CONFIG: Record<BadgeType, BadgeConfig> = {
    fast_responder: {
        icon: Clock,
        label: 'Fast Responder',
        description: 'Consistently responds to enquiries within 2 hours',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
    },
    top_rated: {
        icon: Star,
        label: 'Top Rated',
        description: 'Maintains a 4.8+ star rating from clients',
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
    },
    reliable: {
        icon: CheckCircle2,
        label: 'Reliable',
        description: '95%+ on-time delivery rate',
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
    },
    verified_partner: {
        icon: Shield,
        label: 'Verified Partner',
        description: 'Vetted and approved by CentaurOS team',
        color: 'text-violet-600',
        bgColor: 'bg-violet-50',
    },
    rising_star: {
        icon: TrendingUp,
        label: 'Rising Star',
        description: 'New provider with excellent early performance',
        color: 'text-rose-600',
        bgColor: 'bg-rose-50',
    },
}

interface BadgeDisplayProps {
    badges: ProviderBadge[]
    maxDisplay?: number
    size?: 'sm' | 'md' | 'lg'
    showLabels?: boolean
    className?: string
}

export const BadgeDisplay = memo(function BadgeDisplay({
    badges,
    maxDisplay = 5,
    size = 'md',
    showLabels = false,
    className,
}: BadgeDisplayProps) {
    if (!badges || badges.length === 0) return null

    const displayBadges = badges.slice(0, maxDisplay)
    const remainingCount = badges.length - maxDisplay

    const sizeClasses = {
        sm: 'w-5 h-5',
        md: 'w-6 h-6',
        lg: 'w-8 h-8',
    }

    const iconSizeClasses = {
        sm: 'w-3 h-3',
        md: 'w-4 h-4',
        lg: 'w-5 h-5',
    }

    return (
        <TooltipProvider>
            <div className={cn('flex items-center gap-1.5 flex-wrap', className)}>
                {displayBadges.map((badge) => {
                    const config = BADGE_CONFIG[badge.badge_type]
                    if (!config) return null

                    const Icon = config.icon

                    return (
                        <Tooltip key={badge.id}>
                            <TooltipTrigger asChild>
                                <div
                                    className={cn(
                                        'inline-flex items-center gap-1 rounded-full transition-colors cursor-help',
                                        config.bgColor,
                                        showLabels ? 'px-2 py-0.5' : 'p-1',
                                        sizeClasses[size]
                                    )}
                                >
                                    <Icon className={cn(iconSizeClasses[size], config.color)} />
                                    {showLabels && (
                                        <span className={cn('text-xs font-medium', config.color)}>
                                            {config.label}
                                        </span>
                                    )}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                                <div className="space-y-1">
                                    <p className="font-semibold">{config.label}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {config.description}
                                    </p>
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    )
                })}
                {remainingCount > 0 && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div
                                className={cn(
                                    'inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-medium cursor-help',
                                    sizeClasses[size]
                                )}
                            >
                                +{remainingCount}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                            <p className="text-xs">
                                {remainingCount} more badge{remainingCount > 1 ? 's' : ''}
                            </p>
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
        </TooltipProvider>
    )
})

// Single badge component for more control
interface SingleBadgeProps {
    badgeType: BadgeType
    size?: 'sm' | 'md' | 'lg'
    showLabel?: boolean
    className?: string
}

export const SingleBadge = memo(function SingleBadge({
    badgeType,
    size = 'md',
    showLabel = false,
    className,
}: SingleBadgeProps) {
    const config = BADGE_CONFIG[badgeType]
    if (!config) return null

    const Icon = config.icon

    const sizeClasses = {
        sm: showLabel ? 'px-2 py-0.5' : 'p-1',
        md: showLabel ? 'px-2.5 py-1' : 'p-1.5',
        lg: showLabel ? 'px-3 py-1.5' : 'p-2',
    }

    const iconSizeClasses = {
        sm: 'w-3 h-3',
        md: 'w-4 h-4',
        lg: 'w-5 h-5',
    }

    const textSizeClasses = {
        sm: 'text-xs',
        md: 'text-sm',
        lg: 'text-base',
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-full transition-colors cursor-help',
                            config.bgColor,
                            sizeClasses[size],
                            className
                        )}
                    >
                        <Icon className={cn(iconSizeClasses[size], config.color)} />
                        {showLabel && (
                            <span className={cn('font-medium', textSizeClasses[size], config.color)}>
                                {config.label}
                            </span>
                        )}
                    </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                    <div className="space-y-1">
                        <p className="font-semibold">{config.label}</p>
                        <p className="text-xs text-muted-foreground">{config.description}</p>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
})

// Export badge config for external use
export { BADGE_CONFIG }
export type { BadgeConfig }
