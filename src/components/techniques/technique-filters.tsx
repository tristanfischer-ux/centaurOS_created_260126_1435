'use client'

/**
 * TechniqueFilters — Category navigation bar and smart filters for the
 * Manufacturing Techniques Explorer.
 *
 * @description Provides a pill-based category navigation bar (similar to
 * marketplace category nav), a search input, and dropdown filters for
 * cost tier, batch size, and material.
 *
 * @component
 */

import { useState, useEffect } from 'react'
import {
  Layers,
  Scissors,
  Box,
  FlaskConical,
  Link2,
  Paintbrush,
  Cpu,
  Shapes,
  Sparkles,
  Search,
  X,
  LayoutGrid,
} from 'lucide-react'
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
import { cn } from '@/lib/utils'
import type { TechniqueCategory, CostTier, BatchSize } from '@/lib/manufacturing-techniques/types'
import {
  TECHNIQUE_CATEGORIES,
  CATEGORY_LABELS,
  COST_TIERS,
  COST_TIER_LABELS,
  BATCH_SIZES,
  BATCH_SIZE_LABELS,
} from '@/lib/manufacturing-techniques/types'

// ---------------------------------------------------------------------------
// Category icon + color mapping
// ---------------------------------------------------------------------------

const CATEGORY_NAV_ICONS: Record<TechniqueCategory, React.ElementType> = {
  additive: Layers,
  subtractive: Scissors,
  forming: Box,
  casting: FlaskConical,
  joining: Link2,
  surface: Paintbrush,
  composite: Shapes,
  electronics: Cpu,
  textile: Shapes,
  advanced: Sparkles,
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TechniqueFiltersProps {
  /** Currently selected category (null = all) */
  selectedCategory: TechniqueCategory | null
  /** Called when category changes */
  onCategoryChange: (category: TechniqueCategory | null) => void
  /** Current search query */
  searchQuery: string
  /** Called when search query changes */
  onSearchChange: (query: string) => void
  /** Current cost tier filter */
  costTier: CostTier | null
  /** Called when cost tier changes */
  onCostTierChange: (tier: CostTier | null) => void
  /** Current batch size filter */
  batchSize: BatchSize | null
  /** Called when batch size changes */
  onBatchSizeChange: (size: BatchSize | null) => void
  /** Counts per category for badges */
  categoryCounts: Record<TechniqueCategory, number>
  /** Total number of results after filtering */
  resultCount: number
  /** Total number of techniques */
  totalCount: number
}

export function TechniqueFilters({
  selectedCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  costTier,
  onCostTierChange,
  batchSize,
  onBatchSizeChange,
  categoryCounts,
  resultCount,
  totalCount,
}: TechniqueFiltersProps) {
  const hasActiveFilters =
    searchQuery.trim() !== '' || costTier !== null || batchSize !== null

  const handleClearAll = () => {
    onCategoryChange(null)
    onSearchChange('')
    onCostTierChange(null)
    onBatchSizeChange(null)
  }

  return (
    <div className="space-y-4">
      {/* ================================================================ */}
      {/* Category pills                                                   */}
      {/* ================================================================ */}
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Manufacturing technique categories"
      >
        {/* "All" pill */}
        <button
          role="tab"
          aria-selected={selectedCategory === null}
          onClick={() => onCategoryChange(null)}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium',
            'border transition-all duration-200 select-none',
            selectedCategory === null
              ? 'bg-international-orange/10 text-international-orange border-international-orange shadow-sm'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
        >
          <LayoutGrid className="h-4 w-4" />
          All
          <span
            className={cn(
              'text-xs tabular-nums px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center',
              selectedCategory === null ? 'bg-white/60' : 'bg-muted',
            )}
          >
            {totalCount}
          </span>
        </button>

        {/* Category pills */}
        {TECHNIQUE_CATEGORIES.map(cat => {
          const Icon = CATEGORY_NAV_ICONS[cat]
          const isActive = selectedCategory === cat
          const count = categoryCounts[cat] || 0
          if (count === 0) return null

          return (
            <button
              key={cat}
              role="tab"
              aria-selected={isActive}
              onClick={() =>
                onCategoryChange(isActive ? null : cat)
              }
              className={cn(
                'inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium',
                'border transition-all duration-200 select-none',
                isActive
                  ? 'bg-international-orange/10 text-international-orange border-international-orange shadow-sm'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {CATEGORY_LABELS[cat]}
              <span
                className={cn(
                  'text-[10px] tabular-nums px-1 py-0 rounded-full min-w-[1rem] text-center',
                  isActive ? 'bg-white/60' : 'bg-muted',
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ================================================================ */}
      {/* Search + smart filters row                                       */}
      {/* ================================================================ */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search techniques, materials, or applications..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-10 pr-10"
            aria-label="Search manufacturing techniques"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Dropdowns */}
        <div className="flex items-center gap-2">
          <Select
            value={costTier || '__all__'}
            onValueChange={v =>
              onCostTierChange(v === '__all__' ? null : (v as CostTier))
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Cost" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Any Cost</SelectItem>
              {COST_TIERS.map(t => (
                <SelectItem key={t} value={t}>
                  {COST_TIER_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={batchSize || '__all__'}
            onValueChange={v =>
              onBatchSizeChange(v === '__all__' ? null : (v as BatchSize))
            }
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Batch Size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Any Volume</SelectItem>
              {BATCH_SIZES.map(s => (
                <SelectItem key={s} value={s}>
                  {BATCH_SIZE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-xs gap-1"
            >
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Result count */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {resultCount} {resultCount === 1 ? 'technique' : 'techniques'}
        </span>
        {(hasActiveFilters || selectedCategory) && (
          <Badge variant="secondary" className="text-xs">
            Filtered
          </Badge>
        )}
      </div>
    </div>
  )
}
