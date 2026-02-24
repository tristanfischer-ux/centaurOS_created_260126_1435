'use client'

import { ShieldCheck, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VerificationTier } from '@/actions/marketplace'

interface VerificationBadgeProps {
    tier: VerificationTier
    /** Render size variant. 'sm' for cards/list rows, 'md' for detail pages. */
    size?: 'sm' | 'md'
    /** Show label text next to icon. Default false (icon-only). */
    showLabel?: boolean
    className?: string
}

const TIER_CONFIG: Record<
    Exclude<VerificationTier, 'unverified'>,
    { label: string; tooltip: string; iconColor: string; labelColor: string }
> = {
    verified: {
        label: 'Verified',
        tooltip: 'Identity and credentials independently checked',
        iconColor: 'text-status-success',
        labelColor: 'text-status-success',
    },
    claimed: {
        label: 'Claimed',
        tooltip: 'Email confirmed, not independently verified',
        iconColor: 'text-electric-blue',
        labelColor: 'text-electric-blue',
    },
}

/**
 * Shared verification badge component.
 * Shows nothing for 'unverified' tier.
 *
 * @description Renders a shield icon with optional label and a native title tooltip.
 * - verified: green ShieldCheck icon
 * - claimed: blue Shield icon
 * - unverified: renders nothing
 */
export function VerificationBadge({ tier, size = 'sm', showLabel = false, className }: VerificationBadgeProps) {
    if (tier === 'unverified') return null

    const config = TIER_CONFIG[tier]
    const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
    const Icon = tier === 'verified' ? ShieldCheck : Shield

    return (
        <span
            className={cn('inline-flex items-center gap-1 shrink-0', className)}
            title={config.tooltip}
        >
            <Icon className={cn(iconSize, config.iconColor)} aria-hidden="true" />
            {showLabel && (
                <span className={cn('text-xs font-medium', config.labelColor)}>
                    {config.label}
                </span>
            )}
        </span>
    )
}
