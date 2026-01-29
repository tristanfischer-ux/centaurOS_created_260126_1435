'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { BadgeDisplay } from './BadgeDisplay'
import { Shield, Star, Award } from 'lucide-react'
import type { ProviderBadge, Certification } from '@/actions/trust-signals'

interface TrustSignalsCardProps {
    // Rating info (optional - may come from marketplace listing attributes)
    rating?: number
    reviewCount?: number
    // Badges
    badges?: ProviderBadge[]
    // Certifications count
    certificationCount?: number
    // Verified partner status
    isVerifiedPartner?: boolean
    // Display options
    compact?: boolean
    className?: string
}

export const TrustSignalsCard = memo(function TrustSignalsCard({
    rating,
    reviewCount,
    badges = [],
    certificationCount = 0,
    isVerifiedPartner = false,
    compact = true,
    className,
}: TrustSignalsCardProps) {
    // Check if has verified_partner badge
    const hasVerifiedBadge = isVerifiedPartner || badges.some(b => b.badge_type === 'verified_partner')
    
    // Get top badges (exclude verified_partner if showing separately)
    const displayBadges = badges
        .filter(b => !hasVerifiedBadge || b.badge_type !== 'verified_partner')
        .slice(0, 3)

    const hasContent = rating || displayBadges.length > 0 || certificationCount > 0 || hasVerifiedBadge

    if (!hasContent) return null

    if (compact) {
        return (
            <div className={cn('flex items-center gap-2 flex-wrap', className)}>
                {/* Verified Partner Tag */}
                {hasVerifiedBadge && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                        <Shield className="w-3 h-3" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">Verified</span>
                    </div>
                )}

                {/* Rating */}
                {rating !== undefined && rating > 0 && (
                    <div className="inline-flex items-center gap-1 text-sm">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
                        {reviewCount !== undefined && reviewCount > 0 && (
                            <span className="text-muted-foreground text-xs">({reviewCount})</span>
                        )}
                    </div>
                )}

                {/* Badges */}
                {displayBadges.length > 0 && (
                    <BadgeDisplay badges={displayBadges} maxDisplay={3} size="sm" />
                )}

                {/* Certifications count */}
                {certificationCount > 0 && (
                    <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Award className="w-3 h-3" />
                        <span>{certificationCount} cert{certificationCount > 1 ? 's' : ''}</span>
                    </div>
                )}
            </div>
        )
    }

    // Non-compact (detailed) view
    return (
        <div className={cn('space-y-3', className)}>
            {/* Header with verified status */}
            {hasVerifiedBadge && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-100">
                    <Shield className="w-4 h-4 text-violet-600" />
                    <span className="text-sm font-semibold text-violet-700">Verified Partner</span>
                </div>
            )}

            {/* Rating */}
            {rating !== undefined && rating > 0 && (
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                                key={star}
                                className={cn(
                                    'w-4 h-4',
                                    star <= Math.round(rating)
                                        ? 'fill-amber-400 text-amber-400'
                                        : 'fill-muted text-muted'
                                )}
                            />
                        ))}
                    </div>
                    <span className="font-semibold">{rating.toFixed(1)}</span>
                    {reviewCount !== undefined && reviewCount > 0 && (
                        <span className="text-sm text-muted-foreground">
                            ({reviewCount} review{reviewCount > 1 ? 's' : ''})
                        </span>
                    )}
                </div>
            )}

            {/* Badges */}
            {displayBadges.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Achievements</p>
                    <BadgeDisplay badges={displayBadges} maxDisplay={5} size="md" showLabels />
                </div>
            )}

            {/* Certifications */}
            {certificationCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Award className="w-4 h-4" />
                    <span>
                        {certificationCount} verified certification{certificationCount > 1 ? 's' : ''}
                    </span>
                </div>
            )}
        </div>
    )
})

// Minimal version for marketplace cards
interface TrustSignalsMinimalProps {
    badges?: ProviderBadge[]
    isVerifiedPartner?: boolean
    className?: string
}

export const TrustSignalsMinimal = memo(function TrustSignalsMinimal({
    badges = [],
    isVerifiedPartner = false,
    className,
}: TrustSignalsMinimalProps) {
    const hasVerifiedBadge = isVerifiedPartner || badges.some(b => b.badge_type === 'verified_partner')
    const displayBadges = badges
        .filter(b => b.badge_type !== 'verified_partner')
        .slice(0, 2)

    if (!hasVerifiedBadge && displayBadges.length === 0) return null

    return (
        <div className={cn('flex items-center gap-1', className)}>
            {hasVerifiedBadge && (
                <Shield className="w-3.5 h-3.5 text-violet-600" aria-label="Verified Partner" />
            )}
            {displayBadges.length > 0 && (
                <BadgeDisplay badges={displayBadges} maxDisplay={2} size="sm" />
            )}
        </div>
    )
})
