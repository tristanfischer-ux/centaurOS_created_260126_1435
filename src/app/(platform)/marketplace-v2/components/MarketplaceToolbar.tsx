'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Search,
    X,
    SlidersHorizontal,
    LayoutGrid,
    Users,
    Package,
    Wrench,
    Sparkles,
    Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SORT_OPTIONS, type SortOption, type MarketplaceCategory } from '../hooks/useMarketplaceState'
import { REGION_OPTIONS, type MarketplaceRegion } from '@/lib/marketplace-utils'
import type { AdvancedFilters } from '@/actions/marketplace'

/**
 * Category pill configuration with icons and active colors.
 *
 * @description Maps each marketplace category to its icon and active visual style.
 */
const CATEGORY_CONFIG: Record<MarketplaceCategory, {
    icon: React.ComponentType<{ className?: string }>
    activeClasses: string
}> = {
    All: { icon: LayoutGrid, activeClasses: 'bg-foreground text-background' },
    People: { icon: Users, activeClasses: 'bg-international-orange text-white' },
    Products: { icon: Package, activeClasses: 'bg-secondary-foreground text-background' },
    Services: { icon: Wrench, activeClasses: 'bg-electric-blue text-white' },
}

/** Quick-search example prompts shown beneath the search input */
const EXAMPLE_PROMPTS = [
    'I need a fractional CFO',
    'Help with patent filing',
    'Someone to build my MVP',
    'Marketing strategy consultant',
]

interface MarketplaceToolbarProps {
    /** Current active marketplace category */
    activeCategory: MarketplaceCategory
    /** Called when user selects a category */
    onCategoryChange: (category: MarketplaceCategory) => void
    /** Counts per category for badge display */
    counts: Record<string, number>
    /** Current search query */
    searchQuery: string
    /** Called when search query changes */
    onSearchChange: (query: string) => void
    /** Current sort option */
    sortBy: SortOption
    /** Called when sort changes */
    onSortChange: (sort: SortOption) => void
    /** Whether the filter panel is visible */
    showFilters: boolean
    /** Toggle filter panel visibility */
    onToggleFilters: () => void
    /** Whether any filters are currently active */
    hasActiveFilters: boolean
    /** Clear all active filters */
    onClearAll: () => void
    /** Number of results currently loaded (for "Showing X of Y") */
    resultCount: number
    /** Total number of results from server (optional; when set, shows "Showing X of Y") */
    totalCount?: number
    /** Callback when user clicks "Interpret with AI" (natural language search). */
    onAISearchClick?: () => void
    /** True while AI search is in progress. */
    isAISearchLoading?: boolean
    /** When set, show "AI interpreted" badge with this text. */
    aiInterpretation?: string | null
    /** Clear the AI interpretation badge. */
    onClearAIInterpretation?: () => void
    /**
     * Which categories to display as pills. When only one category is
     * provided the pill row is hidden entirely (no point showing a single pill).
     * Defaults to all categories.
     */
    visibleCategories?: { id: MarketplaceCategory; label: string; icon: string }[]
    /** Currently selected region filter. */
    selectedRegion?: MarketplaceRegion
    /** Called when user changes the region filter. */
    onRegionChange?: (region: MarketplaceRegion) => void
    /** Number of active filters (shown as badge count on Filters button). */
    activeFilterCount?: number
    /** Current advanced filters, for rendering removable chips. */
    advancedFilters?: AdvancedFilters
    /** Remove a specific advanced filter by key. */
    onRemoveAdvancedFilter?: (key: keyof AdvancedFilters) => void
    /** Update a specific advanced filter (used for removing individual values from array filters). */
    onUpdateAdvancedFilter?: <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => void
}

/**
 * Unified marketplace toolbar combining category navigation, search, sort, and filters.
 *
 * @description Replaces the separate MarketplaceCategoryNav and MarketplaceSearchToolbar
 * components with a single compact row. On desktop, categories sit on the left with
 * search/sort/filters on the right. On mobile, they stack vertically.
 */
