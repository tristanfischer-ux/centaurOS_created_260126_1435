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
  AlertCircle,
  TrendingUp,
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
import type { FoundryContext } from '@/actions/foundry-context'
import { CategoryTabs, type TabId } from './components/category-tabs'
import { PackCard } from './components/pack-card'
import { IndustrySelector } from './components/industry-selector'
import { INDUSTRY_CATEGORIES, packMatchesCategory } from './components/utils'
import { TechniquesExplorer } from '@/components/techniques'
import { ALL_TECHNIQUES } from '@/lib/manufacturing-techniques'

// ---------------------------------------------------------------------------
// Context-aware recommendation engine
// Uses foundry context (industry, stage, gaps) to personalise results and
// generate a "why" tag for each recommended pack.
// ---------------------------------------------------------------------------

interface ScoredPack {
  pack: ObjectivePack
  score: number
  whyTag: string
}

function getContextAwareRecommendations(
  allPacks: ObjectivePack[],
  savedIds: Set<string>,
  ctx: FoundryContext | null,
): ScoredPack[] {
  const candidates = allPacks.filter(p => !savedIds.has(p.id))

  const scored: ScoredPack[] = candidates.map(pack => {
    let score = 0
    const reasons: string[] = []
    const cat = pack.category?.toLowerCase() || ''

    // 1. Gap match: highest priority -- pack addresses a known gap
    if (ctx?.gapCategories && ctx.gapCategories.length > 0) {
      const gapMatch = ctx.gapCategories.some(gc =>
        cat.includes(gc.toLowerCase().replace(/[& ]/g, ''))
      )
      if (gapMatch) {
        score += 10
        const matchedGap = ctx.gapCategories.find(gc =>
          cat.includes(gc.toLowerCase().replace(/[& ]/g, ''))
        )
        reasons.push(`Addresses your ${matchedGap} gap`)
      }
    }

    // 2. Industry match: pack targets user's industry
    if (ctx?.industry && pack.product_category) {
      const industrySlug = ctx.industry.toLowerCase().replace(/\s+/g, '-')
      if (pack.product_category.toLowerCase().includes(industrySlug)) {
        score += 8
        reasons.push(`Matches your industry (${ctx.industry})`)
      }
    }

    // 3. Stage-appropriate: easy packs for early stage, harder for later
    const isEarlyStage = ctx?.stage && ['Idea', 'Pre-seed', 'Seed'].includes(ctx.stage)
    if (pack.difficulty === 'Easy') {
      score += isEarlyStage ? 5 : 3
      if (isEarlyStage && reasons.length === 0) reasons.push(`Great starting point for ${ctx?.stage} stage`)
    }
    if (pack.difficulty === 'Medium') score += 1

    // 4. Value density: more tasks = more value
    score += Math.min((pack.items?.length || 0) / 3, 2)

    // 5. Quick wins: shorter durations
    if (pack.estimated_duration?.includes('1-2')) {
      score += 1
      if (reasons.length === 0) reasons.push('Quick win -- under 2 weeks')
    }

    // Fallback reason
    if (reasons.length === 0) {
      if (pack.difficulty === 'Easy') reasons.push('Easy to get started')
      else reasons.push('Curated for you')
    }

    return { pack, score, whyTag: reasons[0] }
  })

  scored.sort((a, b) => b.score - a.score)

  // Category diversity -- at most 2 packs from the same category
  const result: ScoredPack[] = []
  const counts: Record<string, number> = {}

  for (const item of scored) {
    const cat = item.pack.category || 'other'
    if ((counts[cat] || 0) >= 2) continue
    counts[cat] = (counts[cat] || 0) + 1
    result.push(item)
    if (result.length >= 8) break
  }

  return result
}

// ---------------------------------------------------------------------------
// Stage-aware welcome banner
// ---------------------------------------------------------------------------

