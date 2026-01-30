"use client"

import { useState, useRef, useEffect } from "react"
import { Search, X, Loader2, History, TrendingUp, Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { SearchSuggestion, RecentSearch, PopularSearch, MarketplaceCategory } from "@/types/search"

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onSearch: () => void
  onClear?: () => void
  suggestions?: SearchSuggestion[]
  recentSearches?: RecentSearch[]
  popularSearches?: PopularSearch[]
  isLoading?: boolean
  placeholder?: string
  showSuggestions?: boolean
  onShowSuggestionsChange?: (show: boolean) => void
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void
  onRecentSelect?: (recent: RecentSearch) => void
  onPopularSelect?: (popular: PopularSearch) => void
  category?: MarketplaceCategory
  aiSearchEnabled?: boolean
  onAiSearchToggle?: () => void
  onAiSearch?: () => void
  className?: string
}

export function SearchBar({
  value,
  onChange,
  onSearch,
  onClear,
  suggestions = [],
  recentSearches = [],
  popularSearches = [],
  isLoading = false,
  placeholder = "Search the marketplace...",
  showSuggestions = false,
  onShowSuggestionsChange,
  onSuggestionSelect,
  onRecentSelect,
  onPopularSelect,
  aiSearchEnabled = false,
  onAiSearchToggle,
  onAiSearch,
  className,
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle clicks outside to close suggestions
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onShowSuggestionsChange?.(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onShowSuggestionsChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (aiSearchEnabled && onAiSearch) {
        onAiSearch()
      } else {
        onSearch()
      }
      onShowSuggestionsChange?.(false)
    }
    if (e.key === "Escape") {
      onShowSuggestionsChange?.(false)
      inputRef.current?.blur()
    }
  }

  const handleFocus = () => {
    setIsFocused(true)
    // Show suggestions if there's content or recent searches
    if (value.length > 0 || recentSearches.length > 0 || popularSearches.length > 0) {
      onShowSuggestionsChange?.(true)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    // Show suggestions when typing
    if (newValue.length >= 2) {
      onShowSuggestionsChange?.(true)
    }
  }

  const handleClear = () => {
    onChange("")
    onClear?.()
    inputRef.current?.focus()
  }

  const showDropdown = showSuggestions && isFocused && (
    suggestions.length > 0 ||
    recentSearches.length > 0 ||
    popularSearches.length > 0 ||
    value.length === 0
  )

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative flex gap-2">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={aiSearchEnabled ? "Describe what you're looking for..." : placeholder}
            className={cn(
              "pl-9 pr-10",
              aiSearchEnabled && "border-violet-300 focus-visible:ring-violet-500"
            )}
          />
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* AI Search Toggle */}
        {onAiSearchToggle && (
          <Button
            type="button"
            variant={aiSearchEnabled ? "default" : "secondary"}
            size="icon"
            onClick={() => {
              if (aiSearchEnabled && value.trim() && onAiSearch) {
                onAiSearch()
              } else {
                onAiSearchToggle()
              }
            }}
            className={cn(
              aiSearchEnabled && "bg-violet-600 hover:bg-violet-700"
            )}
            title={aiSearchEnabled ? "Search with AI" : "Enable AI Search"}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Search Button */}
        <Button
          type="button"
          onClick={aiSearchEnabled && onAiSearch ? onAiSearch : onSearch}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Search className="h-4 w-4 mr-2" />
          )}
          Search
        </Button>
      </div>

      {/* Suggestions Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg backdrop-blur-sm z-50 max-h-96 overflow-y-auto">
          {/* Suggestions from search */}
          {suggestions.length > 0 && (
            <div className="p-2">
              <div className="text-xs font-medium text-muted-foreground px-2 mb-1">
                Suggestions
              </div>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // Prevent blur
                  onClick={() => {
                    onSuggestionSelect?.(suggestion)
                    onShowSuggestionsChange?.(false)
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left"
                >
                  {suggestion.type === "listing" && (
                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  {suggestion.type === "category" && (
                    <Badge variant="secondary" className="text-[10px]">
                      {suggestion.category}
                    </Badge>
                  )}
                  {suggestion.type === "popular" && (
                    <TrendingUp className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                  )}
                  <span className="text-sm truncate flex-1">{suggestion.text}</span>
                  {suggestion.category && suggestion.type !== "category" && (
                    <span className="text-xs text-muted-foreground">
                      in {suggestion.category}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Recent Searches */}
          {value.length === 0 && recentSearches.length > 0 && (
            <div className="p-2 border-t first:border-t-0">
              <div className="text-xs font-medium text-muted-foreground px-2 mb-1">
                Recent Searches
              </div>
              {recentSearches.slice(0, 5).map((recent) => (
                <button
                  key={recent.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onRecentSelect?.(recent)
                    onShowSuggestionsChange?.(false)
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left"
                >
                  <History className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{recent.query}</span>
                  <span className="text-xs text-muted-foreground">
                    {recent.results_count} results
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Popular Searches */}
          {value.length === 0 && popularSearches.length > 0 && (
            <div className="p-2 border-t first:border-t-0">
              <div className="text-xs font-medium text-muted-foreground px-2 mb-1">
                Trending
              </div>
              {popularSearches.slice(0, 5).map((popular, idx) => (
                <button
                  key={`${popular.query}-${idx}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPopularSelect?.(popular)
                    onShowSuggestionsChange?.(false)
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left"
                >
                  <TrendingUp className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    popular.trending ? "text-orange-500" : "text-muted-foreground"
                  )} />
                  <span className="text-sm truncate flex-1">{popular.query}</span>
                  {popular.category && (
                    <Badge variant="secondary" className="text-[10px]">
                      {popular.category}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Empty State */}
          {suggestions.length === 0 &&
            recentSearches.length === 0 &&
            popularSearches.length === 0 &&
            value.length > 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No suggestions found
              </div>
            )}
        </div>
      )}
    </div>
  )
}

// Quick category pills for fast filtering
interface CategoryPillsProps {
  categories: { value: string; label: string; count?: number }[]
  selected?: string[]
  onChange: (selected: string[]) => void
  className?: string
}

export function CategoryPills({
  categories,
  selected = [],
  onChange,
  className,
}: CategoryPillsProps) {
  const toggleCategory = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(s => s !== value))
    } else {
      onChange([...selected, value])
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-xs text-muted-foreground">Quick filters:</span>
      {categories.map((cat) => (
        <button
          key={cat.value}
          type="button"
          onClick={() => toggleCategory(cat.value)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-full transition-colors",
            selected.includes(cat.value)
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {cat.label}
          {cat.count !== undefined && (
            <span className="ml-1 opacity-70">({cat.count})</span>
          )}
        </button>
      ))}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  )
}
