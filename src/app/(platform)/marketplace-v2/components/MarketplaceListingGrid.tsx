'use client'

import { MarketCardV2 } from './MarketCardV2'
import { EmptyState } from '@/components/ui/empty-state'
import { Search, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MarketplaceListing } from '@/actions/marketplace'

interface MarketplaceListingGridProps {
    listings: MarketplaceListing[]
    savedIds: Set<string>
    onSaveToggle: (id: string) => void
    onViewDetail: (listing: MarketplaceListing) => void
    hasActiveFilters: boolean
    onClearFilters: () => void
}

export function MarketplaceListingGrid({
    listings,
    savedIds,
    onSaveToggle,
    onViewDetail,
    hasActiveFilters,
    onClearFilters,
}: MarketplaceListingGridProps) {
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {listings.map((listing) => (
                <MarketCardV2
                    key={listing.id}
                    listing={listing}
                    isSaved={savedIds.has(listing.id)}
                    onSaveToggle={onSaveToggle}
                    onViewDetail={onViewDetail}
                />
            ))}
        </div>
    )
}
