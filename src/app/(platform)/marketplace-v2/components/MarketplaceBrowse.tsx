'use client'

import { useCallback } from 'react'
import { MarketplaceCategoryNav } from './MarketplaceCategoryNav'
import { MarketplaceSearchToolbar } from './MarketplaceSearchToolbar'
import { MarketplaceFilterPanel } from './MarketplaceFilterPanel'
import { MarketplaceListingGrid } from './MarketplaceListingGrid'
import { MarketplaceDetailDialog } from './MarketplaceDetailDialog'
import { MarketplaceRecommendations } from './MarketplaceRecommendations'
import { FeaturedBanner } from './FeaturedBanner'
import { useMarketplaceState, type MarketplaceCategory } from '../hooks/useMarketplaceState'
import { dismissRecommendation } from '@/actions/marketplace'
import { toast } from 'sonner'
import type { MarketplaceListing, MarketplaceRecommendation } from '@/actions/marketplace'

interface MarketplaceBrowseProps {
    initialListings: MarketplaceListing[]
    recommendations: MarketplaceRecommendation[]
    initialSavedIds: string[]
}

export function MarketplaceBrowse({
    initialListings,
    recommendations: initialRecommendations,
    initialSavedIds,
}: MarketplaceBrowseProps) {
    const state = useMarketplaceState({ initialListings, initialSavedIds })

    // Featured listings = verified listings, limit 4
    const featuredListings = initialListings
        .filter(l => l.is_verified)
        .slice(0, 4)

    // Handle recommendation click
    const handleApplyRecommendation = useCallback((category: MarketplaceCategory, searchTerm?: string) => {
        if (category !== 'All') {
            state.handleCategoryChange(category)
        }
        if (searchTerm) {
            state.setSearchQuery(searchTerm)
        }
    }, [state])

    // Handle recommendation dismiss
    const handleDismissRecommendation = useCallback(async (id: string) => {
        const result = await dismissRecommendation(id)
        if (result.error) {
            toast.error('Failed to dismiss')
        }
    }, [])

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-muted">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                            Marketplace
                        </h1>
                    </div>
                    <p className="text-muted-foreground text-sm ml-4">
                        Find expert talent, products, services, and AI tools to grow your business
                    </p>
                </div>
            </div>

            {/* AI Recommendations */}
            <MarketplaceRecommendations
                recommendations={initialRecommendations}
                onApplyRecommendation={handleApplyRecommendation}
                onDismiss={handleDismissRecommendation}
            />

            {/* Featured banner - only when no filters active */}
            {!state.hasActiveFilters && featuredListings.length > 0 && state.activeCategory === 'All' && (
                <FeaturedBanner
                    listings={featuredListings}
                    onViewDetail={state.setSelectedListing}
                />
            )}

            {/* Category navigation */}
            <MarketplaceCategoryNav
                activeCategory={state.activeCategory}
                onCategoryChange={state.handleCategoryChange}
                counts={state.categoryCounts}
            />

            {/* Search + Sort + Filters */}
            <MarketplaceSearchToolbar
                searchQuery={state.searchQuery}
                onSearchChange={state.setSearchQuery}
                sortBy={state.sortBy}
                onSortChange={state.setSortBy}
                showFilters={state.showFilters}
                onToggleFilters={() => state.setShowFilters(!state.showFilters)}
                hasActiveFilters={state.hasActiveFilters}
                onClearAll={state.clearFilters}
                resultCount={state.filteredListings.length}
            />

            {/* Filter panel (collapsible) */}
            {state.showFilters && (
                <MarketplaceFilterPanel
                    subcategories={state.availableSubcategories}
                    selectedSubcategories={state.selectedSubcategories}
                    onToggleSubcategory={state.toggleSubcategory}
                    onClear={() => {
                        // Clear just subcategory filters
                        state.availableSubcategories.forEach(sub => {
                            if (state.selectedSubcategories.has(sub)) {
                                state.toggleSubcategory(sub)
                            }
                        })
                    }}
                />
            )}

            {/* Listing grid */}
            <MarketplaceListingGrid
                listings={state.filteredListings}
                savedIds={state.savedIds}
                onSaveToggle={state.toggleSaved}
                onViewDetail={state.setSelectedListing}
                hasActiveFilters={state.hasActiveFilters}
                onClearFilters={state.clearFilters}
            />

            {/* Detail dialog */}
            <MarketplaceDetailDialog
                listing={state.selectedListing}
                onClose={() => state.setSelectedListing(null)}
            />
        </div>
    )
}
