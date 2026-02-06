'use client'

import { useState, useCallback } from 'react'
import { MarketCardV2 } from './MarketCardV2'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
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
import type { MarketplaceListing } from '@/actions/marketplace'

interface MarketplaceListingGridProps {
    listings: MarketplaceListing[]
    savedIds: Set<string>
    onSaveToggle: (id: string) => void
    onViewDetail: (listing: MarketplaceListing) => void
    onCompare: (listings: MarketplaceListing[]) => void
    hasActiveFilters: boolean
    onClearFilters: () => void
}

type ViewMode = 'cards' | 'list'

function getAIIcon(subcategory: string): React.ElementType {
    switch (subcategory) {
        case 'Agent': return Bot
        case 'Assistant': return Sparkles
        case 'Analyzer': return BarChart3
        case 'Automation': return Zap
        default: return Bot
    }
}

function getInitials(title: string): string {
    const words = title.trim().split(/\s+/)
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase()
    return (words[0][0] + words[1][0]).toUpperCase()
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
    const attrs = listing.attributes || {}
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
    const tags: string[] = (attrs.skills || attrs.expertise || attrs.integrations || attrs.certifications || []).slice(0, 2)

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
            {/* Compare checkbox */}
            <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                <Checkbox
                    checked={isSelectedForCompare}
                    onCheckedChange={() => onToggleCompare(listing.id)}
                    aria-label={`Select ${listing.title} for comparison`}
                    className="h-4 w-4"
                />
            </div>

            {/* Avatar */}
            <div className={cn(
                'w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-semibold text-xs shrink-0',
                gradient
            )}>
                {isAI && AIIcon ? <AIIcon className="w-5 h-5" /> : initials}
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
                    {listing.is_verified && (
                        <ShieldCheck className="w-3 h-3 text-status-success shrink-0" aria-label="Verified" />
                    )}
                </div>
                <h3 className="text-sm font-semibold text-foreground truncate mt-0.5">
                    {listing.title}
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
                    {hiredCount && hiredCount > 0 && (
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
                        <span className="text-sm font-bold text-foreground">{price}</span>
                    ) : (
                        <span className="text-xs text-muted-foreground">Request pricing</span>
                    )}
                </div>
                <button
                    onClick={handleSave}
                    className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                        isSaved
                            ? 'bg-red-500 text-white'
                            : 'bg-muted text-muted-foreground opacity-0 group-hover:opacity-100'
                    )}
                    aria-label={isSaved ? 'Remove from saved' : 'Save for later'}
                >
                    <Heart className={cn('w-3.5 h-3.5', isSaved && 'fill-current')} />
                </button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 shrink-0 hidden sm:flex"
                    onClick={(e) => {
                        e.stopPropagation()
                        onViewDetail(listing)
                    }}
                >
                    View
                    <ArrowRight className="w-3 h-3" />
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
}: MarketplaceListingGridProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('cards')
    const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set())

    const toggleCompare = useCallback((id: string) => {
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

    const handleCompare = useCallback(() => {
        const selected = listings.filter(l => selectedForCompare.has(l.id))
        onCompare(selected)
    }, [listings, selectedForCompare, onCompare])

    const clearCompareSelection = useCallback(() => {
        setSelectedForCompare(new Set())
    }, [])

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
                                onClick={handleCompare}
                                disabled={selectedForCompare.size < 2}
                                className="gap-1.5 h-7 text-xs"
                            >
                                <Scale className="w-3 h-3" />
                                Compare
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={clearCompareSelection}
                                className="gap-1 h-7 text-xs text-muted-foreground"
                            >
                                <X className="w-3 h-3" />
                                Clear
                            </Button>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
                    <button
                        onClick={() => setViewMode('cards')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                            viewMode === 'cards'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                        aria-label="Card view"
                        aria-pressed={viewMode === 'cards'}
                    >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        Cards
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                            viewMode === 'list'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                        aria-label="List view"
                        aria-pressed={viewMode === 'list'}
                    >
                        <List className="w-3.5 h-3.5" />
                        List
                    </button>
                </div>
            </div>

            {/* Card view */}
            {viewMode === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {listings.map((listing) => (
                        <div key={listing.id} className="relative">
                            {/* Compare checkbox overlay on card */}
                            <div
                                className="absolute top-3 left-3 z-10"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Checkbox
                                    checked={selectedForCompare.has(listing.id)}
                                    onCheckedChange={() => toggleCompare(listing.id)}
                                    aria-label={`Select ${listing.title} for comparison`}
                                    className={cn(
                                        'h-5 w-5 border-2 bg-background/80 backdrop-blur-sm',
                                        selectedForCompare.has(listing.id) && 'border-international-orange'
                                    )}
                                />
                            </div>
                            <div className={cn(
                                'rounded-xl transition-all',
                                selectedForCompare.has(listing.id) && 'ring-2 ring-international-orange/50'
                            )}>
                                <MarketCardV2
                                    listing={listing}
                                    isSaved={savedIds.has(listing.id)}
                                    onSaveToggle={onSaveToggle}
                                    onViewDetail={onViewDetail}
                                />
                            </div>
                        </div>
                    ))}
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
                            onToggleCompare={toggleCompare}
                        />
                    ))}
                </div>
            )}

            {/* Floating compare bar */}
            {selectedForCompare.size >= 2 && (
                <div className="sticky bottom-4 z-20 flex justify-center">
                    <div className="flex items-center gap-3 bg-foreground text-background px-5 py-3 rounded-full shadow-2xl">
                        <Scale className="w-4 h-4" />
                        <span className="text-sm font-medium">
                            {selectedForCompare.size} items selected
                        </span>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleCompare}
                            className="gap-1.5 h-8 rounded-full"
                        >
                            Compare Now
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                        <button
                            onClick={clearCompareSelection}
                            className="w-6 h-6 rounded-full bg-background/20 hover:bg-background/30 flex items-center justify-center transition-colors"
                            aria-label="Clear selection"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
