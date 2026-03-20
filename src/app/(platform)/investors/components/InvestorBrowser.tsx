/**
 * @file InvestorBrowser.tsx
 *
 * @description Client component for the UK Investor Directory. Accepts server-fetched
 * initial data and handles all interactive filter state: firm type tabs, search input
 * (300ms debounce), active-deploying toggle, and pagination. Re-fetches from the
 * searchInvestors server action when filters change.
 *
 * URL sync: filters are reflected in the query string (?type=VC&active=1&q=sequoia)
 * so users can share/bookmark filtered views. Initialises state from URL params on mount.
 */

'use client'

import { useState, useCallback, useEffect, useRef, useTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InvestorCard } from './InvestorCard'
import { searchInvestors } from '@/actions/investors'
import { Search, X, RefreshCw, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InvestorFirm } from '@/actions/investors'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIRM_TYPES = ['All', 'VC', 'PE', 'Growth'] as const
type FirmTypeFilter = typeof FIRM_TYPES[number]

const PAGE_SIZE = 24

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Skeleton grid shown while fetching.
 */
function InvestorGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-72 w-full rounded-xl" />
      ))}
    </div>
  )
}

/**
 * Empty state shown when no results match current filters.
 */
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
}

/**
 * Interactive investor directory browser with filtering, search, and URL-synced state.
 *
 * @description Wraps the InvestorCard grid with client-side filter controls.
 * Debounces the search input at 300ms. Firm type tabs and active-only toggle trigger
 * immediate refetches. Filter state is synced to the URL query string so filtered
 * views can be shared or bookmarked.
 *
 * @param initialFirms - Server-side pre-fetched first page
 * @param initialTotal - Total count from server (for stats row)
 * @param initialHasMore - Whether more pages exist
 */
export function InvestorBrowser({
  initialFirms,
  initialTotal,
  initialHasMore,
}: InvestorBrowserProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // ---------------------------------------------------------------------------
  // Filter state — initialised from URL params so shared links restore state
  // ---------------------------------------------------------------------------

  const [activeFirmType, setActiveFirmType] = useState<FirmTypeFilter>(() => {
    const t = searchParams.get('type') as FirmTypeFilter
    return FIRM_TYPES.includes(t) ? t : 'All'
  })
  const [activeOnly, setActiveOnly] = useState(() => searchParams.get('active') === '1')
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
  const [debouncedQuery, setDebouncedQuery] = useState(() => searchParams.get('q') ?? '')

  // DECISION: When URL has filters on mount, start with empty data so the skeleton
  // shows while fetching the filtered set. When no URL filters, use SSR data directly
  // and skip the initial refetch to avoid a redundant round-trip.
  const hasUrlFilters = !!(searchParams.get('type') || searchParams.get('active') || searchParams.get('q'))

  const [firms, setFirms] = useState<InvestorFirm[]>(hasUrlFilters ? [] : initialFirms)
  const [total, setTotal] = useState(hasUrlFilters ? 0 : initialTotal)
  const [hasMore, setHasMore] = useState(hasUrlFilters ? false : initialHasMore)
  const [page, setPage] = useState(1)

  const [isPending, startTransition] = useTransition()
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // INTENT: Track whether we've ever client-fetched. Without this, clearing filters
  // back to defaults hits the guard (firms.length > 0 with stale data) and skips refetch.
  const hasEverFetched = useRef(hasUrlFilters)

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
  // Sync filters → URL (replace, not push, to avoid polluting browser history)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const params = new URLSearchParams()
    if (activeFirmType !== 'All') params.set('type', activeFirmType)
    if (activeOnly) params.set('active', '1')
    if (debouncedQuery) params.set('q', debouncedQuery)
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [activeFirmType, activeOnly, debouncedQuery, router, pathname])

  // ---------------------------------------------------------------------------
  // Refetch when filters change (always back to page 1)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // INTENT: Skip redundant refetch when at default filters and SSR data is loaded.
    // Once we've fetched at least once (filters were applied), always refetch on change
    // — even back to defaults — so clearing filters reloads the full unfiltered set.
    if (activeFirmType === 'All' && !activeOnly && !debouncedQuery && !hasEverFetched.current) {
      return
    }
    hasEverFetched.current = true
    startTransition(async () => {
      try {
        const result = await searchInvestors({
          firmType: activeFirmType === 'All' ? undefined : [activeFirmType],
          activeOnly,
          query: debouncedQuery || undefined,
          page: 1,
          pageSize: PAGE_SIZE,
        })
        setFirms(result.firms)
        setTotal(result.total)
        setHasMore(result.hasMore)
        setPage(1)
      } catch (err) {
        console.error('[InvestorBrowser] Filter search failed:', err)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFirmType, activeOnly, debouncedQuery])

  // ---------------------------------------------------------------------------
  // Load more (append next page)
  // ---------------------------------------------------------------------------

  const handleLoadMore = useCallback(async () => {
    setIsLoadingMore(true)
    try {
      const nextPage = page + 1
      const result = await searchInvestors({
        firmType: activeFirmType === 'All' ? undefined : [activeFirmType],
        activeOnly,
        query: debouncedQuery || undefined,
        page: nextPage,
        pageSize: PAGE_SIZE,
      })
      setFirms(prev => {
        const existingIds = new Set(prev.map(f => f.id))
        const newFirms = result.firms.filter(f => !existingIds.has(f.id))
        return [...prev, ...newFirms]
      })
      setHasMore(result.hasMore)
      setPage(nextPage)
    } catch (err) {
      console.error('[InvestorBrowser] Load more failed:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [page, activeFirmType, activeOnly, debouncedQuery])

  const handleClearFilters = useCallback(() => {
    setActiveFirmType('All')
    setActiveOnly(false)
    setSearchQuery('')
    setDebouncedQuery('')
  }, [])

  const hasActiveFilters = activeFirmType !== 'All' || activeOnly || searchQuery.length > 0

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        {/* Firm type chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {FIRM_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setActiveFirmType(type)}
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
        <div className="relative flex-1 min-w-[200px] max-w-sm">
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
      </div>

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
                <span className="font-semibold text-foreground">{firms.length}</span>
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

      {/* Grid / states */}
      {isPending && firms.length === 0 ? (
        <InvestorGridSkeleton />
      ) : firms.length === 0 && !isPending ? (
        <EmptyState onClear={handleClearFilters} />
      ) : (
        <>
          <div className={cn(
            "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
            isPending && "opacity-60 pointer-events-none transition-opacity"
          )}>
            {firms.map(firm => (
              <InvestorCard key={firm.id} firm={firm} />
            ))}
          </div>

          {/* Load more */}
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
                  `Load more (${total - firms.length} remaining)`
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Showing {firms.length} of {total}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
