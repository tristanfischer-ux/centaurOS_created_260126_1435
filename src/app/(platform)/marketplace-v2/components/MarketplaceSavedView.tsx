'use client'

import { useState, useCallback, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn, getInitials } from '@/lib/utils'
import { safeParseAttributes } from '@/lib/marketplace-utils'
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
    MapPin,
    Users,
    Scale,
    Trash2,
    Bot,
    Sparkles,
    BarChart3,
    Zap,
    Loader2,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { unsaveMarketplaceListing, getSavedMarketplaceListings } from '@/actions/marketplace'
import { toast } from 'sonner'
import type { MarketplaceListing } from '@/actions/marketplace'

interface MarketplaceSavedViewProps {
    initialSavedListings: MarketplaceListing[]
    onCompare: (listings: MarketplaceListing[]) => void
    onViewDetail: (listing: MarketplaceListing) => void
}

function getAIIcon(subcategory: string): React.ComponentType<{ className?: string }> {
    switch (subcategory) {
        case 'Agent': return Bot
        case 'Assistant': return Sparkles
        case 'Analyzer': return BarChart3
        case 'Automation': return Zap
        default: return Bot
    }
}

function getDisplayPrice(attrs: Record<string, unknown>): string | null {
    return (attrs.rate || attrs.cost || attrs.price || attrs.day_rate || null) as string | null
}

function getRating(attrs: Record<string, unknown>): { average: number; count: number } | null {
    const avg = attrs.rating_average as number | undefined
    const count = attrs.total_reviews as number | undefined
    if (avg && avg > 0) return { average: avg, count: count || 0 }
    return null
}

function getResponseTime(attrs: Record<string, unknown>): string | null {
    const hours = attrs.response_time_hours as number | undefined
    if (!hours) return null
    if (hours < 1) return 'Under 1h'
    if (hours <= 2) return '~2h'
    if (hours <= 24) return `~${hours}h`
    return `~${Math.ceil(hours / 24)}d`
}

