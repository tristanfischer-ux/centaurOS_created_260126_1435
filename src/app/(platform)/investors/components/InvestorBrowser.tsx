/**
 * @file InvestorBrowser.tsx
 *
 * @description Client component for the UK Investor Directory. Accepts server-fetched
 * initial data and handles all interactive filter state: firm type tabs, search input
 * (300ms debounce), active-deploying toggle, advanced filters, sort, view switching,
 * and pagination.
 *
 * URL sync: filters are reflected in the query string (?type=VC&active=1&q=sequoia&sort=match&view=grid)
 * so users can share/bookmark filtered views.
 */

'use client'

import { useState, useCallback, useEffect, useRef, useTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InvestorCard } from './InvestorCard'
import { InvestorSortSelect } from './InvestorSortSelect'
import { InvestorFilterPanel } from './InvestorFilterPanel'
import { InvestorCompareBar } from './InvestorCompareBar'
import { InvestorCompareDialog } from './InvestorCompareDialog'
import { InvestorShortlistBoard } from './InvestorShortlistBoard'
import { InvestorMapView } from './InvestorMapView'
import { InvestorExportMenu } from './InvestorExportMenu'
import { searchInvestors, addToShortlist, removeFromShortlist, computeMatchScores } from '@/actions/investors'
import { Search, X, RefreshCw, Building2, LayoutGrid, Kanban, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { InvestorFirm, ShortlistStage, InvestorTierAccess } from '@/actions/investors'
import type { SortOption } from './InvestorSortSelect'
import type { AdvancedFilters } from './InvestorFilterPanel'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIRM_TYPES = ['All', 'VC', 'PE', 'Growth'] as const
type FirmTypeFilter = typeof FIRM_TYPES[number]

const PAGE_SIZE = 24

type ViewMode = 'grid' | 'board' | 'map'

const EMPTY_ADVANCED: AdvancedFilters = {
  stages: [],
  sectors: [],
  geoFocus: [],
  chequeMin: undefined,
  chequeMax: undefined,
  minQuality: undefined,
  minHardwareFit: undefined,
  bvcaOnly: false,
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InvestorGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-72 w-full rounded-xl" />
      ))}
    </div>
  )
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
      <div className="rounded-full bg-muted p-4">
        <Building2 className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">No investors found</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Try adjusting your filters or search term.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onClear}>
        <X className="h-4 w-4 mr-2" />
        Clear filters
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface InvestorBrowserProps {
  initialFirms: InvestorFirm[]
  initialTotal: number
  initialHasMore: boolean
  initialMatchScores?: Record<string, number>
  initialShortlistIds?: Record<string, ShortlistStage>
  access?: InvestorTierAccess
  /** Product sector keywords for computing Product Fit badges */
  productSectors?: string[]
  /** Initial search query from semantic search hero (if any) */
  initialSearchQuery?: string
  /** Callback when search state changes (for loading indicator in parent) */
  onSearchStateChange?: (isLoading: boolean) => void
}

