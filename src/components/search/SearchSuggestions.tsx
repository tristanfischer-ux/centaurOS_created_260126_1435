"use client"

import { Search, History, TrendingUp, Tag, User, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  SearchSuggestion,
  RecentSearch,
  PopularSearch,
  MarketplaceCategory,
} from "@/types/search"

interface SearchSuggestionsProps {
  suggestions?: SearchSuggestion[]
  recentSearches?: RecentSearch[]
  popularSearches?: PopularSearch[]
  query?: string
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void
  onRecentSelect?: (recent: RecentSearch) => void
  onPopularSelect?: (popular: PopularSearch) => void
  onClearRecent?: () => void
  className?: string
}

export function SearchSuggestions({
  suggestions = [],
  recentSearches = [],
  popularSearches = [],
  query = "",
  onSuggestionSelect,
  onRecentSelect,
  onPopularSelect,
  onClearRecent,
  className,
}: SearchSuggestionsProps) {
  const hasContent =
    suggestions.length > 0 ||
    recentSearches.length > 0 ||
    popularSearches.length > 0

  if (!hasContent) {
    return null
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Query-based suggestions */}
      {suggestions.length > 0 && (
        <SuggestionSection title="Suggestions">
          {suggestions.map((suggestion) => (
            <SuggestionItem
              key={suggestion.id}
              icon={getSuggestionIcon(suggestion.type)}
              text={highlightMatch(suggestion.text, query)}
              badge={suggestion.category}
              subtitle={suggestion.subcategory}
              onClick={() => onSuggestionSelect?.(suggestion)}
            />
          ))}
        </SuggestionSection>
      )}

      {/* Recent searches */}
      {recentSearches.length > 0 && (
        <SuggestionSection
          title="Recent Searches"
          action={onClearRecent && {
            label: "Clear all",
            onClick: onClearRecent,
          }}
        >
          {recentSearches.slice(0, 5).map((recent) => (
            <SuggestionItem
              key={recent.id}
              icon={<History className="h-4 w-4 text-muted-foreground" />}
              text={recent.query}
              subtitle={`${recent.results_count} results`}
              onClick={() => onRecentSelect?.(recent)}
            />
          ))}
        </SuggestionSection>
      )}

      {/* Popular/trending searches */}
      {popularSearches.length > 0 && (
        <SuggestionSection title="Trending Searches">
          {popularSearches.slice(0, 6).map((popular, idx) => (
            <SuggestionItem
              key={`${popular.query}-${idx}`}
              icon={
                <TrendingUp
                  className={cn(
                    "h-4 w-4",
                    popular.trending ? "text-orange-500" : "text-muted-foreground"
                  )}
                />
              }
              text={popular.query}
              badge={popular.category}
              onClick={() => onPopularSelect?.(popular)}
            />
          ))}
        </SuggestionSection>
      )}
    </div>
  )
}

// ==========================================
// SUGGESTION SECTION
// ==========================================

interface SuggestionSectionProps {
  title: string
  action?: {
    label: string
    onClick: () => void
  }
  children: React.ReactNode
}

function SuggestionSection({ title, action, children }: SuggestionSectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </h4>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {action.label}
          </button>
        )}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

// ==========================================
// SUGGESTION ITEM
// ==========================================

interface SuggestionItemProps {
  icon: React.ReactNode
  text: string | React.ReactNode
  badge?: string
  subtitle?: string
  onClick?: () => void
}

function SuggestionItem({
  icon,
  text,
  badge,
  subtitle,
  onClick,
}: SuggestionItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted text-left transition-colors"
    >
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm truncate">{text}</span>
          {badge && (
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {badge}
            </Badge>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>
    </button>
  )
}

// ==========================================
// HELPERS
// ==========================================

function getSuggestionIcon(type: string): React.ReactNode {
  switch (type) {
    case "listing":
      return <Search className="h-4 w-4 text-muted-foreground" />
    case "category":
      return <Tag className="h-4 w-4 text-blue-500" />
    case "provider":
      return <User className="h-4 w-4 text-green-500" />
    case "recent":
      return <History className="h-4 w-4 text-muted-foreground" />
    case "popular":
      return <TrendingUp className="h-4 w-4 text-orange-500" />
    default:
      return <Sparkles className="h-4 w-4 text-violet-500" />
  }
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text

  const normalizedText = text.toLowerCase()
  const normalizedQuery = query.toLowerCase()
  const index = normalizedText.indexOf(normalizedQuery)

  if (index === -1) return text

  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-yellow-100 text-yellow-900 rounded px-0.5">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  )
}

// ==========================================
// INLINE SUGGESTIONS PANEL
// ==========================================

interface InlineSuggestionsPanelProps {
  isOpen: boolean
  query: string
  suggestions: SearchSuggestion[]
  recentSearches: RecentSearch[]
  popularSearches: PopularSearch[]
  onSuggestionSelect: (suggestion: SearchSuggestion) => void
  onRecentSelect: (recent: RecentSearch) => void
  onPopularSelect: (popular: PopularSearch) => void
  onClose: () => void
}

export function InlineSuggestionsPanel({
  isOpen,
  query,
  suggestions,
  recentSearches,
  popularSearches,
  onSuggestionSelect,
  onRecentSelect,
  onPopularSelect,
  onClose,
}: InlineSuggestionsPanelProps) {
  if (!isOpen) return null

  const showSuggestions = query.length >= 2 && suggestions.length > 0
  const showRecent = query.length === 0 && recentSearches.length > 0
  const showPopular = popularSearches.length > 0

  if (!showSuggestions && !showRecent && !showPopular) {
    return null
  }

  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg backdrop-blur-sm z-50 max-h-96 overflow-y-auto">
      <div className="p-3">
        <SearchSuggestions
          suggestions={showSuggestions ? suggestions : []}
          recentSearches={showRecent ? recentSearches : []}
          popularSearches={query.length === 0 ? popularSearches : []}
          query={query}
          onSuggestionSelect={(s) => {
            onSuggestionSelect(s)
            onClose()
          }}
          onRecentSelect={(r) => {
            onRecentSelect(r)
            onClose()
          }}
          onPopularSelect={(p) => {
            onPopularSelect(p)
            onClose()
          }}
        />
      </div>
    </div>
  )
}

// ==========================================
// QUICK SUGGESTIONS ROW
// ==========================================

interface QuickSuggestionsRowProps {
  suggestions: Array<{
    text: string
    category?: MarketplaceCategory
    trending?: boolean
  }>
  onSelect: (text: string, category?: MarketplaceCategory) => void
  className?: string
}

export function QuickSuggestionsRow({
  suggestions,
  onSelect,
  className,
}: QuickSuggestionsRowProps) {
  if (suggestions.length === 0) return null

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-xs text-muted-foreground">Try:</span>
      {suggestions.slice(0, 5).map((suggestion, idx) => (
        <button
          key={`${suggestion.text}-${idx}`}
          type="button"
          onClick={() => onSelect(suggestion.text, suggestion.category)}
          className={cn(
            "px-2 py-1 text-xs rounded-full border transition-colors",
            "hover:bg-muted hover:border-muted-foreground/50",
            suggestion.trending && "border-orange-300 text-orange-700"
          )}
        >
          {suggestion.trending && (
            <TrendingUp className="h-3 w-3 inline mr-1 text-orange-500" />
          )}
          {suggestion.text}
        </button>
      ))}
    </div>
  )
}
