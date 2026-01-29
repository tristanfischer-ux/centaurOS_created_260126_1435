"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
    ArrowRight, 
    CreditCard, 
    CheckCircle2,
    Clock,
    AlertCircle
} from "lucide-react"
import { ListingTransactionStatus } from "@/types/migration"
import { cn } from "@/lib/utils"

interface MigrationBannerProps {
    listingId: string
    status: ListingTransactionStatus
    isOwner?: boolean
    className?: string
}

/**
 * Banner displayed on non-migrated listings to prompt migration
 * Shows different content based on status and whether the viewer is the owner
 */
export function MigrationBanner({
    listingId,
    status,
    isOwner = false,
    className
}: MigrationBannerProps) {
    // Don't show banner for transactional listings
    if (status === 'transactional') {
        return null
    }
    
    const bannerConfig = getBannerConfig(status, isOwner, listingId)
    
    if (!bannerConfig) {
        return null
    }
    
    return (
        <Card className={cn(bannerConfig.containerClass, className)}>
            <CardContent className="flex items-start gap-4 py-4">
                <div className={cn("p-2 rounded-lg flex-shrink-0", bannerConfig.iconClass)}>
                    <bannerConfig.Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className={cn("font-semibold", bannerConfig.titleClass)}>
                            {bannerConfig.title}
                        </h3>
                        {bannerConfig.badge && (
                            <Badge variant="secondary" className={bannerConfig.badge.class}>
                                {bannerConfig.badge.label}
                            </Badge>
                        )}
                    </div>
                    <p className={cn("text-sm", bannerConfig.descriptionClass)}>
                        {bannerConfig.description}
                    </p>
                </div>
                {bannerConfig.cta && (
                    <Link href={bannerConfig.cta.href}>
                        <Button variant={bannerConfig.cta.variant || 'default'} size="sm">
                            {bannerConfig.cta.label}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                )}
            </CardContent>
        </Card>
    )
}

function getBannerConfig(
    status: ListingTransactionStatus,
    isOwner: boolean,
    listingId: string
) {
    if (isOwner) {
        // Owner-facing messages
        switch (status) {
            case 'invite_sent':
            case 'pending_signup':
                return {
                    Icon: CreditCard,
                    title: 'Complete Your Setup',
                    description: 'Finish setting up your provider account to start accepting bookings and payments.',
                    containerClass: 'border-purple-200 bg-purple-50/50',
                    iconClass: 'bg-purple-100 text-purple-600',
                    titleClass: 'text-purple-900',
                    descriptionClass: 'text-purple-700',
                    badge: { label: 'Action Needed', class: 'bg-purple-100 text-purple-700' },
                    cta: {
                        href: `/provider-signup?listing=${listingId}`,
                        label: 'Complete Setup',
                        variant: 'default' as const
                    }
                }
            case 'contact_only':
                return {
                    Icon: AlertCircle,
                    title: 'Upgrade Your Listing',
                    description: 'Upgrade to accept bookings directly through the platform with secure payments.',
                    containerClass: 'border-blue-200 bg-blue-50/50',
                    iconClass: 'bg-blue-100 text-blue-600',
                    titleClass: 'text-blue-900',
                    descriptionClass: 'text-blue-700',
                    cta: {
                        href: `/provider-signup?listing=${listingId}`,
                        label: 'Upgrade Now',
                        variant: 'default' as const
                    }
                }
        }
    } else {
        // Visitor-facing messages
        switch (status) {
            case 'invite_sent':
            case 'pending_signup':
                return {
                    Icon: Clock,
                    title: 'Coming Soon',
                    description: 'This provider is setting up online booking. Contact them directly for now.',
                    containerClass: 'border-amber-200 bg-amber-50/50',
                    iconClass: 'bg-amber-100 text-amber-600',
                    titleClass: 'text-amber-900',
                    descriptionClass: 'text-amber-700',
                    badge: { label: 'Setting Up', class: 'bg-amber-100 text-amber-700' }
                }
            case 'contact_only':
                return {
                    Icon: AlertCircle,
                    title: 'Contact Only',
                    description: 'This provider isn\'t set up for online booking yet. Use their contact details.',
                    containerClass: 'border-slate-200 bg-slate-50/50',
                    iconClass: 'bg-slate-100 text-slate-600',
                    titleClass: 'text-slate-900',
                    descriptionClass: 'text-slate-600'
                }
        }
    }
    
    return null
}

/**
 * Compact migration status indicator for cards/lists
 */
interface MigrationStatusIndicatorProps {
    status: ListingTransactionStatus
    size?: 'sm' | 'md'
}

export function MigrationStatusIndicator({ 
    status, 
    size = 'md' 
}: MigrationStatusIndicatorProps) {
    const config = {
        transactional: {
            icon: CheckCircle2,
            label: 'Book Now',
            className: 'text-green-600'
        },
        invite_sent: {
            icon: Clock,
            label: 'Coming Soon',
            className: 'text-amber-600'
        },
        pending_signup: {
            icon: Clock,
            label: 'Setting Up',
            className: 'text-blue-600'
        },
        contact_only: {
            icon: AlertCircle,
            label: 'Contact Only',
            className: 'text-slate-500'
        }
    }
    
    const { icon: Icon, label, className } = config[status]
    const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
    const textSize = size === 'sm' ? 'text-xs' : 'text-sm'
    
    return (
        <div className={cn("flex items-center gap-1", className)}>
            <Icon className={iconSize} />
            <span className={textSize}>{label}</span>
        </div>
    )
}
