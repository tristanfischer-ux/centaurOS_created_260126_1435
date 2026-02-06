'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Lightbulb,
  Search,
  X,
  Sparkles,
  Store,
  ArrowRight,
  Heart,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { typography } from '@/lib/design-system'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { BlueprintTemplate } from '@/types/blueprints'
import type { ObjectivePack } from '@/actions/packs'
import { CategoryTabs, type TabId } from './components/category-tabs'
import { PackCard } from './components/pack-card'
import { IndustrySelector } from './components/industry-selector'
import { INDUSTRY_CATEGORIES, packMatchesCategory } from './components/utils'

// ---------------------------------------------------------------------------
// Recommendation engine (client-side, lightweight)
// Strategy: diverse categories, quick-wins first, exclude already-saved.
// ---------------------------------------------------------------------------

function getRecommendedPacks(
  allPacks: ObjectivePack[],
  savedIds: Set<string>,
): ObjectivePack[] {
  // Don't recommend things the user already saved – they can find those in "Saved"
  const candidates = allPacks.filter(p => !savedIds.has(p.id))

  // Score each candidate
  const scored = candidates.map(pack => {
    let score = 0
    // Prefer easy packs for discoverability
    if (pack.difficulty === 'Easy') score += 3
    if (pack.difficulty === 'Medium') score += 1
    // Prefer packs with more tasks (more value delivered)
    score += Math.min((pack.items?.length || 0) / 3, 2)
    // Prefer shorter durations (quicker wins)
    if (pack.estimated_duration?.includes('1-2')) score += 1
    return { pack, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // Category diversity – at most 2 packs from the same category
  const result: ObjectivePack[] = []
  const counts: Record<string, number> = {}

  for (const { pack } of scored) {
    const cat = pack.category || 'other'
    if ((counts[cat] || 0) >= 2) continue
    counts[cat] = (counts[cat] || 0) + 1
    result.push(pack)
    if (result.length >= 8) break
  }

  return result
}

// ---------------------------------------------------------------------------
// Main Inspiration page component
// ---------------------------------------------------------------------------

interface InspirationPageNewProps {
  templates?: BlueprintTemplate[]
  packs?: ObjectivePack[]
  initialSavedPackIds?: string[]
}

export function InspirationPageNew({
  templates = [],
  packs = [],
  initialSavedPackIds = [],
}: InspirationPageNewProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('for-you')

  // Saved packs
  const [savedPackIds, setSavedPackIds] = useState<Set<string>>(
    new Set(initialSavedPackIds),
  )

  // Search & filter (for business / subsystems tabs)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [sortBy, setSortBy] = useState<
    'relevance' | 'name' | 'difficulty' | 'duration'
  >('relevance')

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Reset filters on tab change
  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setDebouncedSearch('')
    setDifficultyFilter('all')
    setSortBy('relevance')
  }, [])

  useEffect(() => { clearFilters() }, [activeTab, clearFilters])

  // Save toggle
  const handleSaveToggle = useCallback((packId: string, isSaved: boolean) => {
    setSavedPackIds(prev => {
      const next = new Set(prev)
      if (isSaved) {
        next.add(packId)
      } else {
        next.delete(packId)
      }
      return next
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const businessPacks = useMemo(
    () => packs.filter(p => packMatchesCategory(p, 'business')),
    [packs],
  )
  const subsystemsPacks = useMemo(
    () => packs.filter(p => packMatchesCategory(p, 'subsystems')),
    [packs],
  )
  const industryCount = useMemo(
    () => templates.filter(t => INDUSTRY_CATEGORIES.has(t.product_category)).length,
    [templates],
  )
  const recommendedPacks = useMemo(
    () => getRecommendedPacks(packs, savedPackIds),
    [packs, savedPackIds],
  )
  const savedPacks = useMemo(
    () => packs.filter(p => savedPackIds.has(p.id)),
    [packs, savedPackIds],
  )

  // Filtered + sorted packs for business / subsystems
  const filteredPacks = useMemo(() => {
    if (activeTab !== 'business' && activeTab !== 'subsystems') return []

    const base = activeTab === 'business' ? businessPacks : subsystemsPacks
    let filtered = base

    // Text search
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      filtered = filtered.filter(
        p =>
          p.title?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.items?.some(i => i.title?.toLowerCase().includes(q)),
      )
    }

    // Difficulty
    if (difficultyFilter !== 'all') {
      filtered = filtered.filter(
        p => p.difficulty?.toLowerCase() === difficultyFilter.toLowerCase(),
      )
    }

    // Sort
    const sorted = [...filtered]
    switch (sortBy) {
      case 'name':
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        break
      case 'difficulty': {
        const order: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 }
        sorted.sort(
          (a, b) =>
            (order[a.difficulty || ''] || 2) - (order[b.difficulty || ''] || 2),
        )
        break
      }
      case 'duration':
        sorted.sort((a, b) => {
          const n = (s: string | null | undefined) => {
            const m = s?.match(/(\d+)/)
            return m ? parseInt(m[1]) : 999
          }
          return n(a.estimated_duration) - n(b.estimated_duration)
        })
        break
    }
    return sorted
  }, [activeTab, businessPacks, subsystemsPacks, debouncedSearch, difficultyFilter, sortBy])

  const availableDifficulties = useMemo(
    () => [...new Set(packs.map(p => p.difficulty).filter(Boolean))] as string[],
    [packs],
  )
  const hasActiveFilters = searchQuery.trim() !== '' || difficultyFilter !== 'all'

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ================================================================== */}
      {/* Page header                                                        */}
      {/* ================================================================== */}
      <div className="pb-4 border-b border-muted">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>
            <Lightbulb className="h-7 w-7 mr-3 inline-block text-international-orange" />
            Inspiration
          </h1>
        </div>
        <p className={cn(typography.pageSubtitle, 'mt-1')}>
          Discover what to do next. Turn ideas into objectives and tasks for your team.
        </p>
      </div>

      {/* ================================================================== */}
      {/* Category tabs                                                      */}
      {/* ================================================================== */}
      <CategoryTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        businessCount={businessPacks.length}
        subsystemsCount={subsystemsPacks.length}
        industryCount={industryCount}
        savedCount={savedPackIds.size}
      />

      {/* ================================================================== */}
      {/* Search bar (business / subsystems only)                            */}
      {/* ================================================================== */}
      {(activeTab === 'business' || activeTab === 'subsystems') && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search input */}
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search packs..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Sort + difficulty */}
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">Relevant</SelectItem>
                  <SelectItem value="name">Name A-Z</SelectItem>
                  <SelectItem value="difficulty">Difficulty</SelectItem>
                  <SelectItem value="duration">Duration</SelectItem>
                </SelectContent>
              </Select>

              <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {availableDifficulties.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs gap-1">
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
          </div>

          {/* Result count */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {filteredPacks.length} {filteredPacks.length === 1 ? 'pack' : 'packs'}
            </span>
            {hasActiveFilters && (
              <Badge variant="secondary" className="text-xs">Filtered</Badge>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* FOR YOU tab                                                        */}
      {/* ================================================================== */}
      {activeTab === 'for-you' && (
        <div className="space-y-8">
          {/* Recommended */}
          <section>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-international-orange" />
              <h2 className="text-lg font-semibold">Recommended for You</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Curated packs to help you take your next step — diverse categories, quick wins first.
            </p>

            {recommendedPacks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {recommendedPacks.map(pack => (
                  <PackCard
                    key={pack.id}
                    pack={pack}
                    isSaved={savedPackIds.has(pack.id)}
                    onSaveToggle={handleSaveToggle}
                  />
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center">
                  <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-muted-foreground text-sm">
                    Browse the Business or Subsystems tabs to discover packs and get personalised recommendations.
                  </p>
                </CardContent>
              </Card>
            )}
          </section>

          {/* Marketplace CTA */}
          <Card className="bg-gradient-to-r from-international-orange/5 to-background border-international-orange/20">
            <CardContent className="py-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-international-orange/10 flex items-center justify-center shrink-0">
                  <Store className="h-5 w-5 text-international-orange" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">Need expert help executing?</h3>
                  <p className="text-xs text-muted-foreground">
                    Browse advisors, consultants, and suppliers in the marketplace.
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-international-orange/30 text-international-orange hover:bg-international-orange/5"
                >
                  <Link href="/marketplace">
                    Browse Marketplace
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ================================================================== */}
      {/* BUSINESS / SUBSYSTEMS tabs                                         */}
      {/* ================================================================== */}
      {(activeTab === 'business' || activeTab === 'subsystems') && (
        <>
          {filteredPacks.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <h3 className="text-base font-semibold mb-1">No packs found</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-3">
                  {hasActiveFilters
                    ? 'Try adjusting your search or filters.'
                    : 'No packs available in this category yet.'}
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters} className="gap-1.5">
                    <X className="h-3.5 w-3.5" /> Clear filters
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
              {filteredPacks.map(pack => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  isSaved={savedPackIds.has(pack.id)}
                  onSaveToggle={handleSaveToggle}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ================================================================== */}
      {/* INDUSTRY tab                                                       */}
      {/* ================================================================== */}
      {activeTab === 'industry' && (
        <IndustrySelector
          templates={templates}
          savedPackIds={savedPackIds}
          onSaveToggle={handleSaveToggle}
        />
      )}

      {/* ================================================================== */}
      {/* SAVED tab                                                          */}
      {/* ================================================================== */}
      {activeTab === 'saved' && (
        <>
          {savedPacks.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Heart className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <h3 className="text-base font-semibold mb-1">No saved packs yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Click the heart icon on any pack to save it for later.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
              {savedPacks.map(pack => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  isSaved={true}
                  onSaveToggle={handleSaveToggle}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
