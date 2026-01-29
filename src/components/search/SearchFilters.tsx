"use client"

import { useState } from "react"
import {
  X,
  ChevronDown,
  ChevronUp,
  MapPin,
  Star,
  DollarSign,
  Shield,
  Calendar,
  Briefcase,
  SlidersHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  AppliedFilters,
  SearchFilters as SearchFiltersType,
  ProviderTier,
  TIER_LABELS,
} from "@/types/search"

interface SearchFiltersProps {
  filters: AppliedFilters
  filterOptions?: SearchFiltersType
  onFilterChange: <K extends keyof AppliedFilters>(key: K, value: AppliedFilters[K]) => void
  onClearFilter: (key: keyof AppliedFilters) => void
  onClearAll: () => void
  onApply?: () => void
  isLoading?: boolean
  className?: string
}

export function SearchFilters({
  filters,
  filterOptions,
  onFilterChange,
  onClearFilter,
  onClearAll,
  onApply,
  isLoading,
  className,
}: SearchFiltersProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    subcategory: true,
    price: true,
    rating: true,
    tier: true,
    location: false,
    skills: false,
  })

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const hasActiveFilters = Object.keys(filters).some(
    key => key !== "category" && filters[key as keyof AppliedFilters] !== undefined
  )

  // Count active filters
  const activeFilterCount = Object.keys(filters).filter(key => {
    const value = filters[key as keyof AppliedFilters]
    if (key === "category") return false
    if (value === undefined) return false
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === "object" && value !== null) {
      return Object.values(value).some(v => v !== undefined)
    }
    return true
  }).length

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          <h3 className="font-medium">Filters</h3>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-8 text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            Clear all
          </Button>
        )}
      </div>

      {/* Subcategory Filter */}
      {filterOptions?.subcategories && filterOptions.subcategories.length > 0 && (
        <FilterSection
          title="Type"
          icon={<Briefcase className="h-3.5 w-3.5" />}
          isOpen={expandedSections.subcategory}
          onToggle={() => toggleSection("subcategory")}
          hasValue={!!filters.subcategories?.length}
          onClear={() => onClearFilter("subcategories")}
        >
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {filterOptions.subcategories.map((option) => (
              <div key={option.value} className="flex items-center gap-2">
                <Checkbox
                  id={`subcategory-${option.value}`}
                  checked={filters.subcategories?.includes(option.value) || false}
                  onCheckedChange={(checked) => {
                    const current = filters.subcategories || []
                    if (checked) {
                      onFilterChange("subcategories", [...current, option.value])
                    } else {
                      onFilterChange(
                        "subcategories",
                        current.filter(s => s !== option.value)
                      )
                    }
                  }}
                />
                <Label
                  htmlFor={`subcategory-${option.value}`}
                  className="flex-1 text-sm cursor-pointer"
                >
                  {option.label}
                </Label>
                <span className="text-xs text-muted-foreground">
                  ({option.count})
                </span>
              </div>
            ))}
          </div>
        </FilterSection>
      )}

      {/* Price Range Filter */}
      <FilterSection
        title="Price"
        icon={<DollarSign className="h-3.5 w-3.5" />}
        isOpen={expandedSections.price}
        onToggle={() => toggleSection("price")}
        hasValue={filters.priceRange?.min !== undefined || filters.priceRange?.max !== undefined}
        onClear={() => onClearFilter("priceRange")}
      >
        <div className="space-y-4">
          {/* Quick price ranges */}
          {filterOptions?.priceRanges && (
            <div className="flex flex-wrap gap-2">
              {filterOptions.priceRanges.map((range) => {
                const isSelected =
                  filters.priceRange?.min === range.min &&
                  filters.priceRange?.max === range.max
                return (
                  <button
                    key={range.label}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        onClearFilter("priceRange")
                      } else {
                        onFilterChange("priceRange", {
                          min: range.min ?? undefined,
                          max: range.max ?? undefined,
                        })
                      }
                    }}
                    className={cn(
                      "px-2 py-1 text-xs rounded border transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    {range.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Custom price inputs */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Min</Label>
              <Input
                type="number"
                placeholder="£0"
                value={filters.priceRange?.min ?? ""}
                onChange={(e) => {
                  const value = e.target.value ? Number(e.target.value) : undefined
                  onFilterChange("priceRange", {
                    ...filters.priceRange,
                    min: value,
                  })
                }}
                className="h-8"
              />
            </div>
            <span className="text-muted-foreground mt-4">-</span>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Max</Label>
              <Input
                type="number"
                placeholder="Any"
                value={filters.priceRange?.max ?? ""}
                onChange={(e) => {
                  const value = e.target.value ? Number(e.target.value) : undefined
                  onFilterChange("priceRange", {
                    ...filters.priceRange,
                    max: value,
                  })
                }}
                className="h-8"
              />
            </div>
          </div>
        </div>
      </FilterSection>

      {/* Rating Filter */}
      <FilterSection
        title="Rating"
        icon={<Star className="h-3.5 w-3.5" />}
        isOpen={expandedSections.rating}
        onToggle={() => toggleSection("rating")}
        hasValue={filters.minRating !== undefined}
        onClear={() => onClearFilter("minRating")}
      >
        <div className="space-y-3">
          {[4, 3, 2, 1].map((rating) => (
            <button
              key={rating}
              type="button"
              onClick={() => {
                if (filters.minRating === rating) {
                  onClearFilter("minRating")
                } else {
                  onFilterChange("minRating", rating)
                }
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors",
                filters.minRating === rating
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-3.5 w-3.5",
                      i < rating
                        ? filters.minRating === rating
                          ? "fill-primary-foreground text-primary-foreground"
                          : "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30"
                    )}
                  />
                ))}
              </div>
              <span className="text-sm">{rating}+ stars</span>
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Tier Filter */}
      <FilterSection
        title="Provider Tier"
        icon={<Shield className="h-3.5 w-3.5" />}
        isOpen={expandedSections.tier}
        onToggle={() => toggleSection("tier")}
        hasValue={!!filters.tiers?.length}
        onClear={() => onClearFilter("tiers")}
      >
        <div className="space-y-2">
          {(["premium", "verified", "standard"] as ProviderTier[]).map((tier) => (
            <div key={tier} className="flex items-center gap-2">
              <Checkbox
                id={`tier-${tier}`}
                checked={filters.tiers?.includes(tier) || false}
                onCheckedChange={(checked) => {
                  const current = filters.tiers || []
                  if (checked) {
                    onFilterChange("tiers", [...current, tier])
                  } else {
                    onFilterChange("tiers", current.filter(t => t !== tier))
                  }
                }}
              />
              <Label
                htmlFor={`tier-${tier}`}
                className="flex-1 text-sm cursor-pointer capitalize"
              >
                {TIER_LABELS[tier]}
              </Label>
              {filterOptions?.tiers && (
                <span className="text-xs text-muted-foreground">
                  ({filterOptions.tiers.find(t => t.value === tier)?.count || 0})
                </span>
              )}
            </div>
          ))}
        </div>
      </FilterSection>

      {/* Location Filter */}
      {filterOptions?.locations && filterOptions.locations.length > 0 && (
        <FilterSection
          title="Location"
          icon={<MapPin className="h-3.5 w-3.5" />}
          isOpen={expandedSections.location}
          onToggle={() => toggleSection("location")}
          hasValue={!!filters.location}
          onClear={() => onClearFilter("location")}
        >
          <Select
            value={filters.location || ""}
            onValueChange={(value) => {
              if (value === "all") {
                onClearFilter("location")
              } else {
                onFilterChange("location", value)
              }
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {filterOptions.locations.map((loc) => (
                <SelectItem key={loc.value} value={loc.value}>
                  {loc.label} ({loc.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Skills Filter */}
      {filterOptions?.skills && filterOptions.skills.length > 0 && (
        <FilterSection
          title="Skills"
          icon={<Briefcase className="h-3.5 w-3.5" />}
          isOpen={expandedSections.skills}
          onToggle={() => toggleSection("skills")}
          hasValue={!!filters.skills?.length}
          onClear={() => onClearFilter("skills")}
        >
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {filterOptions.skills.slice(0, 15).map((skill) => (
              <div key={skill.value} className="flex items-center gap-2">
                <Checkbox
                  id={`skill-${skill.value}`}
                  checked={filters.skills?.includes(skill.value) || false}
                  onCheckedChange={(checked) => {
                    const current = filters.skills || []
                    if (checked) {
                      onFilterChange("skills", [...current, skill.value])
                    } else {
                      onFilterChange("skills", current.filter(s => s !== skill.value))
                    }
                  }}
                />
                <Label
                  htmlFor={`skill-${skill.value}`}
                  className="flex-1 text-sm cursor-pointer"
                >
                  {skill.label}
                </Label>
              </div>
            ))}
          </div>
        </FilterSection>
      )}

      {/* Availability Filter */}
      <FilterSection
        title="Availability"
        icon={<Calendar className="h-3.5 w-3.5" />}
        isOpen={expandedSections.availability}
        onToggle={() => toggleSection("availability")}
        hasValue={!!filters.dateRange?.from || !!filters.dateRange?.to}
        onClear={() => onClearFilter("dateRange")}
      >
        <div className="space-y-2">
          <div>
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={filters.dateRange?.from || ""}
              onChange={(e) => {
                onFilterChange("dateRange", {
                  ...filters.dateRange,
                  from: e.target.value || undefined,
                })
              }}
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={filters.dateRange?.to || ""}
              onChange={(e) => {
                onFilterChange("dateRange", {
                  ...filters.dateRange,
                  to: e.target.value || undefined,
                })
              }}
              className="h-8"
            />
          </div>
        </div>
      </FilterSection>

      {/* Apply Button (for mobile) */}
      {onApply && (
        <Button onClick={onApply} className="w-full" disabled={isLoading}>
          Apply Filters
        </Button>
      )}
    </div>
  )
}

// ==========================================
// FILTER SECTION COMPONENT
// ==========================================

interface FilterSectionProps {
  title: string
  icon?: React.ReactNode
  isOpen: boolean
  onToggle: () => void
  hasValue?: boolean
  onClear?: () => void
  children: React.ReactNode
}

function FilterSection({
  title,
  icon,
  isOpen,
  onToggle,
  hasValue,
  onClear,
  children,
}: FilterSectionProps) {
  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between py-2 text-sm font-medium hover:text-foreground"
        >
          <div className="flex items-center gap-2">
            {icon}
            <span>{title}</span>
            {hasValue && (
              <div className="h-2 w-2 rounded-full bg-primary" />
            )}
          </div>
          <div className="flex items-center gap-1">
            {hasValue && onClear && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onClear()
                }}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

// ==========================================
// ACTIVE FILTERS BADGES
// ==========================================

interface ActiveFilterBadgesProps {
  filters: AppliedFilters
  onRemove: (key: keyof AppliedFilters, value?: string) => void
  onClearAll: () => void
  className?: string
}

export function ActiveFilterBadges({
  filters,
  onRemove,
  onClearAll,
  className,
}: ActiveFilterBadgesProps) {
  const badges: { key: keyof AppliedFilters; label: string; value?: string }[] = []

  if (filters.query) {
    badges.push({ key: "query", label: `"${filters.query}"` })
  }
  if (filters.subcategories?.length) {
    filters.subcategories.forEach(sub => {
      badges.push({ key: "subcategories", label: sub, value: sub })
    })
  }
  if (filters.priceRange?.min !== undefined || filters.priceRange?.max !== undefined) {
    const min = filters.priceRange?.min ?? 0
    const max = filters.priceRange?.max ?? "∞"
    badges.push({ key: "priceRange", label: `£${min} - £${max}` })
  }
  if (filters.minRating !== undefined) {
    badges.push({ key: "minRating", label: `${filters.minRating}+ stars` })
  }
  if (filters.location) {
    badges.push({ key: "location", label: filters.location })
  }
  if (filters.tiers?.length) {
    filters.tiers.forEach(tier => {
      badges.push({ key: "tiers", label: TIER_LABELS[tier], value: tier })
    })
  }
  if (filters.skills?.length) {
    filters.skills.forEach(skill => {
      badges.push({ key: "skills", label: skill, value: skill })
    })
  }

  if (badges.length === 0) return null

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {badges.map((badge, idx) => (
        <Badge
          key={`${badge.key}-${badge.value || idx}`}
          variant="secondary"
          className="gap-1 pr-1"
        >
          {badge.label}
          <button
            type="button"
            onClick={() => onRemove(badge.key, badge.value)}
            className="ml-1 hover:bg-muted-foreground/20 rounded p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  )
}
