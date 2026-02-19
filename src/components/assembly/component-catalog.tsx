"use client"

/**
 * @file component-catalog.tsx — Sidebar catalog browser for the assembly workbench.
 *
 * @description Filterable, searchable sidebar showing all components from the
 * geometry library. Supports tier tabs, category chips, and text search.
 * When a slot is active, auto-filters to compatible components.
 *
 * @component
 * @example
 * <ComponentCatalog
 *   components={components}
 *   stats={stats}
 *   activeSlot={slot}
 *   onSelectComponent={handleSelect}
 * />
 */

import { useState, useMemo, useCallback } from "react"
import { Search, Package, Zap, Layers, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { ComponentCard } from "./component-card"
import type { CatalogComponent, CatalogStats, TemplateSlot } from "@/actions/assembly-builder"

// ─── Tier Definitions ────────────────────────────────────────────────

const TIERS = [
  { id: "all", label: "All", icon: Package, tip: "All component tiers" },
  { id: "universal", label: "Universal", icon: Layers, tip: "Standard parts usable across all assemblies" },
  { id: "electromechanical", label: "Electro", icon: Zap, tip: "Electrical and mechanical components" },
  { id: "domain", label: "Domain", icon: Package, tip: "Specialized parts for specific industries" },
] as const

// ─── Props ───────────────────────────────────────────────────────────

interface ComponentCatalogProps {
  /** All loaded components */
  components: CatalogComponent[]
  /** Stats for filter chip counts */
  stats: CatalogStats
  /** Currently active slot (for compatibility filtering) */
  activeSlot?: TemplateSlot | null
  /** Called when user selects a component */
  onSelectComponent: (component: CatalogComponent) => void
  /** Called to deselect the active slot (dismiss filter) */
  onClearActiveSlot?: () => void
  /** Optional className */
  className?: string
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * ComponentCatalog — Sidebar browser for the component library.
 *
 * @description Provides search, tier tabs, and category filter chips.
 * When an active slot is provided, components are sorted by compatibility
 * and incompatible ones are dimmed.
 */
export function ComponentCatalog({
  components,
  stats,
  activeSlot,
  onSelectComponent,
  onClearActiveSlot,
  className,
}: ComponentCatalogProps): React.ReactNode {
  const [search, setSearch] = useState("")
  const [activeTier, setActiveTier] = useState<string>("all")
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // Get unique categories from loaded data
  const categories = useMemo(() => {
    const cats = new Map<string, number>()
    for (const c of components) {
      cats.set(c.category, (cats.get(c.category) ?? 0) + 1)
    }
    return Array.from(cats.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }, [components])

  // Check if a component is compatible with the active slot
  const isCompatible = useCallback(
    (component: CatalogComponent): boolean | undefined => {
      if (!activeSlot) return undefined

      const categoryMatch =
        activeSlot.compatibleCategories.length === 0 ||
        activeSlot.compatibleCategories.some((cat) =>
          component.category.toLowerCase().includes(cat.toLowerCase()),
        )

      const tierMatch =
        activeSlot.compatibleTiers.length === 0 ||
        activeSlot.compatibleTiers.includes(component.tier)

      return categoryMatch && tierMatch
    },
    [activeSlot],
  )

  // Build a human-readable reason for incompatibility
  const getIncompatibleReason = useCallback(
    (component: CatalogComponent): string | undefined => {
      if (!activeSlot) return undefined

      const categoryMatch =
        activeSlot.compatibleCategories.length === 0 ||
        activeSlot.compatibleCategories.some((cat) =>
          component.category.toLowerCase().includes(cat.toLowerCase()),
        )

      const tierMatch =
        activeSlot.compatibleTiers.length === 0 ||
        activeSlot.compatibleTiers.includes(component.tier)

      if (categoryMatch && tierMatch) return undefined

      const reasons: string[] = []
      if (!categoryMatch) {
        reasons.push(`Needs: ${activeSlot.compatibleCategories.join(", ")}`)
      }
      if (!tierMatch) {
        const tierLabels = activeSlot.compatibleTiers.map((t) =>
          t === "universal" ? "T1" : t === "electromechanical" ? "T2" : "T3",
        )
        reasons.push(`Requires tier: ${tierLabels.join(", ")}`)
      }
      return reasons.join(" · ")
    },
    [activeSlot],
  )

  // Filter and sort components
  const filteredComponents = useMemo(() => {
    let filtered = components

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q),
      )
    }

    // Tier filter
    if (activeTier !== "all") {
      filtered = filtered.filter((c) => c.tier === activeTier)
    }

    // Category filter
    if (activeCategory) {
      filtered = filtered.filter((c) => c.category === activeCategory)
    }

    // Sort compatible components first when a slot is active
    if (activeSlot) {
      filtered = [...filtered].sort((a, b) => {
        const aCompat = isCompatible(a) ? 0 : 1
        const bCompat = isCompatible(b) ? 0 : 1
        return aCompat - bCompat
      })
    }

    return filtered
  }, [components, search, activeTier, activeCategory, activeSlot, isCompatible])

  const handleClearFilters = useCallback(() => {
    setSearch("")
    setActiveTier("all")
    setActiveCategory(null)
  }, [])

  const hasFilters = search.trim() || activeTier !== "all" || activeCategory

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2 space-y-3 border-b">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Component Library
          </h3>
          <span className="text-xs text-muted-foreground font-mono">
            {filteredComponents.length} of {components.length}
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components..."
            className="h-8 pl-8 text-sm"
            aria-label="Search components"
          />
        </div>

        {/* Tier tabs */}
        <TooltipProvider delayDuration={300}>
          <div className="flex gap-1">
            {TIERS.map((tier) => {
              const count =
                tier.id === "all"
                  ? stats.total
                  : (stats.byTier[tier.id] ?? 0)
              const TierIcon = tier.icon
              return (
                <Tooltip key={tier.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setActiveTier(tier.id)}
                      className={cn(
                        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                        activeTier === tier.id
                          ? "bg-international-orange text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80",
                      )}
                      aria-pressed={activeTier === tier.id}
                    >
                      <TierIcon className="h-3 w-3" />
                      {tier.label}
                      <span className="opacity-70">({count})</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {tier.tip}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </TooltipProvider>

        {/* Category chips */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1 pb-1">
            {categories.slice(0, 12).map((cat) => (
              <button
                key={cat.name}
                type="button"
                onClick={() =>
                  setActiveCategory(
                    activeCategory === cat.name ? null : cat.name,
                  )
                }
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                  activeCategory === cat.name
                    ? "bg-international-orange text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {cat.name} ({cat.count})
              </button>
            ))}
          </div>
        )}

        {/* Active slot indicator */}
        {activeSlot && (
          <div className="rounded-md bg-international-orange-light/30 border border-international-orange/20 px-3 py-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-international-orange">
                  Showing compatible with "{activeSlot.label}" slot
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {activeSlot.compatibleCategories.length > 0
                    ? `Categories: ${activeSlot.compatibleCategories.join(", ")}`
                    : "Any category"}
                  {activeSlot.compatibleTiers.length > 0
                    ? ` · Tiers: ${activeSlot.compatibleTiers.map((t) => t === "universal" ? "T1" : t === "electromechanical" ? "T2" : "T3").join(", ")}`
                    : ""}
                </p>
              </div>
              {onClearActiveSlot && (
                <button
                  type="button"
                  onClick={onClearActiveSlot}
                  className="shrink-0 text-international-orange/70 hover:text-international-orange p-0.5"
                  aria-label="Clear slot filter"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Clear filters */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-6 text-xs text-muted-foreground"
          >
            <X className="h-3 w-3 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Component list */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {filteredComponents.length === 0 ? (
            <div className="py-8 text-center">
              <Package className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No components match your filters
              </p>
            </div>
          ) : (
            filteredComponents.map((component) => (
              <ComponentCard
                key={component.id}
                component={component}
                isCompatible={isCompatible(component)}
                incompatibleReason={
                  isCompatible(component) === false
                    ? getIncompatibleReason(component)
                    : undefined
                }
                onSelect={onSelectComponent}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
