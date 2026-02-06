'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
    getCategoryBadgeClasses,
    getAvatarGradient,
    type MarketplaceCategory,
} from '@/lib/marketplace-colors'
import { ShieldCheck, Star, ArrowRight, TrendingUp, Clock, Users } from 'lucide-react'
import type { MarketplaceListing } from '@/actions/marketplace'

interface FeaturedBannerProps {
    listings: MarketplaceListing[]
    onViewDetail: (listing: MarketplaceListing) => void
}

/**
 * Builds all visible rationale tags for a listing so users understand
 * exactly why this provider is featured (rating, reviews, projects, response time).
 */
function getHighlightReasons(listing: MarketplaceListing): { label: string; icon: React.ElementType }[] {
    const attrs = listing.attributes || {}
    const rating = attrs.rating_average as number | undefined
    const reviews = attrs.total_reviews as number | undefined
    const bookings = attrs.total_bookings as number | undefined
    const responseHours = attrs.response_time_hours as number | undefined

    const reasons: { label: string; icon: React.ElementType }[] = []

    // Rating + review count (primary signal)
    if (rating && rating > 0) {
        const reviewSuffix = reviews && reviews > 0 ? ` from ${reviews} review${reviews === 1 ? '' : 's'}` : ''
        reasons.push({ label: `${rating.toFixed(1)}${reviewSuffix}`, icon: Star })
    }

    // Project count (social proof)
    if (bookings && bookings >= 2) {
        reasons.push({ label: `${bookings} projects completed`, icon: Users })
    }

    // Fast responder (operational signal)
    if (responseHours && responseHours <= 2) {
        reasons.push({ label: responseHours <= 1 ? 'Responds within 1hr' : 'Responds within 2hrs', icon: Clock })
    }

    // Always have at least one reason
    if (reasons.length === 0) {
        reasons.push({ label: 'Verified provider', icon: ShieldCheck })
    }

    return reasons
}

/**
 * Displays top-rated, verified marketplace providers with visible reasons for ranking.
 *
 * @description Replaces the generic "Featured" label with data-driven context so
 * users understand why these providers are highlighted above others.
 */
export function FeaturedBanner({ listings, onViewDetail }: FeaturedBannerProps) {
    if (listings.length === 0) return null

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-international-orange" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">Top Rated</h2>
                <span className="text-xs text-muted-foreground">
                    Ranked by rating, completed projects, and responsiveness
                </span>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
                {listings.map((listing) => {
                    const attrs = listing.attributes || {}
                    const gradient = getAvatarGradient(listing.category as MarketplaceCategory, listing.title)
                    const price = (attrs.rate || attrs.cost || attrs.price || attrs.day_rate) as string | undefined
                    const initials = listing.title.trim().split(/\s+/).length > 1
                        ? `${listing.title.trim().split(/\s+/)[0][0]}${listing.title.trim().split(/\s+/)[1][0]}`.toUpperCase()
                        : listing.title.substring(0, 2).toUpperCase()

                    const reasons = getHighlightReasons(listing)

                    return (
                        <button
                            key={listing.id}
                            onClick={() => onViewDetail(listing)}
                            className={cn(
                                'flex flex-col gap-2.5 px-4 py-3.5 rounded-xl border bg-background',
                                'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
                                'min-w-[280px] max-w-[340px] shrink-0 snap-start text-left'
                            )}
                        >
                            {/* Top row: avatar + name */}
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    'w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-semibold text-xs shrink-0',
                                    gradient
                                )}>
                                    {initials}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="text-sm font-semibold text-foreground truncate">
                                            {listing.title}
                                        </span>
                                        <ShieldCheck className="w-3.5 h-3.5 text-status-success shrink-0" aria-label="Verified" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge
                                            variant="secondary"
                                            className={cn(
                                                'text-[9px] px-1.5 py-0 border-0',
                                                getCategoryBadgeClasses(listing.category as MarketplaceCategory)
                                            )}
                                        >
                                            {listing.subcategory}
                                        </Badge>
                                        {price && (
                                            <span className="text-xs font-medium text-foreground">{price}</span>
                                        )}
                                    </div>
                                </div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            </div>

                            {/* Reason tags: explain WHY this provider is featured */}
                            <div className="flex flex-wrap gap-x-3 gap-y-1 pl-[52px]">
                                {reasons.map((reason, idx) => {
                                    const ReasonIcon = reason.icon
                                    return (
                                        <span key={idx} className="flex items-center gap-1 text-[11px] text-international-orange font-medium">
                                            <ReasonIcon className="w-3 h-3" aria-hidden="true" />
                                            {reason.label}
                                        </span>
                                    )
                                })}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