function StageWelcomeBanner({
  stage,
  industry,
  gapCategories,
}: {
  stage: string | null
  industry: string | null
  gapCategories: string[]
}) {
  const hasContext = stage || industry || gapCategories.length > 0

  if (!hasContext) {
    return (
      <Card className="bg-gradient-to-r from-international-orange/5 to-electric-blue/5 border-international-orange/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-international-orange/10 flex items-center justify-center shrink-0 mt-0.5">
              <Lightbulb className="h-5 w-5 text-international-orange" />
            </div>
            <div>
              <h2 className="font-semibold text-sm mb-0.5">Welcome to Inspiration</h2>
              <p className="text-xs text-muted-foreground">
                Discover objective packs to guide your next steps. Set your company stage and
                industry in{' '}
                <Link href="/settings" className="text-electric-blue hover:underline">
                  Settings
                </Link>{' '}
                for personalised recommendations.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Build contextual subtitle parts
  const parts: string[] = []
  if (stage) parts.push(`${stage} stage`)
  if (industry) parts.push(industry)

  return (
    <Card className="bg-gradient-to-r from-international-orange/5 to-electric-blue/5 border-international-orange/20">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-international-orange/10 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="h-5 w-5 text-international-orange" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm mb-0.5">
              Personalised for {parts.length > 0 ? parts.join(' \u00B7 ') : 'you'}
            </h2>
            {gapCategories.length > 0 ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertCircle className="h-3 w-3 text-status-warning shrink-0" />
                <span>
                  We noticed gaps in{' '}
                  <strong className="text-foreground">
                    {gapCategories.slice(0, 3).join(', ')}
                    {gapCategories.length > 3 ? ` +${gapCategories.length - 3} more` : ''}
                  </strong>
                  {' '}&mdash; we&apos;ve highlighted packs that can help.
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Recommendations tailored to where you are right now.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// "By Need" tab: packs grouped by business function category
// ---------------------------------------------------------------------------

const NEED_CATEGORIES = [
  { id: 'sales', label: 'Sales & Growth' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'finance', label: 'Finance' },
  { id: 'legal', label: 'Legal & Compliance' },
  { id: 'hr', label: 'People & HR' },
  { id: 'operations', label: 'Operations' },
  { id: 'product', label: 'Product' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'security', label: 'Security' },
  { id: 'startup', label: 'Startup Foundations' },
  { id: 'fundraising', label: 'Fundraising' },
  { id: 'infrastructure', label: 'Infrastructure' },
] as const

// ---------------------------------------------------------------------------
// Main Inspiration page component
// ---------------------------------------------------------------------------

interface InspirationPageNewProps {
  templates?: BlueprintTemplate[]
  packs?: ObjectivePack[]
  initialSavedPackIds?: string[]
  foundryContext?: FoundryContext
}

export function InspirationPageNew({
  templates = [],
  packs = [],
  initialSavedPackIds = [],
  foundryContext,
}: InspirationPageNewProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('for-you')

  // Saved packs
  const [savedPackIds, setSavedPackIds] = useState<Set<string>>(
    new Set(initialSavedPackIds),
  )

  // "By Need" selected category
  const [selectedNeed, setSelectedNeed] = useState<string | null>(null)

  // Search & filter (for by-need tab)
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

  useEffect(() => {
    clearFilters()
    setSelectedNeed(null)
  }, [activeTab, clearFilters])

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

  // All business + subsystem packs combined for "By Need"
  const allFunctionalPacks = useMemo(
    () => packs.filter(p =>
      packMatchesCategory(p, 'business') || packMatchesCategory(p, 'subsystems')
    ),
    [packs],
  )

  const industryCount = useMemo(
    () => templates.filter(t => INDUSTRY_CATEGORIES.has(t.product_category)).length,
    [templates],
  )

  const ctx = foundryContext || null

  // Context-aware recommendations with "why" tags
  const recommendedPacks = useMemo(
    () => getContextAwareRecommendations(packs, savedPackIds, ctx),
    [packs, savedPackIds, ctx],
  )

  const savedPacks = useMemo(
    () => packs.filter(p => savedPackIds.has(p.id)),
    [packs, savedPackIds],
  )

  // Popular packs (all packs sorted by task count -- proxy for popularity)
  const popularPacks = useMemo(() => {
    return [...packs]
      .sort((a, b) => (b.items?.length || 0) - (a.items?.length || 0))
      .slice(0, 12)
  }, [packs])

  // "By Need" grouped packs
  const needGroups = useMemo(() => {
    return NEED_CATEGORIES
      .map(nc => ({
        ...nc,
        packs: allFunctionalPacks.filter(p => {
          const cat = p.category?.toLowerCase() || ''
          return cat.includes(nc.id)
        }),
        hasGap: ctx?.gapCategories.some(gc =>
          gc.toLowerCase().replace(/[& ]/g, '').includes(nc.id) ||
          nc.id.includes(gc.toLowerCase().replace(/[& ]/g, ''))
        ) || false,
      }))
      .filter(g => g.packs.length > 0)
  }, [allFunctionalPacks, ctx])

  // Packs for selected need, filtered
  const filteredNeedPacks = useMemo(() => {
    if (!selectedNeed) return []
    const group = needGroups.find(g => g.id === selectedNeed)
    if (!group) return []
    let filtered = group.packs

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
  }, [selectedNeed, needGroups, debouncedSearch, difficultyFilter, sortBy])

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
      {/* Stage-aware welcome banner                                         */}
      {/* ================================================================== */}
      <StageWelcomeBanner
        stage={ctx?.stage || null}
        industry={ctx?.industry || null}
        gapCategories={ctx?.gapCategories || []}
      />

      {/* ================================================================== */}
      {/* Category tabs (reorganised: For You, By Need, By Industry, Popular, Saved) */}
      {/* ================================================================== */}
      <CategoryTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        byNeedCount={allFunctionalPacks.length}
        industryCount={industryCount}
        popularCount={popularPacks.length}
        savedCount={savedPackIds.size}
        techniquesCount={ALL_TECHNIQUES.length}
        gapCount={ctx?.gapCategories.length}
      />

      {/* ================================================================== */}
      {/* FOR YOU tab -- context-aware recommendations                       */}
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
              {ctx?.gapCategories && ctx.gapCategories.length > 0
                ? 'Packs selected based on your industry, company stage, and coverage gaps.'
                : ctx?.stage || ctx?.industry
                  ? `Packs tailored to ${[ctx?.stage && `${ctx.stage} stage`, ctx?.industry].filter(Boolean).join(', ')}.`
                  : 'Curated packs to help you take your next step -- diverse categories, quick wins first.'}
            </p>

            {recommendedPacks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {recommendedPacks.map(({ pack, whyTag }) => (
                  <PackCard
                    key={pack.id}
                    pack={pack}
                    isSaved={savedPackIds.has(pack.id)}
                    onSaveToggle={handleSaveToggle}
                    whyTag={whyTag}
                  />
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center">
                  <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-muted-foreground text-sm">
                    Browse the other tabs to discover packs and get personalised recommendations.
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
      {/* BY NEED tab -- packs grouped by business function                  */}
      {/* ================================================================== */}
      {activeTab === 'by-need' && !selectedNeed && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select a business function to explore relevant objective packs.
            {ctx?.gapCategories && ctx.gapCategories.length > 0 && (
              <> Categories with <Badge variant="secondary" className="text-[10px] mx-1 bg-status-warning-light text-status-warning-dark">gaps</Badge> are areas where you have coverage gaps.</>
            )}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {needGroups.map(group => (
              <Card
                key={group.id}
                className={cn(
                  'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
                  group.hasGap
                    ? 'border-status-warning/40 hover:border-status-warning'
                    : 'hover:border-electric-blue/40',
                )}
                onClick={() => setSelectedNeed(group.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">{group.label}</h3>
                    <div className="flex items-center gap-1.5">
                      {group.hasGap && (
                        <Badge variant="secondary" className="text-[9px] bg-status-warning-light text-status-warning-dark">
                          Gap
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {group.packs.length} {group.packs.length === 1 ? 'pack' : 'packs'}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {group.packs.slice(0, 3).map(p => p.title).join(', ')}
                    {group.packs.length > 3 ? ` +${group.packs.length - 3} more` : ''}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* By Need -- selected category with search/filter */}
      {activeTab === 'by-need' && selectedNeed && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedNeed(null)}
              className="-ml-2"
            >
              <ArrowRight className="h-4 w-4 mr-1 rotate-180" />
              All Needs
            </Button>
            <div className="h-4 w-px bg-border" />
            <h3 className="font-semibold">
              {needGroups.find(g => g.id === selectedNeed)?.label}
            </h3>
            {needGroups.find(g => g.id === selectedNeed)?.hasGap && (
              <Badge variant="secondary" className="text-[9px] bg-status-warning-light text-status-warning-dark">
                Coverage Gap
              </Badge>
            )}
          </div>

          {/* Search bar */}
          <div className="flex flex-col sm:flex-row gap-3">
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
              {filteredNeedPacks.length} {filteredNeedPacks.length === 1 ? 'pack' : 'packs'}
            </span>
            {hasActiveFilters && (
              <Badge variant="secondary" className="text-xs">Filtered</Badge>
            )}
          </div>

          {/* Pack grid */}
          {filteredNeedPacks.length === 0 ? (
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
              {filteredNeedPacks.map(pack => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  isSaved={savedPackIds.has(pack.id)}
                  onSaveToggle={handleSaveToggle}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* BY INDUSTRY tab (auto-selects user's industry)                     */}
      {/* ================================================================== */}
      {activeTab === 'by-industry' && (
        <IndustrySelector
          templates={templates}
          savedPackIds={savedPackIds}
          onSaveToggle={handleSaveToggle}
          defaultIndustry={ctx?.industry || undefined}
        />
      )}

      {/* ================================================================== */}
      {/* TECHNIQUES tab — Manufacturing Techniques Explorer                 */}
      {/* ================================================================== */}
      {activeTab === 'techniques' && <TechniquesExplorer />}

      {/* ================================================================== */}
      {/* POPULAR tab                                                        */}
      {/* ================================================================== */}
      {activeTab === 'popular' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-5 w-5 text-status-success" />
            <h2 className="text-lg font-semibold">Popular Packs</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            The most comprehensive packs used across the platform.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
            {popularPacks.map(pack => (
              <PackCard
                key={pack.id}
                pack={pack}
                isSaved={savedPackIds.has(pack.id)}
                onSaveToggle={handleSaveToggle}
              />
            ))}
          </div>
        </div>
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
