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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SORT_OPTIONS, type SortOption, type MarketplaceCategory } from '../hooks/useMarketplaceState'

/**
 * Category pill configuration with icons and active colors.
 *
 * @description Maps each marketplace category to its icon and active visual style.
 */
const CATEGORY_CONFIG: Record<MarketplaceCategory, {
    icon: React.ElementType
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
    /** Total number of results matching current filters */
    resultCount: number
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
}: MarketplaceToolbarProps) {
    const [showSuggestions, setShowSuggestions] = useState(false)
    const searchRef = useRef<HTMLInputElement>(null)

    const categories: MarketplaceCategory[] = ['People', 'Products', 'Services', 'All']

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
            {/* Row 1: Category pills */}
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
                            aria-label={`${cat === 'All' ? 'All categories' : cat} (${count})`}
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

            {/* Row 2: Search + Sort + Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Search input with suggestion chips */}
                <div className="relative flex-1 max-w-xl">
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

                {/* Sort + Filter buttons */}
                <div className="flex items-center gap-2">
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
                        {hasActiveFilters && (
                            <Badge className="ml-2 h-5 min-w-[20px] p-0 flex items-center justify-center text-[10px] bg-international-orange text-white border-0">
                                !
                            </Badge>
                        )}
                    </Button>
                </div>
            </div>

            {/* Results count + clear */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{resultCount}</span>{' '}
                    {resultCount === 1 ? 'result' : 'results'}
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
