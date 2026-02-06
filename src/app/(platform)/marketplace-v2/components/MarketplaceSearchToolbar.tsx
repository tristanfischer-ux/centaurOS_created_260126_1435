'use client'

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
import { Search, X, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SORT_OPTIONS, type SortOption } from '../hooks/useMarketplaceState'

interface MarketplaceSearchToolbarProps {
    searchQuery: string
    onSearchChange: (query: string) => void
    sortBy: SortOption
    onSortChange: (sort: SortOption) => void
    showFilters: boolean
    onToggleFilters: () => void
    hasActiveFilters: boolean
    onClearAll: () => void
    resultCount: number
}

export function MarketplaceSearchToolbar({
    searchQuery,
    onSearchChange,
    sortBy,
    onSortChange,
    showFilters,
    onToggleFilters,
    hasActiveFilters,
    onClearAll,
    resultCount,
}: MarketplaceSearchToolbarProps) {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Search input */}
                <div className="relative flex-1 max-w-xl">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search by name, skill, service, or keyword..."
                        className="pl-10 pr-10 h-11"
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

                {/* Sort + Filter buttons */}
                <div className="flex items-center gap-2">
                    <Select value={sortBy} onValueChange={(val) => onSortChange(val as SortOption)}>
                        <SelectTrigger className="w-[160px] h-11" aria-label="Sort listings">
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
                        className={cn('h-11', showFilters && 'bg-foreground text-background hover:bg-foreground/90')}
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
