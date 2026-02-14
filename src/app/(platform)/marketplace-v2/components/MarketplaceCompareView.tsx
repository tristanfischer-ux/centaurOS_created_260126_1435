'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn, getInitials } from '@/lib/utils'
import {
    getCategoryBadgeClasses,
    getAvatarGradient,
    type MarketplaceCategory,
} from '@/lib/marketplace-colors'
import {
    ShieldCheck,
    Star,
    Clock,
    MapPin,
    Briefcase,
    Users,
    CalendarDays,
    ArrowLeft,
    X,
    Heart,
    Bot,
    Sparkles,
    BarChart3,
    Zap,
    CheckCircle2,
    MinusCircle,
} from 'lucide-react'
import Link from 'next/link'
import { saveMarketplaceListing, unsaveMarketplaceListing } from '@/actions/marketplace'
import { toast } from 'sonner'
import type { MarketplaceListing } from '@/actions/marketplace'
import { useMediaQuery } from '@/hooks/useMediaQuery'

interface MarketplaceCompareViewProps {
    listings: MarketplaceListing[]
    savedIds: Set<string>
    onSaveToggle: (id: string) => void
    onBack: () => void
    onRemove: (id: string) => void
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

/** Get all unique attribute keys worth comparing across listings */
function getComparisonRows(listings: MarketplaceListing[]): { key: string; label: string; icon?: React.ComponentType<{ className?: string }> }[] {
    const rows: { key: string; label: string; icon?: React.ComponentType<{ className?: string }> }[] = [
        { key: 'price', label: 'Price' },
        { key: 'rating', label: 'Rating', icon: Star },
        { key: 'reviews', label: 'Reviews' },
        { key: 'hired', label: 'Times Hired', icon: Users },
        { key: 'response', label: 'Response Time', icon: Clock },
        { key: 'location', label: 'Location', icon: MapPin },
        { key: 'experience', label: 'Experience', icon: Briefcase },
        { key: 'verified', label: 'Verified', icon: ShieldCheck },
        { key: 'availability', label: 'Availability' },
        { key: 'skills', label: 'Skills / Expertise' },
        { key: 'specialties', label: 'Specialties' },
    ]

    // Only show rows where at least one listing has data
    return rows.filter(row => {
        return listings.some(l => {
            const val = getComparisonValue(l, row.key)
            return val !== null && val !== undefined && val !== '—'
        })
    })
}

/** Extract a comparison value for a given key */
function getComparisonValue(listing: MarketplaceListing, key: string): React.ReactNode {
    const attrs = listing.attributes || {}

    switch (key) {
        case 'price': {
            const price = (attrs.rate || attrs.cost || attrs.price || attrs.day_rate) as string | undefined
            return price ? `£${price}` : '—'
        }
        case 'rating': {
            const avg = attrs.rating_average as number | undefined
            if (!avg || avg <= 0) return '—'
            return (
                <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" aria-hidden="true" />
                    <span className="font-semibold">{avg.toFixed(1)}</span>
                </div>
            )
        }
        case 'reviews': {
            const count = attrs.total_reviews as number | undefined
            return count ? `${count} reviews` : '—'
        }
        case 'hired': {
            const count = attrs.total_bookings as number | undefined
            return count ? `${count}x` : '—'
        }
        case 'response': {
            const hours = attrs.response_time_hours as number | undefined
            if (!hours) return '—'
            if (hours < 1) return 'Under 1h'
            if (hours <= 24) return `~${hours}h`
            return `~${Math.ceil(hours / 24)}d`
        }
        case 'location':
            return (attrs.location as string) || '—'
        case 'experience':
            return (attrs.experience as string) || '—'
        case 'verified':
            return listing.is_verified ? (
                <div className="flex items-center gap-1 text-status-success">
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    <span>Yes</span>
                </div>
            ) : (
                <div className="flex items-center gap-1 text-muted-foreground">
                    <MinusCircle className="w-4 h-4" aria-hidden="true" />
                    <span>No</span>
                </div>
            )
        case 'availability': {
            const available = attrs.available_slots as number | undefined
            const maxSlots = attrs.max_concurrent_orders as number | undefined
            if (available !== undefined && maxSlots) {
                return `${available}/${maxSlots} slots`
            }
            if (attrs.availability === 'Available Now') return 'Available Now'
            return '—'
        }
        case 'skills': {
            const skills: string[] = (attrs.skills || attrs.expertise || attrs.integrations || attrs.certifications || [])
            if (skills.length === 0) return '—'
            return (
                <div className="flex flex-wrap gap-1">
                    {skills.slice(0, 5).map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px]">
                            {s}
                        </Badge>
                    ))}
                    {skills.length > 5 && (
                        <span className="text-[10px] text-muted-foreground">+{skills.length - 5} more</span>
                    )}
                </div>
            )
        }
        case 'specialties': {
            const specs: string[] = (attrs.specialties || attrs.capabilities || [])
            if (specs.length === 0) return '—'
            return (
                <div className="flex flex-wrap gap-1">
                    {specs.slice(0, 4).map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px]">
                            {s}
                        </Badge>
                    ))}
                    {specs.length > 4 && (
                        <span className="text-[10px] text-muted-foreground">+{specs.length - 4} more</span>
                    )}
                </div>
            )
        }
        default:
            return '—'
    }
}

