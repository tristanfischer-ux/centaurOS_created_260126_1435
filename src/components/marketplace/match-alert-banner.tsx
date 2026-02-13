'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
    Bell,
    X,
    ArrowRight,
    UserPlus,
    Star,
    TrendingUp,
    Award,
    CheckCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { markAlertRead, markAllAlertsRead, dismissAlert } from '@/actions/match-alerts'
import type { MatchAlert, AlertType } from '@/actions/match-alerts'
import type { MarketplaceListing } from '@/actions/marketplace'

/**
 * MatchAlertBanner - Displays unread match alerts at the top of the Recruits page.
 *
 * @description Shows a compact, dismissible banner with new match notifications.
 * Users can view matched listings or dismiss alerts. Creates retention by
 * pulling users back with relevant updates.
 *
 * @component
 */

interface MatchAlertBannerProps {
    /** Pre-fetched unread alerts */
    alerts: MatchAlert[]
    /** Callback when user clicks to view a matched listing */
    onViewListing?: (listingId: string) => void
    /** Additional CSS classes */
    className?: string
}

const ALERT_ICONS: Record<AlertType, typeof Bell> = {
    new_match: UserPlus,
    saved_update: Star,
    industry_join: TrendingUp,
    weekly_digest: Bell,
    endorsement: Award,
}

const ALERT_COLORS: Record<AlertType, string> = {
    new_match: 'bg-international-orange/10 text-international-orange',
    saved_update: 'bg-amber-50 text-amber-600',
    industry_join: 'bg-electric-blue/10 text-electric-blue',
    weekly_digest: 'bg-muted text-muted-foreground',
    endorsement: 'bg-status-success-light text-status-success',
}

export function MatchAlertBanner({
    alerts: initialAlerts,
    onViewListing,
    className,
}: MatchAlertBannerProps) {
    const [alerts, setAlerts] = useState(initialAlerts)
    const [isMarkingAll, setIsMarkingAll] = useState(false)

    const handleDismiss = useCallback(async (alertId: string) => {
        // Optimistic update
        setAlerts(prev => prev.filter(a => a.id !== alertId))

        try {
            const result = await dismissAlert(alertId)
            if (!result.success) {
                toast.error('Failed to dismiss alert')
            }
        } catch {
            toast.error('Failed to dismiss alert')
        }
    }, [])

    const handleMarkAllRead = useCallback(async () => {
        setIsMarkingAll(true)
        try {
            const result = await markAllAlertsRead()
            if (result.success) {
                setAlerts([])
                toast.success('All alerts marked as read')
            } else {
                toast.error('Failed to mark alerts as read')
            }
        } catch {
            toast.error('Failed to mark alerts as read')
        } finally {
            setIsMarkingAll(false)
        }
    }, [])

    const handleViewAlert = useCallback(async (alert: MatchAlert) => {
        // Mark as read
        await markAlertRead(alert.id)

        // Navigate to listing if available
        if (alert.listing_id && onViewListing) {
            onViewListing(alert.listing_id)
        }

        // Remove from local state
        setAlerts(prev => prev.filter(a => a.id !== alert.id))
    }, [onViewListing])

    if (alerts.length === 0) return null

    return (
        <div className={cn('space-y-2', className)}>
            {/* Header with count and mark all */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-international-orange" />
                    <span className="text-sm font-medium text-foreground">
                        New Matches
                    </span>
                    <Badge variant="secondary" className="text-[10px] bg-international-orange/10 text-international-orange border-0">
                        {alerts.length}
                    </Badge>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMarkAllRead}
                    disabled={isMarkingAll}
                    className="text-xs gap-1 text-muted-foreground"
                >
                    <CheckCheck className="w-3 h-3" />
                    Mark all read
                </Button>
            </div>

            {/* Alert cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {alerts.slice(0, 4).map(alert => {
                    const Icon = ALERT_ICONS[alert.type] || Bell
                    const colorClass = ALERT_COLORS[alert.type] || ALERT_COLORS.weekly_digest

                    return (
                        <Card
                            key={alert.id}
                            className="border cursor-pointer hover:shadow-sm transition-shadow"
                            onClick={() => handleViewAlert(alert)}
                        >
                            <CardContent className="py-2.5 px-3">
                                <div className="flex items-start gap-2.5">
                                    <div className={cn(
                                        'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                                        colorClass
                                    )}>
                                        <Icon className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-foreground line-clamp-1">
                                            {alert.title}
                                        </p>
                                        {alert.description && (
                                            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                                                {alert.description}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {alert.listing_id && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 w-6 p-0"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleViewAlert(alert)
                                                }}
                                                aria-label="View listing"
                                            >
                                                <ArrowRight className="w-3 h-3" />
                                            </Button>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleDismiss(alert.id)
                                            }}
                                            className="min-w-[44px] min-h-[44px] w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                            aria-label="Dismiss alert"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {alerts.length > 4 && (
                <p className="text-xs text-muted-foreground text-center">
                    +{alerts.length - 4} more alerts
                </p>
            )}
        </div>
    )
}
