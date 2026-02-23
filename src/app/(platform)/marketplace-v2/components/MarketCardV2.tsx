'use client'

import { memo, useState, useCallback, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn, getInitials } from '@/lib/utils'
import { safeParseAttributes, safeStringArray } from '@/lib/marketplace-utils'
import {
    getCategoryBadgeClasses,
    getAvatarGradient,
    type MarketplaceCategory,
} from '@/lib/marketplace-colors'
import {
    ShieldCheck,
    Star,
    Clock,
    Heart,
    ArrowRight,
    Bot,
    Sparkles,
    BarChart3,
    Zap,
    MapPin,
    Users,
    Scale,
} from 'lucide-react'
import { saveMarketplaceListing, unsaveMarketplaceListing } from '@/actions/marketplace'
import { toast } from 'sonner'
import { ActOnThisButton } from '@/components/smart/act-on-this-button'
import type { MarketplaceListing } from '@/actions/marketplace'

interface MarketCardV2Props {
    listing: MarketplaceListing
    isSaved: boolean
    isSelectedForCompare?: boolean
    onSaveToggle: (id: string) => void
    onViewDetail: (listing: MarketplaceListing) => void
    onToggleCompare?: (id: string) => void
}

/** Get icon for AI subcategories */
function getAIIcon(subcategory: string): React.ComponentType<{ className?: string }> {
    switch (subcategory) {
        case 'Agent': return Bot
        case 'Assistant': return Sparkles
        case 'Analyzer': return BarChart3
        case 'Automation': return Zap
        default: return Bot
    }
}

/** Get primary action label based on category */
function getCTALabel(category: string): string {
    switch (category) {
        case 'People': return 'View Profile'
        case 'Products': return 'Get Quote'
        case 'Services': return 'Learn More'
        case 'AI': return 'Try It'
        default: return 'View Details'
    }
}

/** Extract display price from attributes, stripping any embedded rate period (e.g. "/day") */
function getDisplayPrice(attrs: Record<string, unknown>): { amount: string; period: string | null } | null {
    const rawValue = attrs.rate || attrs.cost || attrs.price || attrs.day_rate || null
    if (!rawValue) return null
    const raw = String(rawValue)
    const periodMatch = raw.match(/\/(day|month|hr|hour|week|year)$/i)
    const amount = periodMatch ? raw.slice(0, periodMatch.index) : raw
    const period = periodMatch ? periodMatch[1].toLowerCase() : null
    return { amount, period }
}

/** Extract rating data */
function getRating(attrs: Record<string, unknown>): { average: number; count: number } | null {
    const avg = attrs.rating_average as number | undefined
    const count = attrs.total_reviews as number | undefined
    if (avg && avg > 0) return { average: avg, count: count || 0 }
    return null
}

/** Extract response time */
function getResponseTime(attrs: Record<string, unknown>): string | null {
    const hours = attrs.response_time_hours as number | undefined
    if (!hours) return null
    if (hours < 1) return 'Under 1h'
    if (hours <= 2) return '~2h'
    if (hours <= 24) return `~${hours}h`
    return `~${Math.ceil(hours / 24)}d`
}

/** Extract availability info */
function getAvailability(attrs: Record<string, unknown>): string | null {
    const available = attrs.available_slots as number | undefined
    const maxSlots = attrs.max_concurrent_orders as number | undefined
    if (available !== undefined && available <= 3 && maxSlots) {
        return `${available} slot${available === 1 ? '' : 's'} left`
    }
    if (attrs.availability === 'Available Now') return 'Available Now'
    return null
}