/** Find the "best" value for highlighting (highest rating, lowest price, etc.) */
function getBestIndex(listings: MarketplaceListing[], key: string): number | null {
    if (listings.length < 2) return null

    switch (key) {
        case 'rating': {
            let bestIdx = -1
            let bestVal = -1
            listings.forEach((l, i) => {
                const val = (l.attributes?.rating_average as number) || 0
                if (val > bestVal) { bestVal = val; bestIdx = i }
            })
            return bestVal > 0 ? bestIdx : null
        }
        case 'price': {
            let bestIdx = -1
            let bestVal = Infinity
            listings.forEach((l, i) => {
                const attrs = l.attributes || {}
                const priceStr = (attrs.rate || attrs.cost || attrs.price || attrs.day_rate || '') as string
                const match = String(priceStr).match(/[\d,]+/)
                if (match) {
                    const num = parseInt(match[0].replace(/,/g, ''), 10)
                    if (num < bestVal) { bestVal = num; bestIdx = i }
                }
            })
            return bestVal < Infinity ? bestIdx : null
        }
        case 'response': {
            let bestIdx = -1
            let bestVal = Infinity
            listings.forEach((l, i) => {
                const val = (l.attributes?.response_time_hours as number) || Infinity
                if (val < bestVal) { bestVal = val; bestIdx = i }
            })
            return bestVal < Infinity ? bestIdx : null
        }
        case 'hired': {
            let bestIdx = -1
            let bestVal = -1
            listings.forEach((l, i) => {
                const val = (l.attributes?.total_bookings as number) || 0
                if (val > bestVal) { bestVal = val; bestIdx = i }
            })
            return bestVal > 0 ? bestIdx : null
        }
        default:
            return null
    }
}

