'use client'

/**
 * TechniquesExplorer — Main component for the Manufacturing Techniques
 * tab in the Inspiration page.
 *
 * @description Interactive encyclopedia of 80+ modern manufacturing
 * techniques. Lets users browse by category, search, filter by cost/
 * batch size, and click through to detailed technique info with CTAs
 * to find suppliers or start an RFQ.
 *
 * @component
 *
 * @example
 * <TechniquesExplorer />
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Factory, Search, ArrowRight, Store } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  ALL_TECHNIQUES,
  filterTechniques,
  countByCategory,
} from '@/lib/manufacturing-techniques'
import type {
  ManufacturingTechnique,
  TechniqueCategory,
  CostTier,
  BatchSize,
} from '@/lib/manufacturing-techniques/types'
import { TechniqueCard } from './technique-card'
import { TechniqueFilters } from './technique-filters'
import { TechniqueDetailDialog } from './technique-detail-dialog'

export function TechniquesExplorer() {
  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------
  const [selectedCategory, setSelectedCategory] =
    useState<TechniqueCategory | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [costTier, setCostTier] = useState<CostTier | null>(null)
  const [batchSize, setBatchSize] = useState<BatchSize | null>(null)
  const [selectedTechnique, setSelectedTechnique] =
    useState<ManufacturingTechnique | null>(null)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const categoryCounts = useMemo(() => countByCategory(), [])

  const filteredTechniques = useMemo(
    () =>
      filterTechniques({
        category: selectedCategory,
        costTier,
        batchSize,
        query: debouncedSearch || null,
      }),
    [selectedCategory, costTier, batchSize, debouncedSearch],
  )

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleViewRelated = useCallback(
    (technique: ManufacturingTechnique) => {
      setSelectedTechnique(technique)
    },
    [],
  )

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <Card className="bg-gradient-to-r from-international-orange/5 to-electric-blue/5 border-international-orange/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-international-orange/10 flex items-center justify-center shrink-0 mt-0.5">
              <Factory className="h-5 w-5 text-international-orange" />
            </div>
            <div>
              <h2 className="font-semibold text-sm mb-0.5">
                {ALL_TECHNIQUES.length}+ Manufacturing Techniques
              </h2>
              <p className="text-xs text-muted-foreground">
                Explore modern manufacturing methods — from 3D printing to CNC machining,
                injection molding to composite layup. Find the right process for your
                part, then connect with suppliers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <TechniqueFilters
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        costTier={costTier}
        onCostTierChange={setCostTier}
        batchSize={batchSize}
        onBatchSizeChange={setBatchSize}
        categoryCounts={categoryCounts}
        resultCount={filteredTechniques.length}
        totalCount={ALL_TECHNIQUES.length}
      />

      {/* Technique grid */}
      {filteredTechniques.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h3 className="text-base font-semibold mb-1">No techniques found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-3">
              Try adjusting your search or filters to find manufacturing techniques.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCategory(null)
                setSearchQuery('')
                setCostTier(null)
                setBatchSize(null)
              }}
              className="gap-1.5"
            >
              Clear all filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
          {filteredTechniques.map(technique => (
            <TechniqueCard
              key={technique.id}
              technique={technique}
              onClick={() => setSelectedTechnique(technique)}
            />
          ))}
        </div>
      )}

      {/* Marketplace CTA */}
      <Card className="bg-gradient-to-r from-international-orange/5 to-background border-international-orange/20">
        <CardContent className="py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-international-orange/10 flex items-center justify-center shrink-0">
              <Store className="h-5 w-5 text-international-orange" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">
                Ready to manufacture?
              </h3>
              <p className="text-xs text-muted-foreground">
                Browse verified manufacturing partners in the marketplace or
                submit an RFQ to get competitive quotes.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-international-orange/30 text-international-orange hover:bg-international-orange/5"
              >
                <Link href="/marketplace">
                  Marketplace
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/rfq/create">
                  Start RFQ
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <TechniqueDetailDialog
        technique={selectedTechnique}
        open={!!selectedTechnique}
        onOpenChange={open => {
          if (!open) setSelectedTechnique(null)
        }}
        onViewRelated={handleViewRelated}
      />
    </div>
  )
}