export function MarketplaceToolbar({
    activeCategory,
    onCategoryChange,
    counts,
    searchQuery,
    onSearchChange,
    sortBy,
    onSortChange,
    showFilters,
    onToggleFilters,
    hasActiveFilters,
    onClearAll,
    resultCount,
    totalCount,
    onAISearchClick,
    isAISearchLoading = false,
    aiInterpretation = null,
    onClearAIInterpretation,
    visibleCategories,
    selectedRegion = 'All Regions',
    onRegionChange,
    activeFilterCount = 0,
    advancedFilters,
    onRemoveAdvancedFilter,
    onUpdateAdvancedFilter,
}: MarketplaceToolbarProps) {
    const [showSuggestions, setShowSuggestions] = useState(false)
    const searchRef = useRef<HTMLInputElement>(null)

    // Derive pill list from visibleCategories or fall back to default
    const categories: MarketplaceCategory[] = visibleCategories
        ? visibleCategories.map(c => c.id)
        : ['People', 'Products', 'Services', 'All']

    // Hide the pill row when there's only a single category (nothing to toggle)
    const showCategoryPills = categories.length > 1

    // Show suggestion chips when search is focused and empty
    const handleFocus = useCallback(() => {
        if (!searchQuery.trim()) {
            setShowSuggestions(true)
        }
    }, [searchQuery])

    // Hide suggestions after a short delay (allows click to register)
    const handleBlur = useCallback(() => {
        setTimeout(() => setShowSuggestions(false), 200)
    }, [])

    // Hide suggestions when user types
    useEffect(() => {
        if (searchQuery.trim()) {
            setShowSuggestions(false)
        }
    }, [searchQuery])

    const handleSuggestionClick = useCallback((prompt: string) => {
        onSearchChange(prompt)
        setShowSuggestions(false)
    }, [onSearchChange])

    return (
        <div className="space-y-3">
            {/* Row 1: Category pills (hidden when only one category) */}
            {showCategoryPills && (
                <nav aria-label="Marketplace categories" className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    {categories.map((cat) => {
                        const config = CATEGORY_CONFIG[cat]
                        const Icon = config.icon
                        const isActive = activeCategory === cat
                        const count = counts[cat] || 0

                        return (
                            <button
                                key={cat}
                                onClick={() => onCategoryChange(cat)}
                                className={cn(
                                    'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium',
                                    'transition-all duration-200 whitespace-nowrap shrink-0',
                                    'min-h-[44px]',
                                    isActive
                                        ? config.activeClasses
                                        : 'bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground'
                                )}
                                aria-pressed={isActive}
                                aria-label={(`${cat === 'All' ? 'All categories' : cat} (${count})`) as string}
                            >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                                <span>{cat}</span>
                                <span className={cn(
                                    'text-xs px-1.5 py-0.5 rounded-full min-w-[24px] text-center',
                                    isActive
                                        ? 'bg-white/20'
                                        : 'bg-background'
                                )}>
                                    {count}
                                </span>
                            </button>
                        )
                    })}
                </nav>
            )}

            {/* Row 2: Search + Sort + Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Search input with suggestion chips + AI interpret button */}
                <div className="relative flex-1 max-w-xl flex flex-col gap-1.5">
                    <div className="relative flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            <Input
                                ref={searchRef}
                                value={searchQuery}
                                onChange={(e) => onSearchChange(e.target.value)}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                placeholder="Search by name, skill, service, or keyword..."
                                className="pl-10 pr-10"
                                aria-label="Search marketplace"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => onSearchChange('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center -mr-3"
                                    aria-label="Clear search"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {onAISearchClick && searchQuery.trim().length >= 8 && (
                            <Button
                                type="button"
                                variant="secondary"
                                size="default"
                                className="shrink-0 gap-1.5 min-h-[40px]"
                                onClick={onAISearchClick}
                                disabled={isAISearchLoading}
                                aria-label="Interpret search with AI"
                            >
                                {isAISearchLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Sparkles className="h-4 w-4" />
                                )}
                                <span className="hidden sm:inline">Interpret with AI</span>
                            </Button>
                        )}
                    </div>
                    {aiInterpretation && onClearAIInterpretation && (
                        <div className="flex items-start gap-2 text-xs">
                            <Badge variant="secondary" className="gap-1.5 py-1 px-2 font-normal text-muted-foreground shrink-0">
                                <Sparkles className="h-3 w-3" />
                                AI interpreted
                            </Badge>
                            <p className="text-muted-foreground line-clamp-2 flex-1 min-w-0">{aiInterpretation}</p>
                            <button
                                type="button"
                                onClick={onClearAIInterpretation}
                                className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 rounded min-h-[44px] min-w-[44px] flex items-center justify-center"
                                aria-label="Clear AI interpretation"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}

                    {/* Quick suggestion chips (shown on focus when empty) */}
                    {showSuggestions && !searchQuery.trim() && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg p-2 z-10 animate-in fade-in slide-in-from-top-1 duration-150">
                            <p className="text-[11px] text-muted-foreground mb-1.5 px-1">Try searching for:</p>
                            <div className="flex flex-wrap gap-1.5">
                                {EXAMPLE_PROMPTS.map(prompt => (
                                    <button
                                        key={prompt}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => handleSuggestionClick(prompt)}
                                        className="text-[11px] px-2.5 py-1.5 rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Region + Sort + Filter buttons */}
                <div className="flex items-center gap-2">
                    {onRegionChange && (
                        <Select value={selectedRegion} onValueChange={(val) => onRegionChange(val as MarketplaceRegion)}>
                            <SelectTrigger className="w-[140px]" aria-label="Filter by region">
                                <SelectValue placeholder="Region" />
                            </SelectTrigger>
                            <SelectContent>
                                {REGION_OPTIONS.map((region) => (
                                    <SelectItem key={region} value={region}>
                                        {region}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    <Select value={sortBy} onValueChange={(val) => onSortChange(val as SortOption)}>
                        <SelectTrigger className="w-[160px]" aria-label="Sort listings">
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            {SORT_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        variant="secondary"
                        onClick={onToggleFilters}
                        className={cn(showFilters && 'bg-foreground text-background hover:bg-foreground/90')}
                        aria-label={showFilters ? 'Hide filters' : 'Show filters'}
                        aria-expanded={showFilters}
                    >
                        <SlidersHorizontal className="h-4 w-4 mr-2" />
                        Filters
                        {activeFilterCount > 0 && (
                            <Badge className="ml-2 h-5 min-w-[20px] p-0 flex items-center justify-center text-[10px] bg-international-orange text-white border-0">
                                {activeFilterCount}
                            </Badge>
                        )}
                    </Button>
                </div>
            </div>

            {/* Active filter chips (shown when filters applied but panel may be closed) */}
            {advancedFilters && onRemoveAdvancedFilter && activeFilterCount > 0 && !showFilters && (
                <div className="flex flex-wrap gap-1.5">
                    {advancedFilters.verifiedOnly && (
                        <FilterChip label="Verified" onRemove={() => onRemoveAdvancedFilter('verifiedOnly')} />
                    )}
                    {advancedFilters.minRating != null && (
                        <FilterChip label={`${advancedFilters.minRating}+ stars`} onRemove={() => onRemoveAdvancedFilter('minRating')} />
                    )}
                    {advancedFilters.minExperience != null && (
                        <FilterChip label={`${advancedFilters.minExperience}+ years`} onRemove={() => onRemoveAdvancedFilter('minExperience')} />
                    )}
                    {advancedFilters.location && (
                        <FilterChip label={advancedFilters.location} onRemove={() => onRemoveAdvancedFilter('location')} />
                    )}
                    {advancedFilters.availability && (
                        <FilterChip label={advancedFilters.availability} onRemove={() => onRemoveAdvancedFilter('availability')} />
                    )}
                    {advancedFilters.minRate != null && (
                        <FilterChip label={`Min $${advancedFilters.minRate}`} onRemove={() => onRemoveAdvancedFilter('minRate')} />
                    )}
                    {advancedFilters.maxRate != null && (
                        <FilterChip label={`Max $${advancedFilters.maxRate}`} onRemove={() => onRemoveAdvancedFilter('maxRate')} />
                    )}
                    {advancedFilters.skills?.map((skill) => (
                        <FilterChip key={skill} label={skill} onRemove={() => {
                            const next = (advancedFilters.skills ?? []).filter(s => s !== skill)
                            if (next.length === 0) {
                                onRemoveAdvancedFilter('skills')
                            } else {
                                onRemoveAdvancedFilter('skills')
                            }
                        }} />
                    ))}
                    {advancedFilters.companyTypes?.map((type) => (
                        <FilterChip key={`ct-${type}`} label={type} onRemove={() => {
                            const next = (advancedFilters.companyTypes ?? []).filter(t => t !== type)
                            if (next.length === 0) {
                                onRemoveAdvancedFilter('companyTypes')
                            } else if (onUpdateAdvancedFilter) {
                                onUpdateAdvancedFilter('companyTypes', next)
                            }
                        }} />
                    ))}
                    {advancedFilters.companySizes?.map((size) => (
                        <FilterChip key={`cs-${size}`} label={`Size: ${size}`} onRemove={() => {
                            const next = (advancedFilters.companySizes ?? []).filter(s => s !== size)
                            if (next.length === 0) {
                                onRemoveAdvancedFilter('companySizes')
                            } else if (onUpdateAdvancedFilter) {
                                onUpdateAdvancedFilter('companySizes', next)
                            }
                        }} />
                    ))}
                </div>
            )}

            {/* Results count + clear */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    {totalCount != null && totalCount > 0 ? (
                        <>
                            Showing <span className="font-medium text-foreground">{resultCount}</span> of{' '}
                            <span className="font-medium text-foreground">{totalCount}</span> listings
                        </>
                    ) : (
                        <>
                            <span className="font-medium text-foreground">{resultCount}</span>{' '}
                            {resultCount === 1 ? 'result' : 'results'}
                        </>
                    )}
                </p>
                {hasActiveFilters && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClearAll}
                        className="h-8 text-xs text-muted-foreground"
                    >
                        <X className="h-3 w-3 mr-1" />
                        Clear all filters
                    </Button>
                )}
            </div>
        </div>
    )
}

/** Small removable chip for an active filter. */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border">
            {label}
            <button
                onClick={onRemove}
                className="ml-0.5 rounded-full hover:bg-muted p-0.5 transition-colors min-h-[24px] min-w-[24px] flex items-center justify-center"
                aria-label={`Remove ${label} filter`}
            >
                <X className="h-3 w-3" />
            </button>
        </span>
    )
}
