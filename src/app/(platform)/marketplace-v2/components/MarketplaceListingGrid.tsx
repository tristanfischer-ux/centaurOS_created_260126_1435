'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { MarketCardV2 } from './MarketCardV2'
import { PersonCard } from '@/components/marketplace/person-card'
import type { EnrichedPersonListing } from '@/actions/people-marketplace'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ViewToggle } from '@/components/ui/view-toggle'
import { cn, getInitials } from '@/lib/utils'
import { safeParseAttributes, safeStringArray } from '@/lib/marketplace-utils'
import {
    getCategoryBadgeClasses,
    getAvatarGradient,
    type MarketplaceCategory,
} from '@/lib/marketplace-colors'
import {
    LayoutGrid,
    List,
    ShieldCheck,
    Star,
    Clock,
    MapPin,
    Heart,
    ArrowRight,
    Bot,
    Sparkles,
    BarChart3,
    Zap,
    Users,
    Scale,
    X,
} from 'lucide-react'
import { saveMarketplaceListing, unsaveMarketplaceListing } from '@/actions/marketplace'
import { toast } from 'sonner'
import { VerificationBadge } from '@/components/marketplace/VerificationBadge'
import type { MarketplaceListing } from '@/actions/marketplace'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2 } from 'lucide-react'

interface MarketplaceListingGridProps {
    listings: MarketplaceListing[]
    savedIds: Set<string>
    onSaveToggle: (id: string) => void
    onViewDetail: (listing: MarketplaceListing) => void
    /** Triggers compare view — parent builds the listing list from shared state. */
    onCompare: () => void
    hasActiveFilters: boolean
    onClearFilters: () => void
    /** Shared compare selection state (lifted to parent). */
    selectedForCompare: Set<string>
    /** Toggle a listing in/out of the compare selection. */
    onToggleCompare: (id: string) => void
    /** Clear all compare selections. */
    onClearCompareSelection: () => void
    /** Whether more results are available (for infinite scroll). */
    hasMore?: boolean
    /** True while the next page is loading. */
    isLoadingMore?: boolean
    /** Called when user requests more results (e.g. Load more button or scroll). */
    onLoadMore?: () => void
}

type ViewMode = 'cards' | 'list'

function getAIIcon(subcategory: string): React.ComponentType<{ className?: string }> {
    switch (subcategory) {
        case 'Agent': return Bot
        case 'Assistant': return Sparkles
        case 'Analyzer': return BarChart3
        case 'Automation': return Zap
        default: return Bot
    }
}

