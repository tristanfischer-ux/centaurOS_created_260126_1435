"use client"

import { Badge } from "@/components/ui/badge"
import { 
    Clock, 
    Mail, 
    AlertCircle,
    Zap
} from "lucide-react"
import { ListingTransactionStatus } from "@/types/migration"
import { cn } from "@/lib/utils"

interface ListingStatusBadgeProps {
    status: ListingTransactionStatus
    size?: 'sm' | 'md' | 'lg'
    showIcon?: boolean
    showTooltip?: boolean
    className?: string
}

/**
 * Badge component showing the migration/transaction status of a listing
 * 
 * Status colors:
 * - Transactional: Green - Fully migrated, can accept bookings
 * - Invite Sent: Yellow/Amber - Invitation sent, awaiting signup
 * - Pending Signup: Blue - Provider started signup but not complete
 * - Contact Only: Gray - Not migrated, contact-only fallback
 */
export function ListingStatusBadge({
    status,
    size = 'md',
    showIcon = true,
    className
}: ListingStatusBadgeProps) {
    const config = getStatusConfig(status)
    
    const sizeClasses = {
        sm: 'text-xs px-1.5 py-0.5',
        md: 'text-xs px-2 py-1',
        lg: 'text-sm px-3 py-1.5'
    }
    
    const iconSizes = {
        sm: 'h-3 w-3',
        md: 'h-3.5 w-3.5',
        lg: 'h-4 w-4'
    }
    
    return (
        <Badge
            variant="secondary"
            className={cn(
                sizeClasses[size],
                config.className,
                'inline-flex items-center gap-1',
                className
            )}
        >
            {showIcon && (
                <config.Icon className={iconSizes[size]} />
            )}
            {config.label}
        </Badge>
    )
}

function getStatusConfig(status: ListingTransactionStatus) {
    switch (status) {
        case 'transactional':
            return {
                Icon: Zap,
                label: 'Book Now',
                className: 'bg-green-100 text-green-800 hover:bg-green-100 border-green-200',
                description: 'This provider accepts direct bookings'
            }
        case 'invite_sent':
            return {
                Icon: Mail,
                label: 'Coming Soon',
                className: 'bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200',
                description: 'This provider is setting up bookings'
            }
        case 'pending_signup':
            return {
                Icon: Clock,
                label: 'Setting Up',
                className: 'bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200',
                description: 'Provider is completing their profile'
            }
        case 'contact_only':
        default:
            return {
                Icon: AlertCircle,
                label: 'Contact',
                className: 'bg-slate-100 text-slate-600 hover:bg-slate-100 border-slate-200',
                description: 'Contact this provider directly'
            }
    }
}

/**
 * Compact dot indicator for list views
 */
interface StatusDotProps {
    status: ListingTransactionStatus
    size?: 'sm' | 'md'
    className?: string
}

export function StatusDot({ status, size = 'md', className }: StatusDotProps) {
    const dotSizes = {
        sm: 'w-2 h-2',
        md: 'w-3 h-3'
    }
    
    const colors = {
        transactional: 'bg-green-500',
        invite_sent: 'bg-amber-500',
        pending_signup: 'bg-blue-500',
        contact_only: 'bg-slate-400'
    }
    
    return (
        <span
            className={cn(
                'rounded-full inline-block',
                dotSizes[size],
                colors[status],
                className
            )}
            title={getStatusConfig(status).description}
        />
    )
}

/**
 * Full status display with label and description
 */
interface StatusDisplayProps {
    status: ListingTransactionStatus
    showDescription?: boolean
    className?: string
}

export function StatusDisplay({ 
    status, 
    showDescription = true,
    className 
}: StatusDisplayProps) {
    const config = getStatusConfig(status)
    
    return (
        <div className={cn('flex items-start gap-2', className)}>
            <div className={cn(
                'p-1.5 rounded-lg mt-0.5',
                status === 'transactional' && 'bg-green-100 text-green-600',
                status === 'invite_sent' && 'bg-amber-100 text-amber-600',
                status === 'pending_signup' && 'bg-blue-100 text-blue-600',
                status === 'contact_only' && 'bg-slate-100 text-slate-500'
            )}>
                <config.Icon className="h-4 w-4" />
            </div>
            <div>
                <p className={cn(
                    'font-medium text-sm',
                    status === 'transactional' && 'text-green-800',
                    status === 'invite_sent' && 'text-amber-800',
                    status === 'pending_signup' && 'text-blue-800',
                    status === 'contact_only' && 'text-slate-600'
                )}>
                    {config.label}
                </p>
                {showDescription && (
                    <p className="text-xs text-muted-foreground">
                        {config.description}
                    </p>
                )}
            </div>
        </div>
    )
}

/**
 * CTA button that changes based on listing status
 */
interface ListingCTAButtonProps {
    status: ListingTransactionStatus
    listingId: string
    onBook?: () => void
    onContact?: () => void
    disabled?: boolean
    className?: string
}

export function ListingCTAButton({
    status,
    onBook,
    onContact,
    disabled = false,
    className
}: ListingCTAButtonProps) {
    const buttonConfig = {
        transactional: {
            label: 'Book Now',
            variant: 'default' as const,
            action: onBook
        },
        invite_sent: {
            label: 'Contact Provider',
            variant: 'secondary' as const,
            action: onContact
        },
        pending_signup: {
            label: 'Contact Provider',
            variant: 'secondary' as const,
            action: onContact
        },
        contact_only: {
            label: 'View Contact',
            variant: 'secondary' as const,
            action: onContact
        }
    }
    
    const config = buttonConfig[status]
    
    return (
        <button
            onClick={config.action}
            disabled={disabled}
            className={cn(
                'inline-flex items-center justify-center rounded-md font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-50',
                config.variant === 'default' 
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2'
                    : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 py-2',
                className
            )}
        >
            {config.label}
        </button>
    )
}
