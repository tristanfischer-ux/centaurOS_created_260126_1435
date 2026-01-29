"use client"

import {
  LayoutGrid,
  List,
  ChevronDown,
  Star,
  MapPin,
  Clock,
  Shield,
  ShieldCheck,
  Loader2,
  ArrowUpDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import {
  SearchResult,
  SortOption,
  SORT_OPTIONS,
  TIER_LABELS,
  ProviderTier,
} from "@/types/search"

interface SearchResultsProps {
  results: SearchResult[]
  total: number
  isLoading?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  sortBy: SortOption
  onSortChange: (sort: SortOption) => void
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  maxSelections?: number
  viewMode?: "grid" | "list"
  onViewModeChange?: (mode: "grid" | "list") => void
  onItemClick?: (result: SearchResult) => void
  className?: string
}

export function SearchResults({
  results,
  total,
  isLoading,
  hasMore,
  onLoadMore,
  sortBy,
  onSortChange,
  selectedIds,
  onToggleSelect,
  maxSelections = 3,
  viewMode = "grid",
  onViewModeChange,
  onItemClick,
  className,
}: SearchResultsProps) {
  // Results header with count, sort, and view toggle
  const renderHeader = () => (
    <div className="flex items-center justify-between mb-4">
      <p className="text-sm text-muted-foreground">
        {isLoading ? (
          "Searching..."
        ) : (
          <>
            Showing <span className="font-medium text-foreground">{results.length}</span>
            {total > results.length && (
              <> of <span className="font-medium text-foreground">{total}</span></>
            )}
            {" "}results
          </>
        )}
      </p>

      <div className="flex items-center gap-2">
        {/* Sort dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="h-8">
              <ArrowUpDown className="h-3.5 w-3.5 mr-2" />
              {SORT_OPTIONS.find(o => o.value === sortBy)?.label || "Sort"}
              <ChevronDown className="h-3.5 w-3.5 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => onSortChange(option.value)}
                className={cn(sortBy === option.value && "bg-muted")}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* View mode toggle */}
        {onViewModeChange && (
          <div className="bg-muted p-1 rounded flex items-center">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("grid")}
              className="h-7 w-7 p-0"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("list")}
              className="h-7 w-7 p-0"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  // Loading state
  if (isLoading && results.length === 0) {
    return (
      <div className={className}>
        {renderHeader()}
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // Empty state
  if (!isLoading && results.length === 0) {
    return (
      <div className={className}>
        {renderHeader()}
        <EmptyState
          icon={<LayoutGrid className="h-12 w-12" />}
          title="No results found"
          description="Try adjusting your search or filters to find what you're looking for."
        />
      </div>
    )
  }

  return (
    <div className={className}>
      {renderHeader()}

      {/* Results grid/list */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {results.map((result) => (
            <ResultCard
              key={result.id}
              result={result}
              isSelected={selectedIds?.has(result.id)}
              onToggleSelect={onToggleSelect}
              canSelect={!selectedIds || selectedIds.size < maxSelections || selectedIds.has(result.id)}
              onClick={() => onItemClick?.(result)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((result) => (
            <ResultListItem
              key={result.id}
              result={result}
              isSelected={selectedIds?.has(result.id)}
              onToggleSelect={onToggleSelect}
              canSelect={!selectedIds || selectedIds.size < maxSelections || selectedIds.has(result.id)}
              onClick={() => onItemClick?.(result)}
            />
          ))}
        </div>
      )}

      {/* Load more button */}
      {hasMore && (
        <div className="flex justify-center mt-8">
          <Button
            variant="secondary"
            onClick={onLoadMore}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

// ==========================================
// RESULT CARD (Grid View)
// ==========================================

interface ResultCardProps {
  result: SearchResult
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
  canSelect?: boolean
  onClick?: () => void
}

function ResultCard({
  result,
  isSelected,
  onToggleSelect,
  canSelect = true,
  onClick,
}: ResultCardProps) {
  const attrs = result.attributes || {}

  return (
    <Card
      className={cn(
        "p-4 hover:shadow-md transition-all cursor-pointer",
        isSelected && "ring-2 ring-primary"
      )}
      onClick={onClick}
    >
      <div className="space-y-3">
        {/* Header with checkbox */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                {result.subcategory}
              </Badge>
              {result.is_verified && (
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              )}
            </div>
            <h3 className="font-semibold truncate">{result.title}</h3>
          </div>
          {onToggleSelect && (
            <Checkbox
              checked={isSelected}
              disabled={!canSelect}
              onCheckedChange={() => onToggleSelect(result.id)}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>

        {/* Provider tier badge */}
        {result.provider && (
          <Badge
            variant="secondary"
            className={cn(
              "text-xs",
              getTierBadgeClass(result.provider.tier)
            )}
          >
            <Shield className="h-3 w-3 mr-1" />
            {TIER_LABELS[result.provider.tier]}
          </Badge>
        )}

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {result.description}
        </p>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {result.provider?.rating !== null && result.provider?.rating !== undefined && (
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span>{result.provider.rating.toFixed(1)}</span>
              {result.provider.total_reviews > 0 && (
                <span>({result.provider.total_reviews})</span>
              )}
            </div>
          )}
          {attrs.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span className="truncate max-w-[100px]">{String(attrs.location)}</span>
            </div>
          )}
          {result.provider?.day_rate && (
            <div className="flex items-center gap-1 font-medium text-foreground">
              £{result.provider.day_rate}/day
            </div>
          )}
        </div>

        {/* Skills/tags */}
        {(attrs.skills || attrs.expertise) && (
          <div className="flex flex-wrap gap-1">
            {(((attrs.skills || attrs.expertise) as string[]) || []).slice(0, 3).map((skill, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded"
              >
                {String(skill)}
              </span>
            ))}
            {(((attrs.skills || attrs.expertise) as string[]) || []).length > 3 && (
              <span className="px-2 py-0.5 text-xs text-muted-foreground">
                +{(((attrs.skills || attrs.expertise) as string[]) || []).length - 3}
              </span>
            )}
          </div>
        )}

        {/* Score indicator (optional - for debugging) */}
        {/* <div className="text-xs text-muted-foreground">
          Score: {result.totalScore.toFixed(3)}
        </div> */}
      </div>
    </Card>
  )
}

// ==========================================
// RESULT LIST ITEM (List View)
// ==========================================

function ResultListItem({
  result,
  isSelected,
  onToggleSelect,
  canSelect = true,
  onClick,
}: ResultCardProps) {
  const attrs = result.attributes || {}

  return (
    <Card
      className={cn(
        "p-4 hover:shadow-md transition-all cursor-pointer",
        isSelected && "ring-2 ring-primary"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox */}
        {onToggleSelect && (
          <Checkbox
            checked={isSelected}
            disabled={!canSelect}
            onCheckedChange={() => onToggleSelect(result.id)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1"
          />
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                  {result.subcategory}
                </Badge>
                {result.is_verified && (
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                )}
                {result.provider && (
                  <Badge
                    variant="secondary"
                    className={cn("text-[10px]", getTierBadgeClass(result.provider.tier))}
                  >
                    {TIER_LABELS[result.provider.tier]}
                  </Badge>
                )}
              </div>
              <h3 className="font-semibold">{result.title}</h3>
              {attrs.role && (
                <p className="text-sm text-muted-foreground">{String(attrs.role)}</p>
              )}
            </div>

            {/* Price */}
            {result.provider?.day_rate && (
              <div className="text-right shrink-0">
                <p className="font-semibold">
                  {result.provider.currency || "£"}{result.provider.day_rate}
                </p>
                <p className="text-xs text-muted-foreground">per day</p>
              </div>
            )}
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {result.description}
          </p>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted-foreground">
            {result.provider?.rating !== null && result.provider?.rating !== undefined && (
              <div className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span className="font-medium text-foreground">
                  {result.provider.rating.toFixed(1)}
                </span>
                <span>({result.provider.total_reviews} reviews)</span>
              </div>
            )}
            {attrs.years_experience && (
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {String(attrs.years_experience)} years experience
              </div>
            )}
            {attrs.location && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {String(attrs.location)}
              </div>
            )}
            {(attrs.skills || attrs.expertise) && (
              <div className="flex gap-1">
                {(((attrs.skills || attrs.expertise) as string[]) || []).slice(0, 3).map((skill, i) => (
                  <span key={i} className="px-2 py-0.5 bg-muted rounded">
                    {String(skill)}
                  </span>
                ))}
                {(((attrs.skills || attrs.expertise) as string[]) || []).length > 3 && (
                  <span className="px-2 py-0.5">
                    +{(((attrs.skills || attrs.expertise) as string[]) || []).length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ==========================================
// HELPERS
// ==========================================

function getTierBadgeClass(tier: ProviderTier): string {
  switch (tier) {
    case "premium":
      return "bg-amber-100 text-amber-800 border-amber-300"
    case "verified":
      return "bg-emerald-100 text-emerald-800 border-emerald-300"
    case "standard":
      return "bg-blue-100 text-blue-800 border-blue-300"
    default:
      return "bg-slate-100 text-slate-800"
  }
}