function getDisplayPrice(attrs: Record<string, unknown>): { amount: string; period: string | null } | null {
    const rawValue = attrs.rate || attrs.cost || attrs.price || attrs.day_rate || null
    if (!rawValue) return null
    const raw = String(rawValue)
    const periodMatch = raw.match(/\/(day|month|hr|hour|week|year)$/i)
    const amount = periodMatch ? raw.slice(0, periodMatch.index) : raw
    const period = periodMatch ? periodMatch[1].toLowerCase() : null
    return { amount, period }
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

/** Compact list row for two-column list view */
function ListRow({
    listing,
    isSaved,
    isSelectedForCompare,
    onSaveToggle,
    onViewDetail,
    onToggleCompare,
}: {
    listing: MarketplaceListing
    isSaved: boolean
    isSelectedForCompare: boolean
    onSaveToggle: (id: string) => void
    onViewDetail: (listing: MarketplaceListing) => void
    onToggleCompare: (id: string) => void
}) {
    const attrs = safeParseAttributes(listing.attributes)
    const isAI = listing.category === 'AI'
    const isPeopleEnriched = listing.category === 'People' && 'trustData' in listing
    const trust = isPeopleEnriched ? (listing as EnrichedPersonListing).trustData : null
    const AIIcon = isAI ? getAIIcon(listing.subcategory) : null
    const initials = getInitials(listing.title)
    const gradient = getAvatarGradient(listing.category as MarketplaceCategory, listing.title)
    const price = getDisplayPrice(attrs)
    // Prefer trust data ratings over attrs for enriched People listings
    const rating = trust?.averageRating && trust.averageRating > 0
        ? { average: trust.averageRating, count: trust.totalReviews }
        : getRating(attrs)
    const responseTime = getResponseTime(attrs)
    // DECISION: Prefer top-level promoted columns (from Nightshift) over attributes
    const location = listing.city && listing.country
        ? `${listing.city}, ${listing.country}`
        : listing.country || (attrs.location as string | undefined)
    const headline = attrs.headline as string | undefined
    const hiredCount = attrs.total_bookings as number | undefined
    // Show certifications from top-level column, fall back to attributes
    const certs = listing.certifications && Array.isArray(listing.certifications) && listing.certifications.length > 0
        ? (listing.certifications as string[]).slice(0, 2)
        : safeStringArray(attrs.certifications).slice(0, 2)
    const tags = certs.length > 0 ? certs : safeStringArray(attrs.skills || attrs.expertise || attrs.integrations).slice(0, 2)
    const availability = isPeopleEnriched ? (attrs.availability as string | undefined) : undefined

    const handleSave = async (e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            const result = isSaved
                ? await unsaveMarketplaceListing(listing.id)
                : await saveMarketplaceListing(listing.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                onSaveToggle(listing.id)
            }
        } catch {
            toast.error('Failed to update')
        }
    }

    return (
        <div
            className={cn(
                'group flex items-center gap-3 px-4 py-3 rounded-xl border bg-background cursor-pointer',
                'hover:shadow-md hover:border-muted-foreground/20 transition-all duration-200',
                isSelectedForCompare && 'ring-2 ring-international-orange/50 border-international-orange/30 bg-primary/5'
            )}
            onClick={() => onViewDetail(listing)}
        >
            {/* Compare toggle */}
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    onToggleCompare(listing.id)
                }}
                className={cn(
                    'min-w-[44px] min-h-[44px] w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0',
                    isSelectedForCompare
                        ? 'bg-international-orange text-white shadow-md'
                        : 'bg-muted text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100'
                )}
                aria-label={isSelectedForCompare ? 'Remove from comparison' : 'Add to comparison'}
            >
                <Scale className={cn('w-3.5 h-3.5', isSelectedForCompare && 'fill-current')} />
            </button>

            {/* Avatar */}
            <div className="relative shrink-0">
                <div className={cn(
                    'w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-semibold text-xs',
                    gradient
                )}>
                    {isAI && AIIcon ? <AIIcon className="w-5 h-5" /> : initials}
                </div>
                {/* Availability dot for enriched People */}
                {availability && (
                    <div
                        className={cn(
                            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background',
                            availability.toLowerCase().includes('full-time') || availability.toLowerCase().includes('available')
                                ? 'bg-status-success'
                                : availability.toLowerCase().includes('part') || availability.toLowerCase().includes('day')
                                    ? 'bg-status-warning'
                                    : 'bg-muted-foreground'
                        )}
                        title={availability}
                    />
                )}
            </div>

            {/* Main info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <Badge
                        variant="secondary"
                        className={cn(
                            'text-[10px] uppercase tracking-wider font-semibold border-0 shrink-0',
                            getCategoryBadgeClasses(listing.category as MarketplaceCategory)
                        )}
                    >
                        {listing.subcategory}
                    </Badge>
                    <VerificationBadge tier={listing.verification_tier} size="sm" />
                </div>
                <h3 className="text-sm font-semibold text-foreground truncate mt-0.5">
                    <Link
                        href={`/marketplace/${listing.id}`}
                        className="hover:text-international-orange transition-colors"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {listing.title}
                    </Link>
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                    {headline || listing.description}
                </p>

                {/* Tags + meta row */}
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
                    {tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px] font-normal py-0">
                            {tag}
                        </Badge>
                    ))}
                    {rating && (
                        <span className="flex items-center gap-0.5 text-xs">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="font-medium text-foreground">{rating.average.toFixed(1)}</span>
                            <span className="text-muted-foreground">({rating.count})</span>
                        </span>
                    )}
                    {trust && trust.trustedByCount > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Users className="w-3 h-3" aria-hidden="true" />
                            Trusted by {trust.trustedByCount}
                        </span>
                    )}
                    {!trust && hiredCount && hiredCount > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Users className="w-3 h-3" />
                            {hiredCount}x
                        </span>
                    )}
                    {responseTime && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {responseTime}
                        </span>
                    )}
                    {location && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate max-w-[100px]">{location}</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Price + actions */}
            <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                    {price ? (
                        <span className="text-sm">
                            {price.period && (
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">from</span>
                            )}
                            <span className="font-bold text-foreground">
                                {price.amount.startsWith('£') || price.amount.startsWith('$') || price.amount.startsWith('€')
                                    ? price.amount
                                    : `£${price.amount}`}
                            </span>
                            {price.period && (
                                <span className="text-xs text-muted-foreground ml-0.5">/{price.period}</span>
                            )}
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">Request pricing</span>
                    )}
                </div>
                <button
                    onClick={handleSave}
                    className={cn(
                        'min-w-[44px] min-h-[44px] w-8 h-8 rounded-full flex items-center justify-center transition-all',
                        isSaved
                            ? 'bg-destructive text-destructive-foreground'
                            : 'bg-muted text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100'
                    )}
                    aria-label={isSaved ? 'Remove from saved' : 'Save for later'}
                >
                    <Heart className={cn('w-3.5 h-3.5', isSaved && 'fill-current')} />
                </button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 shrink-0 hidden sm:flex"
                    asChild
                >
                    <Link
                        href={`/marketplace/${listing.id}`}
                        onClick={(e) => {
                            // Left-click without modifier: use dialog/detail view
                            if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                                e.preventDefault()
                                e.stopPropagation()
                                onViewDetail(listing)
                            } else {
                                e.stopPropagation()
                            }
                        }}
                    >
                        View
                        <ArrowRight className="w-3 h-3" />
                    </Link>
                </Button>
            </div>
        </div>
    )
}