export const MarketCardV2 = memo(function MarketCardV2({
    listing,
    isSaved,
    isSelectedForCompare = false,
    onSaveToggle,
    onViewDetail,
    onToggleCompare,
}: MarketCardV2Props) {
    const [isSaving, setIsSaving] = useState(false)
    const [localSaved, setLocalSaved] = useState(isSaved)

    // Sync local state when parent prop changes (e.g. after save/unsave from another component)
    useEffect(() => { setLocalSaved(isSaved) }, [isSaved])

    const attrs = safeParseAttributes(listing.attributes)
    const isAI = listing.category === 'AI'
    const AIIcon = isAI ? getAIIcon(listing.subcategory) : null
    const initials = getInitials(listing.title)
    const gradient = getAvatarGradient(listing.category as MarketplaceCategory, listing.title)
    const price = getDisplayPrice(attrs)
    const rating = getRating(attrs)
    const responseTime = getResponseTime(attrs)
    const availability = getAvailability(attrs)
    const tags = safeStringArray(attrs.skills || attrs.expertise || attrs.integrations || attrs.certifications).slice(0, 3)
    const location = attrs.location as string | undefined
    const headline = attrs.headline as string | undefined
    const hiredCount = attrs.total_bookings as number | undefined

    const handleSave = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsSaving(true)
        const newState = !localSaved
        setLocalSaved(newState) // Optimistic

        try {
            const result = newState
                ? await saveMarketplaceListing(listing.id)
                : await unsaveMarketplaceListing(listing.id)

            if (result.error) {
                setLocalSaved(!newState) // Revert
                toast.error(result.error)
            } else {
                onSaveToggle(listing.id)
                toast.success(newState ? 'Saved to favorites' : 'Removed from favorites')
            }
        } catch {
            setLocalSaved(!newState)
            toast.error('Failed to update')
        } finally {
            setIsSaving(false)
        }
    }, [listing.id, localSaved, onSaveToggle])

    return (
        <Card
            className={cn(
                'group relative flex flex-col border shadow-sm overflow-hidden bg-background cursor-pointer',
                'hover:shadow-lg hover:-translate-y-0.5 hover:border-muted-foreground/20',
                'transition-all duration-200 ease-out',
                isSelectedForCompare && 'ring-2 ring-international-orange/50 border-international-orange/30'
            )}
            onClick={() => onViewDetail(listing)}
        >
            {/* Action buttons - top right */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
                {/* Compare button */}
                {onToggleCompare && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onToggleCompare(listing.id)
                        }}
                        className={cn(
                            'min-w-[44px] min-h-[44px] w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200',
                            isSelectedForCompare
                                ? 'bg-international-orange text-white shadow-md'
                                : 'bg-background/90 text-muted-foreground opacity-0 group-hover:opacity-100 shadow-sm border'
                        )}
                        aria-label={isSelectedForCompare ? 'Remove from comparison' : 'Add to comparison'}
                    >
                        <Scale className={cn('w-4 h-4', isSelectedForCompare && 'fill-current')} />
                    </button>
                )}
                {/* Save button */}
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={cn(
                        'min-w-[44px] min-h-[44px] w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200',
                        localSaved
                            ? 'bg-destructive text-destructive-foreground shadow-md'
                            : 'bg-background/90 text-muted-foreground opacity-0 group-hover:opacity-100 shadow-sm border'
                    )}
                    aria-label={localSaved ? 'Remove from saved' : 'Save for later'}
                >
                    <Heart className={cn('w-4 h-4', localSaved && 'fill-current')} />
                </button>
            </div>

            <CardContent className="flex flex-col flex-1 p-5">
                {/* Top section: Avatar + Meta */}
                <div className="flex gap-3 mb-3">
                    {/* Avatar */}
                    <div className={cn(
                        'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-semibold text-sm shrink-0 shadow-sm',
                        gradient
                    )}>
                        {isAI && AIIcon ? (
                            <AIIcon className="w-6 h-6" />
                        ) : (
                            initials
                        )}
                    </div>

                    <div className="flex-1 min-w-0 pr-8">
                        {/* Category badge */}
                        <div className="flex items-center gap-1.5 mb-1">
                            <Badge
                                variant="secondary"
                                className={cn(
                                    'uppercase text-[10px] tracking-wider font-semibold border-0 shrink-0',
                                    getCategoryBadgeClasses(listing.category as MarketplaceCategory)
                                )}
                            >
                                {listing.subcategory}
                            </Badge>
                            {listing.is_verified && (
                                <ShieldCheck className="w-3.5 h-3.5 text-status-success shrink-0" aria-label="Verified" />
                            )}
                        </div>

                        {/* Title */}
                        <h3 className="text-base font-bold tracking-tight text-foreground line-clamp-1">
                            {listing.title}
                        </h3>
                    </div>
                </div>

                {/* Headline / Description */}
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                    {headline || listing.description}
                </p>

                {/* Tags */}
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs font-normal">
                                {tag}
                            </Badge>
                        ))}
                    </div>
                )}

                {/* Social proof row: Rating + Response time + Location */}
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-4">
                    {rating && (
                        <div className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" aria-hidden="true" />
                            <span className="font-medium text-foreground">{rating.average.toFixed(1)}</span>
                            <span>({rating.count})</span>
                        </div>
                    )}
                    {hiredCount && hiredCount > 0 && (
                        <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Hired {hiredCount}x</span>
                        </div>
                    )}
                    {responseTime && (
                        <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Responds {responseTime}</span>
                        </div>
                    )}
                    {location && (
                        <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                            <span className="truncate max-w-[120px]">{location}</span>
                        </div>
                    )}
                </div>

                {/* Spacer to push footer to bottom */}
                <div className="flex-1" />

                {/* Footer: Price + CTA + Availability */}
                <div className="flex items-center justify-between pt-3 border-t border-muted">
                    <div>
                        {price ? (
                            <span>
                                <span className="text-lg font-bold text-foreground">
                                    {price.amount.startsWith('£') || price.amount.startsWith('$') || price.amount.startsWith('€')
                                        ? price.amount
                                        : `£${price.amount}`}
                                </span>
                                {price.period && (
                                    <span className="text-xs text-muted-foreground ml-0.5">/{price.period}</span>
                                )}
                            </span>
                        ) : (
                            <span className="text-sm text-muted-foreground">Request pricing</span>
                        )}
                        {availability && (
                            <p className="text-xs text-status-warning font-medium mt-0.5">
                                {availability}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5">
                        <div onClick={(e) => e.stopPropagation()}>
                            <ActOnThisButton
                                context={{
                                    source: 'marketplace',
                                    entityTitle: listing.title,
                                    entityDescription: listing.description || undefined,
                                }}
                                variant="subtle"
                                label="Act"
                            />
                        </div>
                        <Button
                            size="sm"
                            variant="default"
                            className="gap-1.5 shrink-0"
                            onClick={(e) => {
                                e.stopPropagation()
                                onViewDetail(listing)
                            }}
                        >
                            {getCTALabel(listing.category)}
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
})
