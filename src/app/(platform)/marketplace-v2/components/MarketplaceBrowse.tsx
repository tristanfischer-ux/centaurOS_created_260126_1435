'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { MarketplaceToolbar } from './MarketplaceToolbar'
import { MarketplaceFilterPanel } from './MarketplaceFilterPanel'
import { MarketplaceListingGrid } from './MarketplaceListingGrid'
import { MarketplaceDetailDialog } from './MarketplaceDetailDialog'
import { MarketplaceRecommendations } from './MarketplaceRecommendations'
import { MarketplaceSavedView } from './MarketplaceSavedView'
import { MarketplaceCompareView } from './MarketplaceCompareView'
import { useMarketplaceState, type MarketplaceCategory } from '../hooks/useMarketplaceState'
import { dismissRecommendation } from '@/actions/marketplace'
import { toast } from 'sonner'
import {
    LayoutGrid,
    Heart,
    Scale,
    Factory,
    X,
    ArrowRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { MarketplaceListing, MarketplaceRecommendation } from '@/actions/marketplace'
import type { FoundryContext } from '@/actions/foundry-context'

type MarketplaceTab = 'browse' | 'saved' | 'compare'

interface MarketplaceBrowseProps {
    initialListings: MarketplaceListing[]
    recommendations: MarketplaceRecommendation[]
    initialSavedIds: string[]
    initialSavedListings: MarketplaceListing[]
    foundryContext?: FoundryContext
}

const TABS: { id: MarketplaceTab; label: string; icon: React.ElementType }[] = [
    { id: 'browse', label: 'Browse', icon: LayoutGrid },
    { id: 'saved', label: 'Saved', icon: Heart },
]

/**
 * Main marketplace browse component with consolidated toolbar layout.
 *
 * @description Combines category navigation, search, sort, and filters into a compact
 * toolbar to minimize the vertical distance between the page header and listing results.
 * Replaces the former stacked layout of IntentPrompt + CategoryNav + CategoryGuide +
 * SearchToolbar with a single unified MarketplaceToolbar.
 */
export function MarketplaceBrowse({
    initialListings,
    recommendations: initialRecommendations,
    initialSavedIds,
    initialSavedListings,
    foundryContext,
}: MarketplaceBrowseProps) {
    const state = useMarketplaceState({ initialListings, initialSavedIds })
    const [activeTab, setActiveTab] = useState<MarketplaceTab>('browse')
    const [compareListings, setCompareListings] = useState<MarketplaceListing[]>([])
    const [compareOrigin, setCompareOrigin] = useState<'browse' | 'saved'>('browse')

    // Handle recommendation click
    const handleApplyRecommendation = useCallback((category: MarketplaceCategory, searchTerm?: string) => {
        if (category !== 'All') {
            state.handleCategoryChange(category)
        }
        if (searchTerm) {
            state.setSearchQuery(searchTerm)
        }
        setActiveTab('browse')
    }, [state])

    // Handle recommendation dismiss
    const handleDismissRecommendation = useCallback(async (id: string) => {
        const result = await dismissRecommendation(id)
        if (result.error) {
            toast.error('Failed to dismiss')
        }
    }, [])

    // Handle intent search from recommendations gap suggestions
    const handleIntentSearch = useCallback((query: string) => {
        state.setSearchQuery(query)
    }, [state])

    // Enter compare mode from browse
    const handleCompareFromBrowse = useCallback((listings: MarketplaceListing[]) => {
        if (listings.length < 2) {
            toast.error('Select at least 2 items to compare')
            return
        }
        setCompareListings(listings)
        setCompareOrigin('browse')
        setActiveTab('compare')
    }, [])

    // Enter compare mode from saved
    const handleCompareFromSaved = useCallback((listings: MarketplaceListing[]) => {
        if (listings.length < 2) {
            toast.error('Select at least 2 items to compare')
            return
        }
        setCompareListings(listings)
        setCompareOrigin('saved')
        setActiveTab('compare')
    }, [])

    // Remove from compare
    const handleRemoveFromCompare = useCallback((id: string) => {
        setCompareListings(prev => {
            const next = prev.filter(l => l.id !== id)
            if (next.length < 2) {
                setActiveTab(compareOrigin)
                return []
            }
            return next
        })
    }, [compareOrigin])

    // Back from compare
    const handleBackFromCompare = useCallback(() => {
        setActiveTab(compareOrigin)
        setCompareListings([])
    }, [compareOrigin])

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
                        Find expert talent, products, and services to grow your business
                    </p>
                </div>
            </div>

            {/* Tab navigation */}
            <nav aria-label="Marketplace sections" className="flex items-center gap-1 border-b border-border">
                {TABS.map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id || (activeTab === 'compare' && tab.id === 'saved')
                    return (
                        <button
                            key={tab.id}
                            onClick={() => {
                                if (tab.id === 'saved' && activeTab === 'compare') {
                                    handleBackFromCompare()
                                } else {
                                    setActiveTab(tab.id)
                                }
                            }}
                            className={cn(
                                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                                isActive
                                    ? 'border-international-orange text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                            )}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            {tab.id === 'saved' && state.savedIds.size > 0 && (
                                <span className={cn(
                                    'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold',
                                    isActive
                                        ? 'bg-international-orange text-white'
                                        : 'bg-muted text-muted-foreground'
                                )}>
                                    {state.savedIds.size}
                                </span>
                            )}
                        </button>
                    )
                })}
                {activeTab === 'compare' && (
                    <div className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 border-international-orange text-foreground -mb-px">
                        <Scale className="w-4 h-4" />
                        Compare ({compareListings.length})
                    </div>
                )}
            </nav>

            {/* Browse tab content */}
            {activeTab === 'browse' && (
                <>
                    {/* AI + Gap Recommendations (compact, dismissible) */}
                    <MarketplaceRecommendations
                        recommendations={initialRecommendations}
                        onApplyRecommendation={handleApplyRecommendation}
                        onDismiss={handleDismissRecommendation}
                        foundryContext={foundryContext}
                        onSearch={handleIntentSearch}
                        onCategoryChange={state.handleCategoryChange}
                    />

                    {/* Unified toolbar: categories + search + sort + filters */}
                    <MarketplaceToolbar
                        activeCategory={state.activeCategory}
                        onCategoryChange={state.handleCategoryChange}
                        counts={state.categoryCounts}
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

                    {/* Technique filter banner (conditional - when arriving from Techniques Explorer) */}
                    {state.activeTechnique && (
                        <Card className="bg-gradient-to-r from-international-orange/5 to-background border-international-orange/20">
                            <CardContent className="py-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-international-orange/10 flex items-center justify-center shrink-0">
                                        <Factory className="h-4 w-4 text-international-orange" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">
                                            Showing suppliers for{' '}
                                            <Badge variant="secondary" className="text-xs">
                                                {state.activeTechnique.name}
                                            </Badge>
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {state.filteredListings.length === 0
                                                ? 'No exact matches found yet — browse all suppliers or submit an RFQ.'
                                                : `${state.filteredListings.length} supplier${state.filteredListings.length === 1 ? '' : 's'} found`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button
                                            asChild
                                            variant="outline"
                                            size="sm"
                                            className="text-xs border-international-orange/30 text-international-orange hover:bg-international-orange/5"
                                        >
                                            <Link href={`/inspiration?tab=techniques`}>
                                                <ArrowRight className="h-3 w-3 mr-1 rotate-180" />
                                                Back to Techniques
                                            </Link>
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={state.clearTechniqueFilter}
                                            className="text-xs"
                                        >
                                            <X className="h-3 w-3 mr-1" />
                                            Clear
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Filter panel - auto-shown when category selected */}
                    {state.showFilters && (
                        <MarketplaceFilterPanel
                            subcategories={state.availableSubcategories}
                            selectedSubcategories={state.selectedSubcategories}
                            onToggleSubcategory={state.toggleSubcategory}
                            activeCategory={state.activeCategory}
                            onClear={() => {
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
                        onCompare={handleCompareFromBrowse}
                        hasActiveFilters={state.hasActiveFilters}
                        onClearFilters={state.clearFilters}
                    />
                </>
            )}

            {/* Saved tab content */}
            {activeTab === 'saved' && (
                <MarketplaceSavedView
                    initialSavedListings={initialSavedListings}
                    onCompare={handleCompareFromSaved}
                    onViewDetail={state.setSelectedListing}
                />
            )}

            {/* Compare tab content */}
            {activeTab === 'compare' && compareListings.length >= 2 && (
                <MarketplaceCompareView
                    listings={compareListings}
                    savedIds={state.savedIds}
                    onSaveToggle={state.toggleSaved}
                    onBack={handleBackFromCompare}
                    onRemove={handleRemoveFromCompare}
                />
            )}

            {/* Detail dialog (shared across all tabs) */}
            <MarketplaceDetailDialog
                listing={state.selectedListing}
                onClose={() => state.setSelectedListing(null)}
            />
        </div>
    )
}
