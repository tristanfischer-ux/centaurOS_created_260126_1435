'use client'

import { cn } from '@/lib/utils'
import { FlaskConical } from 'lucide-react'

interface BetaBadgeProps {
    /** Optional click handler — typically opens feedback dialog pre-filled with feature name */
    onClick?: () => void
    /** Additional CSS classes */
    className?: string
}

/**
 * BetaBadge — Small, tasteful pill that marks features in beta.
 * 
 * @description Displayed next to features marked as 'beta' in the feature registry.
 * Clickable to open the feedback dialog pre-filled with the feature name, turning
 * the beta label from a warning into an invitation to participate.
 * 
 * @param props.onClick - Click handler (opens feedback dialog)
 * @param props.className - Additional CSS classes
 */
export function BetaBadge({ onClick, className }: BetaBadgeProps) {
    const Component = onClick ? 'button' : 'span'

    return (
        <Component
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full',
                'text-[9px] font-semibold uppercase tracking-wider',
                'bg-international-orange/10 text-international-orange',
                'border border-international-orange/20',
                onClick && 'cursor-pointer hover:bg-international-orange/15 transition-colors',
                className
            )}
            aria-label={onClick ? 'Beta feature — click to share feedback' : 'Beta feature'}
        >
            <FlaskConical className="h-2.5 w-2.5" />
            Beta
        </Component>
    )
}
