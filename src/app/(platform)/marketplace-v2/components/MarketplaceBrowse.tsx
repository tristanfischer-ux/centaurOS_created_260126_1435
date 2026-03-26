'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { MarketplaceToolbar } from './MarketplaceToolbar'
import { MarketplaceFilterPanel } from './MarketplaceFilterPanel'
import { MarketplaceListingGrid } from './MarketplaceListingGrid'
import { MarketplaceDetailDialog } from './MarketplaceDetailDialog'
import { MarketplaceRecommendations } from './MarketplaceRecommendations'
import { MarketplaceSavedView } from './MarketplaceSavedView'
import { MarketplaceCompareView } from './MarketplaceCompareView'
import { MarketplaceStatsSection, type StatsLabels } from './MarketplaceStatsSection'
import { SaveSearchDialog } from './SaveSearchDialog'
import { useMarketplaceState, type MarketplaceCategory, type ContentCategory } from '../hooks/useMarketplaceState'
import { dismissRecommendation } from '@/actions/marketplace'
import type { MarketplaceStats } from '@/actions/marketplace-stats'
import { toast } from 'sonner'
import {
    LayoutGrid,
    Heart,
    Scale,
    Factory,
    X,
    ArrowRight,
    BarChart3,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { PageTour } from '@/components/guidance/page-tour'
import { StageSpecialistCard } from '@/components/cad/stage-specialist-card'
import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { generateMarketplaceInsights } from '@/actions/specialist-page-insights'
import type { AgentInsight } from '@/actions/agent-insights'
import type { MarketplaceListing, MarketplaceRecommendation } from '@/actions/marketplace'
import type { FoundryContext } from '@/actions/foundry-context'

type MarketplaceTab = 'browse' | 'saved' | 'compare'

interface MarketplaceBrowseProps {
    initialListings: MarketplaceListing[]
    /** Total count from server (for "Showing X of Y"). */
    initialTotalCount?: number
    /** Whether more pages exist (for infinite scroll). */
    initialHasMore?: boolean
    /** Server-side per-category totals (e.g. { Products: 25, Services: 13 }). */
    initialCategoryCounts?: Record<string, number>
    recommendations: MarketplaceRecommendation[]
    initialSavedIds: string[]
    initialSavedListings: MarketplaceListing[]
    foundryContext?: FoundryContext
    /** Restrict visible categories. Omit to show all (People, Products, Services). */
    allowedCategories?: ContentCategory[]
    /** Page title displayed in the header. Defaults to "Marketplace". */
    pageTitle?: string
    /** Page subtitle displayed below the title. */
    pageSubtitle?: string
    /** Aggregate stats for the analytics section. */
    stats?: MarketplaceStats
    /** Custom labels/icons for the stats section. */
    statsLabels?: StatsLabels
    /** Whether the stats section starts expanded. Defaults to true. */
    statsDefaultExpanded?: boolean
    /** Optional transform applied to listings after each server fetch (e.g. People trust enrichment). */
    postFetchTransform?: (listings: MarketplaceListing[]) => Promise<MarketplaceListing[]>
    /** Hide specialist briefing cards (e.g. when a parent page provides its own specialist). */
    hideSpecialistBriefing?: boolean
}

const TABS: { id: MarketplaceTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
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
    initialTotalCount = 0,
    initialHasMore = false,
    initialCategoryCounts,
    recommendations: initialRecommendations,
    initialSavedIds,
    initialSavedListings,
    foundryContext,
    allowedCategories,
    pageTitle = 'Marketplace',
    pageSubtitle = 'Find expert talent, products, and services to grow your business',
    stats,
    statsLabels,
    statsDefaultExpanded,
    postFetchTransform,
    hideSpecialistBriefing = false,
}: MarketplaceBrowseProps) {
    const state = useMarketplaceState({
        initialListings,
        initialTotalCount,
        initialHasMore,
        initialCategoryCounts,
        initialSavedIds,
        allowedCategories,
        postFetchTransform,
    })
    const [activeTab, setActiveTab] = useState<MarketplaceTab>('browse')
    const [compareListings, setCompareListings] = useState<MarketplaceListing[]>([])
    const [compareOrigin, setCompareOrigin] = useState<'browse' | 'saved'>('browse')

    // Chase's marketplace insights
    const [chaseInsights, setChaseInsights] = useState<AgentInsight[]>([])
    const [chaseBriefing, setChaseBriefing] = useState<string | null>(null)
    const [chaseBriefingLoading, setChaseBriefingLoading] = useState(true)
    const chaseFetched = useRef(false)

    // Shared compare selection state (lifted from MarketplaceListingGrid)
    const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set())

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

    const clearCompareSelection = useCallback(() => {
        setSelectedForCompare(new Set())
    }, [])

    // FLOW: Chase's entry briefing — generated once on load (skipped when parent provides its own specialist)
    useEffect(() => {
        if (hideSpecialistBriefing) {
            setChaseBriefingLoading(false)
            return
        }
        // SECURITY: Prevent duplicate AI calls from React Strict Mode double-mount
        if (chaseFetched.current) return
        chaseFetched.current = true
        setChaseBriefingLoading(true)
        generateMarketplaceInsights({
            totalListings: initialListings.length,
            activeCategory: state.activeCategory,
            compareCount: 0,
            savedCount: initialSavedIds.length,
            hasActiveCadProject: false,
        }).then((result) => {
            if (Array.isArray(result) && result.length > 0) {
                setChaseBriefing(result[0].body)
                setChaseInsights(result.slice(1))
            }
            setChaseBriefingLoading(false)
        }).catch(() => setChaseBriefingLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

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

    // Track recommendations in local state so dismissals update the UI
    const [localRecommendations, setLocalRecommendations] = useState(initialRecommendations)

    // Handle recommendation dismiss — remove from local state after server action
    const handleDismissRecommendation = useCallback(async (id: string) => {
        const result = await dismissRecommendation(id)
        if (result.error) {
            toast.error('Failed to dismiss')
        } else {
            setLocalRecommendations(prev => prev.filter(r => r.id !== id))
        }
    }, [])

    // Handle intent search from recommendations gap suggestions
    const handleIntentSearch = useCallback((query: string) => {
        state.setSearchQuery(query)
    }, [state])

    const [showSaveSearchDialog, setShowSaveSearchDialog] = useState(false)
    const [isAISearchLoading, setIsAISearchLoading] = useState(false)

    // Store state methods in refs so callbacks don't depend on the `state` object
    // (which is recreated every render, causing unnecessary effect re-runs).
    const applyAIFiltersRef = useRef(state.applyAIFilters)
    applyAIFiltersRef.current = state.applyAIFilters

    /** Fire an AI search for the given query string. Callable from button or auto-trigger. */
    const executeAISearch = useCallback(async (query: string) => {
        if (!query) return
        setIsAISearchLoading(true)
        try {
            const res = await fetch('/api/marketplace/ai-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
            })
            const data = await res.json()
            if (!res.ok) {
                toast.error(data.error ?? 'AI search failed')
                return
            }
            if (data.success && data.filters) {
                const { category, subcategory } = data.filters
                const explanation = typeof data.explanation === 'string' ? data.explanation : undefined
                applyAIFiltersRef.current({
                    category: category ?? undefined,
                    subcategory: subcategory ?? undefined,
                    explanation,
                })
            } else {
                toast.error('Could not interpret your search')
            }
        } catch {
            toast.error('AI search failed')
        } finally {
            setIsAISearchLoading(false)
        }
    }, []) // stable — no dependencies

    /** Manual AI search button handler — reads live searchQuery. */
    const handleAISearchClick = useCallback(() => {
        executeAISearch(state.searchQuery.trim())
    }, [state.searchQuery, executeAISearch])

    // Auto-detect natural language queries and trigger AI search.
    // Uses refs for loading/interpretation checks to keep dependency list stable.
    const lastAutoTriggeredRef = useRef<string>('')
    const lastAutoTriggeredTimeRef = useRef<number>(0)
    const isAISearchLoadingRef = useRef(isAISearchLoading)
    isAISearchLoadingRef.current = isAISearchLoading

    useEffect(() => {
        const query = state.debouncedQuery.trim()
        if (!query || isAISearchLoadingRef.current || state.aiInterpretation) return
        if (query === lastAutoTriggeredRef.current) return

        // M2 fix: 5-second cooldown between auto-triggers to prevent cost amplification
        const now = Date.now()
        if (now - lastAutoTriggeredTimeRef.current < 5000) return

        // Heuristic: 4+ words OR starts with multi-word intent phrases
        const INTENT_PHRASES = /^(i need|find me|looking for|who can|show me|get me|search for|help me)/i
        const wordCount = query.split(/\s+/).length
        const isNaturalLanguage = wordCount >= 4 || INTENT_PHRASES.test(query)

        if (isNaturalLanguage) {
            lastAutoTriggeredRef.current = query
            lastAutoTriggeredTimeRef.current = now
            executeAISearch(query) // H3 fix: uses debouncedQuery directly, not state.searchQuery
        }
    }, [state.debouncedQuery, state.aiInterpretation, executeAISearch]) // stable deps

    // Enter compare mode from browse (reads from shared selection state)
    const handleCompareFromBrowse = useCallback(() => {
        const selected = state.filteredListings.filter(l => selectedForCompare.has(l.id))
        if (selected.length < 2) {
            toast.error('Select at least 2 items to compare')
            return
        }
        setCompareListings(selected)
        setCompareOrigin('browse')
        setActiveTab('compare')
    }, [state.filteredListings, selectedForCompare])

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

    // Chart click handlers (Fix 5: extracted to useCallback)
    const { companyTypes: selectedTypes, companySizes: selectedSizes } = state.advancedFilters
    const { updateAdvancedFilter, toggleSubRegion } = state

    const handleCompanyTypeClick = useCallback((type: string) => {
        const current = selectedTypes ?? []
        const next = current.includes(type) ? current.filter(t => t !== type) : [...current, type]
        updateAdvancedFilter('companyTypes', next.length > 0 ? next : undefined)
    }, [selectedTypes, updateAdvancedFilter])

    const handleCompanySizeClick = useCallback((size: string) => {
        const current = selectedSizes ?? []
        const next = current.includes(size) ? current.filter(s => s !== size) : [...current, size]
        updateAdvancedFilter('companySizes', next.length > 0 ? next : undefined)
    }, [selectedSizes, updateAdvancedFilter])

    const handleRegionClick = useCallback((region: string) => {
        toggleSubRegion(region)
    }, [toggleSubRegion])

    // New chart click handlers for Phase 2 charts
    const selectedIndustries = state.advancedFilters.industries
    const selectedCertifications = state.advancedFilters.certifications

    const handleIndustryClick = useCallback((industry: string) => {
        const current = selectedIndustries ?? []
        const next = current.includes(industry) ? current.filter(i => i !== industry) : [...current, industry]
        updateAdvancedFilter('industries', next.length > 0 ? next : undefined)
    }, [selectedIndustries, updateAdvancedFilter])

    const handleCertificationClick = useCallback((certification: string) => {
        const current = selectedCertifications ?? []
        const next = current.includes(certification) ? current.filter(c => c !== certification) : [...current, certification]
        updateAdvancedFilter('certifications', next.length > 0 ? next : undefined)
    }, [selectedCertifications, updateAdvancedFilter])

    const handleSubcategoryChartClick = useCallback((subcategory: string) => {
        state.toggleSubcategory(subcategory)
    }, [state])

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-muted">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                            {pageTitle}
                        </h1>
                    </div>
                    <p className="text-muted-foreground text-sm ml-4">
                        {pageSubtitle}
                    </p>
                </div>
            </div>

            {/* Chase's marketplace briefing (hidden when parent provides its own specialist) */}
            {!hideSpecialistBriefing && (
                <StageSpecialistCard
                    specialistId="vp-supply-chain"
                    variant="entry"
                    briefing={chaseBriefing}
                    isLoading={chaseBriefingLoading}
                    stageName="Marketplace"
                />
            )}

            {/* Chase's proactive insights */}
            {!hideSpecialistBriefing && chaseInsights.length > 0 && (
                <div className="space-y-3">
                    {chaseInsights.map((insight) => (
                        <SpecialistInsightCard
                            key={insight.id}
                            insight={insight}
                            onDismiss={() => setChaseInsights(prev => prev.filter(i => i.id !== insight.id))}
                            compact
                        />
                    ))}
                </div>
            )}

            {/* Tab navigation */}
            <nav aria-label="Marketplace sections" data-tour="marketplace-tabs" className="flex items-center gap-1 border-b border-border">
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
                                'flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium border-b-2 -mb-px transition-colors',
                                isActive
                                    ? 'border-international-orange text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                            )}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <Icon className="w-4 h-4" aria-hidden />
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
                    {/* Analytics section */}
                    {stats ? (
                        <MarketplaceStatsSection
                            stats={stats}
                            labels={statsLabels}
                            defaultExpanded={statsDefaultExpanded}
                            selectedCompanyTypes={state.advancedFilters.companyTypes}
                            selectedCompanySizes={state.advancedFilters.companySizes}
                            selectedSubRegions={state.selectedSubRegions}
                            selectedIndustries={state.advancedFilters.industries}
                            selectedCertifications={state.advancedFilters.certifications}
                            selectedSubcategories={Array.from(state.selectedSubcategories)}
                            onCompanyTypeClick={handleCompanyTypeClick}
                            onCompanySizeClick={handleCompanySizeClick}
                            onRegionClick={handleRegionClick}
                            onIndustryClick={handleIndustryClick}
                            onCertificationClick={handleCertificationClick}
                            onSubcategoryChartClick={handleSubcategoryChartClick}
                            hasActiveFilters={
                              (state.advancedFilters.companyTypes?.length ?? 0) > 0 ||
                              (state.advancedFilters.companySizes?.length ?? 0) > 0 ||
                              (state.advancedFilters.industries?.length ?? 0) > 0 ||
                              (state.advancedFilters.certifications?.length ?? 0) > 0 ||
                              state.selectedSubRegions.length > 0 ||
                              state.selectedSubcategories.size > 0
                            }
                            onClearFilters={state.clearFilters}
                        />
                    ) : (
                        <Card className="rounded-xl border shadow-sm">
                            <CardContent className="py-6">
                                <div className="flex items-center gap-3 text-muted-foreground">
                                    <BarChart3 className="h-5 w-5" />
                                    <p className="text-sm">Marketplace insights are temporarily unavailable. Browse listings below.</p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* AI + Gap Recommendations (compact, dismissible) */}
                    <MarketplaceRecommendations
                        recommendations={localRecommendations}
                        onApplyRecommendation={handleApplyRecommendation}
                        onDismiss={handleDismissRecommendation}
                        foundryContext={foundryContext}
                        onSearch={handleIntentSearch}
                        onCategoryChange={state.handleCategoryChange}
                    />

                    {/* Unified toolbar: categories + search + sort + filters */}
                    <div data-tour="marketplace-toolbar">
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
                        totalCount={state.totalCount}
                        onAISearchClick={handleAISearchClick}
                        isAISearchLoading={isAISearchLoading}
                        aiInterpretation={state.aiInterpretation}
                        onClearAIInterpretation={state.clearAIInterpretation}
                        visibleCategories={state.visibleCategories}
                        selectedRegion={state.selectedRegion}
                        onRegionChange={state.setSelectedRegion}
                        selectedSubRegions={state.selectedSubRegions}
                        onToggleSubRegion={state.toggleSubRegion}
                        activeFilterCount={state.activeFilterCount}
                        advancedFilters={state.advancedFilters}
                        onRemoveAdvancedFilter={state.removeAdvancedFilter}
                        onUpdateAdvancedFilter={state.updateAdvancedFilter}
                        onSaveSearch={() => setShowSaveSearchDialog(true)}
                    />
                    </div>

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
                                            <Link href={`/learn?tab=techniques`}>
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
                            advancedFilters={state.advancedFilters}
                            onAdvancedFilterChange={state.updateAdvancedFilter}
                            availableIndustries={stats?.industryCounts?.map(i => i.name) ?? []}
                            availableCertifications={stats?.certificationCounts?.map(c => c.name) ?? []}
                        />
                    )}

                    {/* Listing grid */}
                    <div data-tour="marketplace-grid">
                    <MarketplaceListingGrid
                        listings={state.filteredListings}
                        savedIds={state.savedIds}
                        onSaveToggle={state.toggleSaved}
                        onViewDetail={state.setSelectedListing}
                        onCompare={handleCompareFromBrowse}
                        hasActiveFilters={state.hasActiveFilters}
                        onClearFilters={state.clearFilters}
                        selectedForCompare={selectedForCompare}
                        onToggleCompare={toggleCompareSelection}
                        onClearCompareSelection={clearCompareSelection}
                        hasMore={state.hasMore}
                        isLoadingMore={state.isLoadingMore}
                        onLoadMore={state.loadMore}
                    />
                    </div>
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
                isSelectedForCompare={state.selectedListing ? selectedForCompare.has(state.selectedListing.id) : false}
                onToggleCompare={toggleCompareSelection}
                compareCount={selectedForCompare.size}
                onViewDetail={state.setSelectedListing}
            />

            {/* Save Search dialog */}
            <SaveSearchDialog
                open={showSaveSearchDialog}
                onClose={() => setShowSaveSearchDialog(false)}
                searchQuery={state.searchQuery}
                filters={{
                    category: state.activeCategory,
                    subcategories: Array.from(state.selectedSubcategories),
                    ...state.advancedFilters,
                }}
            />

            <PageTour page="marketplace" />
        </div>
    )
}