export function MarketplaceSavedView({
    initialSavedListings,
    onCompare,
    onViewDetail,
}: MarketplaceSavedViewProps) {
    const [listings, setListings] = useState<MarketplaceListing[]>(initialSavedListings)
    const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set())
    const [removingId, setRemovingId] = useState<string | null>(null)
    const [isRefreshing, setIsRefreshing] = useState(false)

    // Refresh saved listings
    const refreshListings = useCallback(async () => {
        setIsRefreshing(true)
        try {
            const result = await getSavedMarketplaceListings()
            if (result.data) {
                setListings(result.data)
            }
        } catch {
            toast.error('Failed to refresh saved listings')
        } finally {
            setIsRefreshing(false)
        }
    }, [])

    // Sync when initial data changes
    useEffect(() => {
        setListings(initialSavedListings)
    }, [initialSavedListings])

    const toggleCompareSelection = useCallback((id: string) => {
        setSelectedForCompare(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                if (next.size >= 4) {
                    toast.error('Compare up to 4 items at a time')
                    return prev
                }
                next.add(id)
            }
            return next
        })
    }, [])

    const handleRemove = useCallback(async (id: string) => {
        setRemovingId(id)
        try {
            const result = await unsaveMarketplaceListing(id)
            if (result.error) {
                toast.error(result.error)
            } else {
                setListings(prev => prev.filter(l => l.id !== id))
                setSelectedForCompare(prev => {
                    const next = new Set(prev)
                    next.delete(id)
                    return next
                })
                toast.success('Removed from saved')
            }
        } catch {
            toast.error('Failed to remove')
        } finally {
            setRemovingId(null)
        }
    }, [])

    const handleCompare = useCallback(() => {
        const selected = listings.filter(l => selectedForCompare.has(l.id))
        onCompare(selected)
    }, [listings, selectedForCompare, onCompare])

    if (listings.length === 0) {
        return (
            <EmptyState
                icon={<Heart className="h-12 w-12 text-muted-foreground" />}
                title="No saved listings yet"
                description="Save people, products, services, and AI tools from the Browse tab by clicking the heart icon. Your favourites will appear here for easy comparison."
            />
        )
    }

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                        {listings.length} saved item{listings.length !== 1 ? 's' : ''}
                    </p>
                    {selectedForCompare.size > 0 && (
                        <Badge variant="secondary" className="gap-1">
                            <Scale className="w-3 h-3" />
                            {selectedForCompare.size} selected
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={refreshListings}
                        disabled={isRefreshing}
                    >
                        {isRefreshing && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                        Refresh
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleCompare}
                        disabled={selectedForCompare.size < 2}
                        className="gap-1.5"
                    >
                        <Scale className="w-3.5 h-3.5" />
                        Compare ({selectedForCompare.size})
                    </Button>
                </div>
            </div>

            {/* Column headers */}
            <div className="hidden md:grid md:grid-cols-[40px_1fr_120px_100px_120px_100px_80px] gap-4 items-center px-4 py-2 bg-muted/50 rounded-lg text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span className="sr-only">Select</span>
                <span>Listing</span>
                <span>Category</span>
                <span>Price</span>
                <span>Rating</span>
                <span>Response</span>
                <span className="sr-only">Actions</span>
            </div>

            {/* List rows */}
            <div className="divide-y divide-border rounded-xl border bg-background overflow-hidden">
                {listings.map((listing) => {
                    const attrs = safeParseAttributes(listing.attributes)
                    const isAI = listing.category === 'AI'
                    const AIIcon = isAI ? getAIIcon(listing.subcategory) : null
                    const initials = getInitials(listing.title)
                    const gradient = getAvatarGradient(listing.category as MarketplaceCategory, listing.title)
                    const price = getDisplayPrice(attrs)
                    const rating = getRating(attrs)
                    const responseTime = getResponseTime(attrs)
                    const location = attrs.location as string | undefined
                    const headline = attrs.headline as string | undefined
                    const hiredCount = attrs.total_bookings as number | undefined
                    const isSelected = selectedForCompare.has(listing.id)

                    return (
                        <div
                            key={listing.id}
                            className={cn(
                                'group grid grid-cols-1 md:grid-cols-[40px_1fr_120px_100px_120px_100px_80px] gap-3 md:gap-4 items-center px-4 py-4 transition-colors',
                                'hover:bg-muted/30 cursor-pointer',
                                isSelected && 'bg-primary/5 hover:bg-primary/10'
                            )}
                            onClick={() => onViewDetail(listing)}
                        >
                            {/* Checkbox */}
                            <div
                                className="flex items-center"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleCompareSelection(listing.id)}
                                    aria-label={`Select ${listing.title} for comparison`}
                                    className="h-5 w-5"
                                />
                            </div>

                            {/* Listing info (avatar + name + description) */}
                            <div className="flex items-center gap-3 min-w-0">
                                <div className={cn(
                                    'w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-semibold text-xs shrink-0',
                                    gradient
                                )}>
                                    {isAI && AIIcon ? (
                                        <AIIcon className="w-5 h-5" />
                                    ) : (
                                        initials
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <h3 className="text-sm font-semibold text-foreground truncate">
                                            {listing.title}
                                        </h3>
                                        {listing.is_verified && (
                                            <ShieldCheck className="w-3.5 h-3.5 text-status-success shrink-0" aria-label="Verified" />
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {headline || listing.description}
                                    </p>
                                    {/* Mobile-only meta */}
                                    <div className="flex flex-wrap gap-2 mt-1.5 md:hidden text-xs text-muted-foreground">
                                        <Badge
                                            variant="secondary"
                                            className={cn(
                                                'text-[10px] uppercase tracking-wider font-semibold border-0',
                                                getCategoryBadgeClasses(listing.category as MarketplaceCategory)
                                            )}
                                        >
                                            {listing.subcategory}
                                        </Badge>
                                        {price && <span className="font-semibold text-foreground">£{price}</span>}
                                        {rating && (
                                            <span className="flex items-center gap-0.5">
                                                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                                {rating.average.toFixed(1)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Category - desktop only */}
                            <div className="hidden md:flex items-center gap-1.5">
                                <Badge
                                    variant="secondary"
                                    className={cn(
                                        'text-[10px] uppercase tracking-wider font-semibold border-0',
                                        getCategoryBadgeClasses(listing.category as MarketplaceCategory)
                                    )}
                                >
                                    {listing.subcategory}
                                </Badge>
                            </div>

                            {/* Price - desktop only */}
                            <div className="hidden md:block">
                                {price ? (
                                    <span className="text-sm font-semibold text-foreground">£{price}</span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">On request</span>
                                )}
                            </div>

                            {/* Rating - desktop only */}
                            <div className="hidden md:flex items-center gap-1.5">
                                {rating ? (
                                    <>
                                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" aria-hidden="true" />
                                        <span className="text-sm font-medium text-foreground">{rating.average.toFixed(1)}</span>
                                        <span className="text-xs text-muted-foreground">({rating.count})</span>
                                    </>
                                ) : (
                                    <span className="text-xs text-muted-foreground">No reviews</span>
                                )}
                            </div>

                            {/* Response time - desktop only */}
                            <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
                                {responseTime ? (
                                    <>
                                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                        {responseTime}
                                    </>
                                ) : (
                                    <>
                                        {location ? (
                                            <>
                                                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                                                <span className="truncate">{location}</span>
                                            </>
                                        ) : hiredCount ? (
                                            <>
                                                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                                                {hiredCount}x hired
                                            </>
                                        ) : (
                                            <span>—</span>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Actions */}
                            <div
                                className="flex items-center justify-end gap-1"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleRemove(listing.id)}
                                    disabled={removingId === listing.id}
                                    aria-label={`Remove ${listing.title} from saved`}
                                >
                                    {removingId === listing.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