export function InvestorBrowser({
  initialFirms,
  initialTotal,
  initialHasMore,
  initialMatchScores = {},
  initialShortlistIds = {},
  access,
  productSectors = [],
  initialSearchQuery = '',
  onSearchStateChange,
}: InvestorBrowserProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // ---------------------------------------------------------------------------
  // Filter state
  // ---------------------------------------------------------------------------

  const [activeFirmType, setActiveFirmType] = useState<FirmTypeFilter>(() => {
    const t = searchParams.get('type') as FirmTypeFilter
    return FIRM_TYPES.includes(t) ? t : 'All'
  })
  const [activeOnly, setActiveOnly] = useState(() => searchParams.get('active') === '1')
  const [searchQuery, setSearchQuery] = useState(() => initialSearchQuery || searchParams.get('q') ?? '')
  const [debouncedQuery, setDebouncedQuery] = useState(() => initialSearchQuery || searchParams.get('q') ?? '')
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const s = searchParams.get('sort') as SortOption
    return ['match', 'fund_size', 'quality', 'hardware_fit', 'cheque', 'priority', 'name'].includes(s) ? s : 'name'
  })
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(() => {
    // SECURITY: Cap filter array lengths to prevent DoS via crafted URLs with hundreds of values
    const stages = (searchParams.get('stages')?.split(',').filter(Boolean) ?? []).slice(0, 20)
    const sectors = (searchParams.get('sectors')?.split(',').filter(Boolean) ?? []).slice(0, 20)
    const geoFocus = (searchParams.get('geo')?.split(',').filter(Boolean) ?? []).slice(0, 10)
    const chequeMinRaw = searchParams.get('chequeMin') ? Number(searchParams.get('chequeMin')) : undefined
    const chequeMaxRaw = searchParams.get('chequeMax') ? Number(searchParams.get('chequeMax')) : undefined
    const minQualityRaw = searchParams.get('minQuality') ? Number(searchParams.get('minQuality')) : undefined
    const minHardwareFitRaw = searchParams.get('minHwFit') ? Number(searchParams.get('minHwFit')) : undefined
    // Guard against NaN from tampered URL params (e.g. ?chequeMin=abc)
    const chequeMin = chequeMinRaw != null && !isNaN(chequeMinRaw) && chequeMinRaw > 0 ? chequeMinRaw : undefined
    const chequeMax = chequeMaxRaw != null && !isNaN(chequeMaxRaw) && chequeMaxRaw > 0 ? chequeMaxRaw : undefined
    const minQuality = minQualityRaw != null && !isNaN(minQualityRaw) && minQualityRaw > 0 ? minQualityRaw : undefined
    const minHardwareFit = minHardwareFitRaw != null && !isNaN(minHardwareFitRaw) && minHardwareFitRaw > 0 ? minHardwareFitRaw : undefined
    const bvcaOnly = searchParams.get('bvca') === '1'
    if (stages.length || sectors.length || geoFocus.length || chequeMin != null || chequeMax != null || minQuality != null || minHardwareFit != null || bvcaOnly) {
      return { stages, sectors, geoFocus, chequeMin, chequeMax, minQuality, minHardwareFit, bvcaOnly }
    }
    return EMPTY_ADVANCED
  })
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = searchParams.get('view') as ViewMode
    return ['grid', 'board', 'map'].includes(v) ? v : 'grid'
  })

  // Data state
  const hasUrlFilters = !!(searchParams.get('type') || searchParams.get('active') || searchParams.get('q')
    || searchParams.get('sort') || searchParams.get('stages') || searchParams.get('sectors')
    || searchParams.get('geo') || searchParams.get('chequeMin') || searchParams.get('chequeMax')
    || searchParams.get('minQuality') || searchParams.get('minHwFit') || searchParams.get('bvca'))

  const [firms, setFirms] = useState<InvestorFirm[]>(hasUrlFilters ? [] : initialFirms)
  const [total, setTotal] = useState(hasUrlFilters ? 0 : initialTotal)
  const [hasMore, setHasMore] = useState(hasUrlFilters ? false : initialHasMore)
  // GOTCHA: When URL has filters, initial data is empty and first refetch is pending.
  // Track whether the initial URL-driven fetch has completed to show skeleton instead of empty state.
  const [initialUrlFetchDone, setInitialUrlFetchDone] = useState(!hasUrlFilters)
  const [page, setPage] = useState(1)
  const [matchScores, setMatchScores] = useState<Record<string, number>>(initialMatchScores)
  const [shortlistIds, setShortlistIds] = useState<Record<string, ShortlistStage>>(initialShortlistIds)

  const [isPending, startTransition] = useTransition()
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const loadingMoreRef = useRef(false)

  // Compare state
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasEverFetched = useRef(hasUrlFilters)
  // SECURITY: Generation counter prevents stale load-more results from appending
  // when filters change mid-flight
  const filterGeneration = useRef(0)
  // Skip URL sync on initial mount to preserve UTM/ref params
  const urlSyncMounted = useRef(false)

  // ---------------------------------------------------------------------------
  // Debounce search query
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [searchQuery])

  // ---------------------------------------------------------------------------
  // Notify parent of search state changes (for loading indicator)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    onSearchStateChange?.(isPending)
  }, [isPending, onSearchStateChange])

  // ---------------------------------------------------------------------------
  // URL sync
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Skip initial mount to preserve unrecognized URL params (UTM, ref codes, etc.)
    if (!urlSyncMounted.current) {
      urlSyncMounted.current = true
      return
    }
    const params = new URLSearchParams()
    if (activeFirmType !== 'All') params.set('type', activeFirmType)
    if (activeOnly) params.set('active', '1')
    if (debouncedQuery) params.set('q', debouncedQuery)
    if (sortBy !== 'name') params.set('sort', sortBy)
    if (viewMode !== 'grid') params.set('view', viewMode)
    // Advanced filters
    if (advancedFilters.stages.length > 0) params.set('stages', advancedFilters.stages.join(','))
    if (advancedFilters.sectors.length > 0) params.set('sectors', advancedFilters.sectors.join(','))
    if (advancedFilters.geoFocus.length > 0) params.set('geo', advancedFilters.geoFocus.join(','))
    if (advancedFilters.chequeMin != null) params.set('chequeMin', String(advancedFilters.chequeMin))
    if (advancedFilters.chequeMax != null) params.set('chequeMax', String(advancedFilters.chequeMax))
    if (advancedFilters.minQuality != null) params.set('minQuality', String(advancedFilters.minQuality))
    if (advancedFilters.minHardwareFit != null) params.set('minHwFit', String(advancedFilters.minHardwareFit))
    if (advancedFilters.bvcaOnly) params.set('bvca', '1')
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [activeFirmType, activeOnly, debouncedQuery, sortBy, viewMode, advancedFilters, router, pathname])

  // ---------------------------------------------------------------------------
  // Refetch when filters change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (activeFirmType === 'All' && !activeOnly && !debouncedQuery && !hasEverFetched.current) {
      return
    }
    hasEverFetched.current = true
    filterGeneration.current += 1
    startTransition(async () => {
      try {
        const result = await searchInvestors({
          firmType: activeFirmType === 'All' ? undefined : [activeFirmType],
          activeOnly,
          query: debouncedQuery || undefined,
          stage: advancedFilters.stages.length > 0 ? advancedFilters.stages : undefined,
          sector: advancedFilters.sectors.length > 0 ? advancedFilters.sectors : undefined,
          geoFocus: advancedFilters.geoFocus.length > 0 ? advancedFilters.geoFocus : undefined,
          chequeMin: advancedFilters.chequeMin,
          chequeMax: advancedFilters.chequeMax,
          minQuality: advancedFilters.minQuality,
          minHardwareFit: advancedFilters.minHardwareFit,
          bvcaOnly: advancedFilters.bvcaOnly || undefined,
          sortBy: sortBy !== 'match' ? sortBy : 'name', // match sort is client-side
          page: 1,
          pageSize: PAGE_SIZE,
        })
        setFirms(result.firms)
        setTotal(result.total)
        setHasMore(result.hasMore)
        setPage(1)
        // Clear compare selection — old IDs may not be in new results
        setCompareIds([])
        // Compute match scores for new firms so match sort works after refetch
        if (result.firms.length > 0) {
          computeMatchScores(result.firms.map(f => f.id))
            .then(scores => setMatchScores(prev => ({ ...prev, ...scores })))
            .catch(() => { /* non-critical */ })
        }
        if (!initialUrlFetchDone) setInitialUrlFetchDone(true)
      } catch (err) {
        console.error('[InvestorBrowser] Filter search failed:', err)
        if (!initialUrlFetchDone) setInitialUrlFetchDone(true)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFirmType, activeOnly, debouncedQuery, advancedFilters, sortBy])

  // ---------------------------------------------------------------------------
  // Client-side match score sorting
  // ---------------------------------------------------------------------------

  // GOTCHA: Add title tiebreaker for stable ordering when match scores are equal
  const displayFirms = sortBy === 'match' && Object.keys(matchScores).length > 0
    ? [...firms].sort((a, b) => (matchScores[b.id] ?? 0) - (matchScores[a.id] ?? 0) || a.title.localeCompare(b.title))
    : firms

  // ---------------------------------------------------------------------------
  // Load more
  // ---------------------------------------------------------------------------

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    setIsLoadingMore(true)
    // Capture generation so we can discard stale results if filters changed mid-flight
    const gen = filterGeneration.current
    try {
      const nextPage = page + 1
      const result = await searchInvestors({
        firmType: activeFirmType === 'All' ? undefined : [activeFirmType],
        activeOnly,
        query: debouncedQuery || undefined,
        stage: advancedFilters.stages.length > 0 ? advancedFilters.stages : undefined,
        sector: advancedFilters.sectors.length > 0 ? advancedFilters.sectors : undefined,
        geoFocus: advancedFilters.geoFocus.length > 0 ? advancedFilters.geoFocus : undefined,
        chequeMin: advancedFilters.chequeMin,
        chequeMax: advancedFilters.chequeMax,
        minQuality: advancedFilters.minQuality,
        minHardwareFit: advancedFilters.minHardwareFit,
        bvcaOnly: advancedFilters.bvcaOnly || undefined,
        sortBy: sortBy !== 'match' ? sortBy : 'name',
        page: nextPage,
        pageSize: PAGE_SIZE,
      })
      // Discard results if filters changed while load-more was in flight
      if (gen !== filterGeneration.current) return
      // Use functional setState to dedup — avoids stale firms closure
      let newFirmIds: string[] = []
      setFirms(prev => {
        const existingIds = new Set(prev.map(f => f.id))
        const newFirms = result.firms.filter(f => !existingIds.has(f.id))
        newFirmIds = newFirms.map(f => f.id)
        return [...prev, ...newFirms]
      })
      setHasMore(result.hasMore)
      setPage(nextPage)

      // Compute match scores for new firms
      if (newFirmIds.length > 0) {
        computeMatchScores(newFirmIds)
          .then(scores => setMatchScores(prev => ({ ...prev, ...scores })))
          .catch(() => { /* non-critical */ })
      }
    } catch (err) {
      console.error('[InvestorBrowser] Load more failed:', err)
    } finally {
      loadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [page, activeFirmType, activeOnly, debouncedQuery, advancedFilters, sortBy])

  // ---------------------------------------------------------------------------
  // Shortlist handlers
  // ---------------------------------------------------------------------------

  const shortlistRef = useRef(shortlistIds)
  shortlistRef.current = shortlistIds

  const handleToggleShortlist = useCallback(async (firmId: string) => {
    const currentIds = shortlistRef.current
    const isShortlisted = firmId in currentIds
    const previousStage = currentIds[firmId]

    if (isShortlisted) {
      setShortlistIds(prev => {
        const next = { ...prev }
        delete next[firmId]
        return next
      })
      const { error } = await removeFromShortlist(firmId)
      if (error) {
        // Restore the actual previous stage, not a hardcoded default
        setShortlistIds(prev => ({ ...prev, [firmId]: previousStage }))
        toast.error('Failed to remove from shortlist')
      } else {
        toast.success('Removed from shortlist')
      }
    } else {
      setShortlistIds(prev => ({ ...prev, [firmId]: 'researching' }))
      const { error } = await addToShortlist(firmId)
      if (error) {
        setShortlistIds(prev => {
          const next = { ...prev }
          delete next[firmId]
          return next
        })
        toast.error('Failed to add to shortlist')
      } else {
        toast.success('Added to shortlist')
      }
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Compare handlers
  // ---------------------------------------------------------------------------

  const handleToggleCompare = useCallback((firmId: string) => {
    setCompareIds(prev => {
      if (prev.includes(firmId)) return prev.filter(id => id !== firmId)
      if (prev.length >= 3) {
        toast.error('Compare up to 3 firms')
        return prev
      }
      return [...prev, firmId]
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Clear filters
  // ---------------------------------------------------------------------------

  const handleClearFilters = useCallback(() => {
    setActiveFirmType('All')
    setActiveOnly(false)
    setSearchQuery('')
    setDebouncedQuery('')
    setAdvancedFilters(EMPTY_ADVANCED)
    setSortBy('name')
  }, [])

  // GOTCHA: Use debouncedQuery (not searchQuery) to match what's actually filtering results
  const hasActiveFilters = activeFirmType !== 'All' || activeOnly || debouncedQuery.length > 0
    || advancedFilters.stages.length > 0 || advancedFilters.sectors.length > 0
    || advancedFilters.geoFocus.length > 0 || advancedFilters.chequeMin != null
    || advancedFilters.chequeMax != null || advancedFilters.minQuality != null
    || advancedFilters.minHardwareFit != null || advancedFilters.bvcaOnly

  // Get firms for compare
  const compareFirms = compareIds
    .map(id => firms.find(f => f.id === id))
    .filter((f): f is InvestorFirm => f != null)

  return (
    <div className={cn("space-y-6", compareIds.length > 0 && "pb-16")}>
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        {/* Firm type chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {FIRM_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setActiveFirmType(type)}
              aria-pressed={activeFirmType === type}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200',
                activeFirmType === type
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-foreground border-border hover:border-foreground/40'
              )}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Active deploying toggle */}
        <button
          onClick={() => setActiveOnly(prev => !prev)}
          aria-pressed={activeOnly}
          className={cn(
            'px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200',
            activeOnly
              ? 'bg-success/10 text-success border-success/40'
              : 'bg-background text-muted-foreground border-border hover:border-foreground/40'
          )}
        >
          Active deploying
        </button>

        {/* Search */}
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search investors..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Sort + Export + View toggle */}
        <div className="flex items-center gap-3 ml-auto">
          {access && <InvestorExportMenu firms={displayFirms} matchScores={matchScores} access={access} />}
          <InvestorSortSelect value={sortBy} onChange={setSortBy} />
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            {([
              { mode: 'grid' as const, icon: LayoutGrid, label: 'Grid view' },
              { mode: 'board' as const, icon: Kanban, label: 'Board view' },
              { mode: 'map' as const, icon: MapPin, label: 'Map view' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                aria-label={label}
                aria-pressed={viewMode === mode}
                className={cn(
                  'p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors',
                  viewMode === mode
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Advanced filters */}
      <InvestorFilterPanel
        filters={advancedFilters}
        onChange={setAdvancedFilters}
        onClear={() => setAdvancedFilters(EMPTY_ADVANCED)}
      />

      {/* Stats row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {isPending ? (
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Filtering…
              </span>
            ) : (
              <>
                Showing{' '}
                <span className="font-semibold text-foreground">{displayFirms.length}</span>
                {' '}of{' '}
                <span className="font-semibold text-foreground">{total}</span>
                {' '}firms
              </>
            )}
          </p>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-xs">
            <X className="h-3.5 w-3.5 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Grid / Board / Map views */}
      {viewMode === 'grid' && (
        <>
          {(isPending && displayFirms.length === 0) || !initialUrlFetchDone ? (
            <InvestorGridSkeleton />
          ) : displayFirms.length === 0 && !isPending ? (
            <EmptyState onClear={handleClearFilters} />
          ) : (
            <>
              <div className={cn(
                "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
                isPending && "opacity-60 pointer-events-none transition-opacity"
              )}>
                {displayFirms.map(firm => (
                  <InvestorCard
                    key={firm.id}
                    firm={firm}
                    matchScore={matchScores[firm.id]}
                    productFit={
                      productSectors.length > 0 && Array.isArray(firm.attributes.sectors) && firm.attributes.sectors.length > 0
                        ? (() => {
                            const investorSectors = firm.attributes.sectors.map(s => s.toLowerCase())
                            const overlap = productSectors.filter(ps =>
                              investorSectors.some(is => is.includes(ps) || ps.includes(is))
                            ).length
                            if (overlap >= 3) return 'strong' as const
                            if (overlap >= 1) return 'partial' as const
                            return undefined
                          })()
                        : undefined
                    }
                    isShortlisted={firm.id in shortlistIds}
                    onToggleShortlist={() => handleToggleShortlist(firm.id)}
                    isCompareSelected={compareIds.includes(firm.id)}
                    onToggleCompare={() => handleToggleCompare(firm.id)}
                  />
                ))}
              </div>

              {hasMore && (
                <div className="flex flex-col items-center gap-2 pt-6">
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore || isPending}
                    className="min-w-[200px]"
                  >
                    {isLoadingMore ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      `Load more (${Math.max(0, total - displayFirms.length)} remaining)`
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Showing {displayFirms.length} of {total}
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {viewMode === 'board' && (
        <InvestorShortlistBoard />
      )}

      {viewMode === 'map' && (
        <InvestorMapView firms={displayFirms} />
      )}

      {/* Compare bar */}
      {compareIds.length > 0 && (
        <InvestorCompareBar
          firms={compareFirms}
          matchScores={matchScores}
          onRemove={(id) => setCompareIds(prev => prev.filter(x => x !== id))}
          onClear={() => setCompareIds([])}
          onCompare={() => setShowCompare(true)}
        />
      )}

      {/* Compare dialog */}
      <InvestorCompareDialog
        open={showCompare}
        onOpenChange={setShowCompare}
        firms={compareFirms}
        matchScores={matchScores}
      />
    </div>
  )
}