export function MarketplaceCompareView({
    listings,
    savedIds,
    onSaveToggle,
    onBack,
    onRemove,
}: MarketplaceCompareViewProps) {
    const isMediumUp = useMediaQuery('(min-width: 768px)')

    const handleSave = async (listingId: string) => {
        const isSaved = savedIds.has(listingId)
        try {
            const result = isSaved
                ? await unsaveMarketplaceListing(listingId)
                : await saveMarketplaceListing(listingId)
            if (result.error) {
                toast.error(result.error)
            } else {
                onSaveToggle(listingId)
                toast.success(isSaved ? 'Removed from favourites' : 'Added to favourites')
            }
        } catch {
            toast.error('Failed to update')
        }
    }
    const rows = getComparisonRows(listings)
    const colCount = listings.length

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </Button>
                <p className="text-sm text-muted-foreground">
                    Comparing {listings.length} listing{listings.length !== 1 ? 's' : ''}
                </p>
            </div>

            {/* Comparison table / cards */}
            {isMediumUp ? (
            <div className="overflow-x-auto rounded-xl border bg-background">
                <table className="w-full min-w-[600px]" role="table" aria-label="Listing comparison">
                    <thead>
                        <tr>
                            {/* Row label column */}
                            <th className="sticky left-0 z-10 bg-muted w-[140px] min-w-[140px] p-0">
                                <span className="sr-only">Attribute</span>
                            </th>
                            {/* Listing header columns */}
                            {listings.map((listing) => {
                                const isAI = listing.category === 'AI'
                                const AIIcon = isAI ? getAIIcon(listing.subcategory) : null
                                const initials = getInitials(listing.title)
                                const gradient = getAvatarGradient(listing.category as MarketplaceCategory, listing.title)

                                return (
                                    <th
                                        key={listing.id}
                                        className="p-4 text-center border-l border-border align-bottom"
                                        style={{ width: `${Math.floor(100 / (colCount + 1))}%` }}
                                    >
                                        <div className="flex flex-col items-center gap-2 relative">
                                            {/* Save + Remove buttons */}
                                            <div className="absolute -top-1 -right-1 flex items-center gap-1">
                                                <button
                                                    onClick={() => handleSave(listing.id)}
                                                    className={cn(
                                                        'min-w-[44px] min-h-[44px] w-7 h-7 rounded-full flex items-center justify-center transition-all',
                                                        savedIds.has(listing.id)
                                                            ? 'bg-destructive text-destructive-foreground shadow-sm'
                                                            : 'bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                                                    )}
                                                    aria-label={savedIds.has(listing.id) ? 'Remove from favourites' : 'Add to favourites'}
                                                >
                                                    <Heart className={cn('w-3.5 h-3.5', savedIds.has(listing.id) && 'fill-current')} />
                                                </button>
                                                <button
                                                    onClick={() => onRemove(listing.id)}
                                                    className="min-w-[44px] min-h-[44px] w-7 h-7 rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors"
                                                    aria-label={`Remove ${listing.title} from comparison`}
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>

                                            {/* Avatar */}
                                            <div className={cn(
                                                'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-semibold text-sm shadow-sm',
                                                gradient
                                            )}>
                                                {isAI && AIIcon ? (
                                                    <AIIcon className="w-6 h-6" />
                                                ) : (
                                                    initials
                                                )}
                                            </div>

                                            {/* Category badge */}
                                            <Badge
                                                variant="secondary"
                                                className={cn(
                                                    'text-[10px] uppercase tracking-wider font-semibold border-0',
                                                    getCategoryBadgeClasses(listing.category as MarketplaceCategory)
                                                )}
                                            >
                                                {listing.subcategory}
                                            </Badge>

                                            {/* Title */}
                                            <h3 className="text-sm font-bold text-foreground text-center line-clamp-2 leading-tight">
                                                {listing.title}
                                            </h3>
                                        </div>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            const bestIdx = getBestIndex(listings, row.key)
                            return (
                                <tr key={row.key} className="border-t border-border">
                                    {/* Row label */}
                                    <td className="sticky left-0 z-10 bg-muted px-4 py-3">
                                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                            {row.icon && <row.icon className="w-3.5 h-3.5" aria-hidden="true" />}
                                            {row.label}
                                        </div>
                                    </td>
                                    {/* Value cells */}
                                    {listings.map((listing, idx) => {
                                        const value = getComparisonValue(listing, row.key)
                                        const isBest = bestIdx === idx

                                        return (
                                            <td
                                                key={listing.id}
                                                className={cn(
                                                    'px-4 py-3 text-sm text-center border-l border-border align-middle',
                                                    isBest && 'bg-status-success-light/30 font-medium'
                                                )}
                                            >
                                                <div className="flex items-center justify-center">
                                                    {value}
                                                </div>
                                            </td>
                                        )
                                    })}
                                </tr>
                            )
                        })}

                        {/* CTA row */}
                        <tr className="border-t-2 border-border">
                            <td className="sticky left-0 z-10 bg-muted px-4 py-4">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Action
                                </span>
                            </td>
                            {listings.map((listing) => (
                                <td key={listing.id} className="px-4 py-4 text-center border-l border-border">
                                    <Button size="sm" className="gap-1.5" asChild>
                                        <Link href={`/marketplace/${listing.id}/book`}>
                                            <CalendarDays className="w-3.5 h-3.5" />
                                            {listing.category === 'People' ? 'Book' :
                                             listing.category === 'Products' ? 'Quote' :
                                             listing.category === 'AI' ? 'Try' : 'Hire'}
                                        </Link>
                                    </Button>
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
            ) : (
            <div className="space-y-3">
                {listings.map((listing, idx) => {
                    const isAI = listing.category === 'AI'
                    const AIIcon = isAI ? getAIIcon(listing.subcategory) : null
                    const initials = getInitials(listing.title)
                    const gradient = getAvatarGradient(listing.category as MarketplaceCategory, listing.title)
                    return (
                        <Card key={listing.id} className="border">
                            <CardContent className="pt-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={cn(
                                            'w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-semibold text-sm shadow-sm',
                                            gradient
                                        )}>
                                            {isAI && AIIcon ? <AIIcon className="w-5 h-5" /> : initials}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-foreground truncate">{listing.title}</p>
                                            <Badge
                                                variant="secondary"
                                                className={cn(
                                                    'text-[10px] uppercase tracking-wider font-semibold border-0 mt-0.5',
                                                    getCategoryBadgeClasses(listing.category as MarketplaceCategory)
                                                )}
                                            >
                                                {listing.subcategory}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => handleSave(listing.id)}
                                            className={cn(
                                                'min-w-[44px] min-h-[44px] w-8 h-8 rounded-full flex items-center justify-center transition-all',
                                                savedIds.has(listing.id)
                                                    ? 'bg-destructive text-destructive-foreground shadow-sm'
                                                    : 'bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                                            )}
                                            aria-label={savedIds.has(listing.id) ? 'Remove from favourites' : 'Add to favourites'}
                                        >
                                            <Heart className={cn('w-4 h-4', savedIds.has(listing.id) && 'fill-current')} />
                                        </button>
                                        <button
                                            onClick={() => onRemove(listing.id)}
                                            className="min-w-[44px] min-h-[44px] w-8 h-8 rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors"
                                            aria-label={`Remove ${listing.title} from comparison`}
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {rows.map((row) => {
                                        const value = getComparisonValue(listing, row.key)
                                        const bestIdx = getBestIndex(listings, row.key)
                                        const isBest = bestIdx === idx
                                        return (
                                            <div key={`${listing.id}-${row.key}`} className={cn(
                                                'flex items-start justify-between gap-3 rounded-lg border p-2',
                                                isBest && 'bg-status-success-light/30'
                                            )}>
                                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                    {row.label}
                                                </span>
                                                <div className="text-sm text-foreground text-right min-w-0">
                                                    {value}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                <Button size="sm" className="w-full gap-1.5" asChild>
                                    <Link href={`/marketplace/${listing.id}/book`}>
                                        <CalendarDays className="w-3.5 h-3.5" />
                                        {listing.category === 'People' ? 'Book' :
                                         listing.category === 'Products' ? 'Quote' :
                                         listing.category === 'AI' ? 'Try' : 'Hire'}
                                    </Link>
                                </Button>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
            )}
        </div>
    )
}