export function MarketplaceListingGrid({
    listings,
    savedIds,
    onSaveToggle,
    onViewDetail,
    onCompare,
    hasActiveFilters,
    onClearFilters,
    selectedForCompare,
    onToggleCompare,
    onClearCompareSelection,
    hasMore = false,
    isLoadingMore = false,
    onLoadMore,
}: MarketplaceListingGridProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('cards')
    const sentinelRef = useRef<HTMLDivElement>(null)

    // Infinite scroll via IntersectionObserver
    const onLoadMoreRef = useRef(onLoadMore)
    onLoadMoreRef.current = onLoadMore
    const isLoadingMoreRef = useRef(isLoadingMore)
    isLoadingMoreRef.current = isLoadingMore
    const hasMoreRef = useRef(hasMore)
    hasMoreRef.current = hasMore

    // Track whether listings are present so the observer re-creates when
    // the component transitions from empty→populated (sentinel mounts).
    const hasListings = listings.length > 0

    useEffect(() => {
        const sentinel = sentinelRef.current
        if (!sentinel) return
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMoreRef.current && !isLoadingMoreRef.current && onLoadMoreRef.current) {
                    onLoadMoreRef.current()
                }
            },
            { rootMargin: '400px' }
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [hasListings]) // Re-run when listings appear/disappear so observer attaches to new sentinel

    // M1 fix: After a batch finishes loading, the sentinel may still be in
    // viewport but the observer won't re-fire (no intersection state change).
    // Disconnect and re-observe to force a fresh intersection check.
    const prevLoadingMore = useRef(isLoadingMore)
    useEffect(() => {
        if (prevLoadingMore.current && !isLoadingMore && hasMore) {
            // Batch just finished — re-observe sentinel to catch "still in viewport"
            const sentinel = sentinelRef.current
            if (!sentinel) { prevLoadingMore.current = isLoadingMore; return }
            const observer = new IntersectionObserver(
                (entries) => {
                    if (entries[0].isIntersecting && hasMoreRef.current && !isLoadingMoreRef.current && onLoadMoreRef.current) {
                        onLoadMoreRef.current()
                    }
                    observer.disconnect()
                },
                { rootMargin: '400px' }
            )
            observer.observe(sentinel)
        }
        prevLoadingMore.current = isLoadingMore
    }, [isLoadingMore, hasMore])

    if (listings.length === 0) {
        return (
            <EmptyState
                title={hasActiveFilters ? 'No matching results' : 'No listings available'}
                description={
                    hasActiveFilters
                        ? 'Try adjusting your filters or search terms to find what you need.'
                        : 'Check back soon - new providers and services are added regularly.'
                }
                action={
                    hasActiveFilters ? (
                        <Button variant="secondary" onClick={onClearFilters}>
                            Clear all filters
                        </Button>
                    ) : undefined
                }
            />
        )
    }

    return (
        <div className="space-y-4">
            {/* View mode toggle + compare selection info */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {selectedForCompare.size > 0 && (
                        <>
                            <Badge variant="secondary" className="gap-1.5 text-xs">
                                <Scale className="w-3 h-3" />
                                {selectedForCompare.size} selected
                            </Badge>
                            <Button
                                size="sm"
                                onClick={onCompare}
                                disabled={selectedForCompare.size < 2}
                                className="gap-1.5 h-7 text-xs"
                            >
                                <Scale className="w-3 h-3" />
                                Compare
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={onClearCompareSelection}
                                className="gap-1 h-7 text-xs text-muted-foreground"
                            >
                                <X className="w-3 h-3" />
                                Clear
                            </Button>
                        </>
                    )}
                </div>
                <ViewToggle
                    options={[
                        { value: 'cards', label: 'Cards', icon: LayoutGrid, ariaLabel: 'Card view' },
                        { value: 'list', label: 'List', icon: List, ariaLabel: 'List view' },
                    ]}
                    value={viewMode}
                    onValueChange={(v) => setViewMode(v as ViewMode)}
                />
            </div>

            {/* Card view */}
            {viewMode === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {listings.map((listing) => {
                        // Use the purpose-built PersonCard for enriched People listings
                        if (listing.category === 'People' && 'trustData' in listing) {
                            return (
                                <PersonCard
                                    key={listing.id}
                                    listing={listing as EnrichedPersonListing}
                                    isSaved={savedIds.has(listing.id)}
                                    isSelectedForCompare={selectedForCompare.has(listing.id)}
                                    onSaveToggle={onSaveToggle}
                                    onViewDetail={onViewDetail}
                                    onToggleCompare={onToggleCompare}
                                />
                            )
                        }
                        return (
                            <MarketCardV2
                                key={listing.id}
                                listing={listing}
                                isSaved={savedIds.has(listing.id)}
                                isSelectedForCompare={selectedForCompare.has(listing.id)}
                                onSaveToggle={onSaveToggle}
                                onViewDetail={onViewDetail}
                                onToggleCompare={onToggleCompare}
                            />
                        )
                    })}
                </div>
            )}

            {/* Two-column list view */}
            {viewMode === 'list' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {listings.map((listing) => (
                        <ListRow
                            key={listing.id}
                            listing={listing}
                            isSaved={savedIds.has(listing.id)}
                            isSelectedForCompare={selectedForCompare.has(listing.id)}
                            onSaveToggle={onSaveToggle}
                            onViewDetail={onViewDetail}
                            onToggleCompare={onToggleCompare}
                        />
                    ))}
                </div>
            )}

            {/* Infinite scroll sentinel + loading skeletons */}
            {hasMore && (
                <div className="flex flex-col items-center gap-4 pt-4">
                    {/* Invisible sentinel observed by IntersectionObserver */}
                    <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
                    {isLoadingMore && (
                        <>
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading more…
                            </div>
                            {viewMode === 'cards' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
                                    {[1, 2, 3].map((i) => (
                                        <Skeleton key={i} className="h-72 w-full rounded-xl" />
                                    ))}
                                </div>
                            )}
                            {viewMode === 'list' && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 w-full">
                                    {[1, 2, 3, 4].map((i) => (
                                        <Skeleton key={i} className="h-24 w-full rounded-lg" />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Floating compare bar */}
            {selectedForCompare.size >= 2 && (
                <div className="sticky bottom-6 z-20 flex justify-center animate-in slide-in-from-bottom-4 fade-in duration-300">
                    <div className="flex items-center gap-4 bg-international-orange text-white px-6 py-3.5 rounded-2xl shadow-[0_8px_30px_rgba(234,88,12,0.4)]">
                        <Scale className="w-5 h-5" />
                        <span className="text-sm font-semibold">
                            {selectedForCompare.size} items selected
                        </span>
                        <Button
                            size="sm"
                            onClick={onCompare}
                            className="gap-1.5 h-9 rounded-xl bg-background text-international-orange hover:bg-muted font-semibold"
                        >
                            Compare Now
                            <ArrowRight className="w-4 h-4" />
                        </Button>
                        <button
                            onClick={onClearCompareSelection}
                            className="min-w-[44px] min-h-[44px] w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                            aria-label="Clear selection"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
