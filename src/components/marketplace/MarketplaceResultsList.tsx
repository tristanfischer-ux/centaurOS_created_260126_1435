'use client'

import { memo } from 'react'
import { MarketplaceListing } from '@/actions/marketplace'
import { MarketCard } from './market-card'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { Store, ShieldCheck, Briefcase, MapPin, Clock, GitCompareArrows } from 'lucide-react'

interface MarketplaceResultsListProps {
    items: MarketplaceListing[]
    viewMode: 'grid' | 'list'
    selectedIds: Set<string>
    onToggleSelect: (id: string) => void
    hasActiveFilters: boolean
    onClearFilters: () => void
    getResultsLabel: () => string
}

/**
 * Renders the marketplace results in either grid or list view.
 * Memoized for performance with large result sets.
 */
export const MarketplaceResultsList = memo(function MarketplaceResultsList({
    items,
    viewMode,
    selectedIds,
    onToggleSelect,
    hasActiveFilters,
    onClearFilters,
    getResultsLabel,
}: MarketplaceResultsListProps) {
    if (items.length === 0) {
        return (
            <div className="col-span-full bg-muted/50 rounded-xl">
                <EmptyState
                    icon={<Store className="h-12 w-12" />}
                    title={hasActiveFilters ? "No items match your filters" : "No listings found in this category yet"}
                    description={hasActiveFilters ? "Try adjusting your filters or search terms." : "Check back later or browse other categories."}
                    action={hasActiveFilters ? (
                        <Button variant="secondary" onClick={onClearFilters}>Clear filters</Button>
                    ) : undefined}
                />
            </div>
        )
    }

    if (viewMode === 'grid') {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
                {items.map(item => (
                    <MarketCard
                        key={item.id}
                        listing={item}
                        isSelected={selectedIds.has(item.id)}
                        onToggleSelect={onToggleSelect}
                    />
                ))}
            </div>
        )
    }

    // List view
    return (
        <div className="space-y-3 animate-in fade-in duration-500">
            {items.map(item => {
                const attrs = item.attributes || {}
                const primaryMetric = attrs.rate || attrs.cost || attrs.price || null
                return (
                    <Card key={item.id} className="group relative p-4 border-slate-200 hover:border-orange-300 hover:shadow-md transition-all">
                        {/* Compare button - hover */}
                        <button
                            onClick={() => onToggleSelect(item.id)}
                            className={cn(
                                "absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                                selectedIds.has(item.id)
                                    ? "bg-orange-500 text-white shadow-md"
                                    : "bg-white/90 text-slate-600 shadow-md border border-slate-200 opacity-0 group-hover:opacity-100"
                            )}
                            title={selectedIds.has(item.id) ? "Remove from comparison" : "Add to comparison"}
                        >
                            <GitCompareArrows className="w-4 h-4" />
                        </button>
                        
                        <div className="flex items-start gap-4">
                            {/* Main content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                                                {item.subcategory}
                                            </Badge>
                                            {item.is_verified && (
                                                <ShieldCheck className="w-4 h-4 text-emerald-600" aria-label="Verified" />
                                            )}
                                        </div>
                                        <h3 className="font-semibold text-foreground truncate">{item.title}</h3>
                                        {attrs.role && (
                                            <p className="text-sm text-muted-foreground">{attrs.role}</p>
                                        )}
                                    </div>
                                    
                                    {/* Price + CTA */}
                                    <div className="text-right shrink-0 flex items-center gap-3">
                                        {primaryMetric && (
                                            <p className="font-bold text-foreground">{primaryMetric}</p>
                                        )}
                                        <Button size="sm" variant="default" asChild>
                                            <a href={`/marketplace/${item.id}`}>View</a>
                                        </Button>
                                    </div>
                                </div>
                                
                                {/* Description */}
                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                    {item.description}
                                </p>
                                
                                {/* Meta row */}
                                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                                    {attrs.years_experience && (
                                        <span className="flex items-center gap-1">
                                            <Briefcase className="w-3 h-3" aria-hidden="true" />
                                            {attrs.years_experience} years
                                        </span>
                                    )}
                                    {attrs.location && (
                                        <span className="flex items-center gap-1">
                                            <MapPin className="w-3 h-3" aria-hidden="true" />
                                            {attrs.location}
                                        </span>
                                    )}
                                    {attrs.lead_time && (
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" aria-hidden="true" />
                                            {attrs.lead_time}
                                        </span>
                                    )}
                                    {(attrs.skills || attrs.expertise) && (
                                        <div className="flex gap-1 flex-wrap">
                                            {(attrs.skills || attrs.expertise || []).slice(0, 3).map((skill: string, i: number) => (
                                                <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                                                    {skill}
                                                </span>
                                            ))}
                                            {(attrs.skills || attrs.expertise || []).length > 3 && (
                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                                                    +{(attrs.skills || attrs.expertise).length - 3}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Card>
                )
            })}
        </div>
    )
})

export default MarketplaceResultsList
