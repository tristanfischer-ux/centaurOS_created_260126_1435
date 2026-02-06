'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
    getCategoryBadgeClasses,
    getAvatarGradient,
    type MarketplaceCategory,
} from '@/lib/marketplace-colors'
import { ShieldCheck, Star, ArrowRight, Zap } from 'lucide-react'
import type { MarketplaceListing } from '@/actions/marketplace'

interface FeaturedBannerProps {
    listings: MarketplaceListing[]
    onViewDetail: (listing: MarketplaceListing) => void
}

export function FeaturedBanner({ listings, onViewDetail }: FeaturedBannerProps) {
    if (listings.length === 0) return null

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-international-orange" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">Featured</h2>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
                {listings.map((listing) => {
                    const attrs = listing.attributes || {}
                    const gradient = getAvatarGradient(listing.category as MarketplaceCategory, listing.title)
                    const price = (attrs.rate || attrs.cost || attrs.price || attrs.day_rate) as string | undefined
                    const rating = attrs.rating_average as number | undefined
                    const initials = listing.title.trim().split(/\s+/).length > 1
                        ? `${listing.title.trim().split(/\s+/)[0][0]}${listing.title.trim().split(/\s+/)[1][0]}`.toUpperCase()
                        : listing.title.substring(0, 2).toUpperCase()

                    return (
                        <button
                            key={listing.id}
                            onClick={() => onViewDetail(listing)}
                            className={cn(
                                'flex items-center gap-3 px-4 py-3 rounded-xl border bg-background',
                                'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
                                'min-w-[280px] max-w-[320px] shrink-0 snap-start text-left'
                            )}
                        >
                            {/* Mini avatar */}
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
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Badge
                                        variant="secondary"
                                        className={cn(
                                            'text-[9px] px-1.5 py-0 border-0',
                                            getCategoryBadgeClasses(listing.category as MarketplaceCategory)
                                        )}
                                    >
                                        {listing.subcategory}
                                    </Badge>
                                    {rating && (
                                        <span className="flex items-center gap-0.5">
                                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" aria-hidden="true" />
                                            {rating.toFixed(1)}
                                        </span>
                                    )}
                                    {price && (
                                        <span className="font-medium text-foreground">{price}</span>
                                    )}
                                </div>
                            </div>

                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
