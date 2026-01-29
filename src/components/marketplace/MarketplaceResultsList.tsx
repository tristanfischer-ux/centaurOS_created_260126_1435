'use client'

import { memo } from 'react'
import { MarketplaceListing } from '@/actions/marketplace'
import { MarketCard } from './market-card'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Store, ShieldCheck, Briefcase, MapPin, Clock } from 'lucide-react'

interface MarketplaceResultsListProps {
    items: MarketplaceListing[]
    viewMode: 'grid' | 'list'
    allExpanded: boolean
    selectedIds: Set<string>
    onToggleSelect: (id: string) => void
    onToggleExpandAll: () => void
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
    allExpanded,
    selectedIds,
    onToggleSelect,
    onToggleExpandAll,
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
                        <Button variant="outline" onClick={onClearFilters}>Clear filters</Button>
                    ) : undefined}
                    live
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
                        isExpanded={allExpanded}
                        onToggleExpandAll={onToggleExpandAll}
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
                return (
                    <Card key={item.id} className="p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-4">
                            {/* Checkbox */}
                            <Checkbox
                                checked={selectedIds.has(item.id)}
                                onCheckedChange={() => onToggleSelect(item.id)}
                                className="mt-1"
                                aria-label={`Select ${item.title} for comparison`}
                            />
                            
                            {/* Main content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
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
                                    
                                    {/* Key metrics */}
                                    <div className="text-right shrink-0">
                                        {attrs.rate && (
                                            <p className="font-semibold text-foreground">{attrs.rate}</p>
                                        )}
                                        {attrs.cost && (
                                            <p className="font-semibold text-foreground">{attrs.cost}</p>
                                        )}
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
                                                <span key={i} className="px-2 py-0.5 bg-muted text-muted-foreground rounded">
                                                    {skill}
                                                </span>
                                            ))}
                                            {(attrs.skills || attrs.expertise || []).length > 3 && (
                                                <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded">
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
