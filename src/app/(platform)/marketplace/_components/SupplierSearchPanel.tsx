'use client'

/**
 * @file SupplierSearchPanel.tsx
 *
 * @description Interactive supplier search panel with pre-search directory charts.
 *
 * Layout (mirrors the investor /investors page pattern):
 *   1. SupplierStatsCharts — visible ONLY when no active search; hides when results render
 *   2. Search textarea + category filter chips
 *   3. Results count bar
 *   4. Supplier match cards (Forge Capital card structure via SupplierMatchCard)
 *
 * FLOW:
 *   - On load: shows SupplierStatsCharts (pre-search) + initial listings (browse all)
 *   - On submit: hides charts, shows ranked match cards
 *   - On clear: charts reappear
 *
 * URL PARAMS (Fix 1 — back-nav state restore):
 *   - ?q=<search text> — populates the search box and auto-runs the search on mount
 *   - ?saved=1 — shows the "Saved" filter view on mount
 *   - Form submit pushes ?q=... to the URL so back-nav restores state
 *
 * FAVOURITES (Fix 2):
 *   - Heart icon on each card + "Saved" filter chip
 *   - Uses saved_marketplace_listings table via saved-suppliers server actions
 *
 * LOADING STATE (Fix 3):
 *   - Search button immediately shows "Searching…" with a spinner on submit,
 *     before the server action returns.
 *
 * DECISION: SupplierStatsCharts is defined inline in this file (not a separate file)
 * per the brief's "keep file count to the three above" constraint.
 * DECISION: stats are fetched in the server page (page.tsx) and passed as a prop
 * because this is a client component and cannot await server actions directly.
 */

import { useState, useTransition, useCallback, useRef, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { Search, Loader2, X, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SupplierMatchCard } from './SupplierMatchCard'
import { SupplierExtractedPills, parseSupplierQuery } from './SupplierExtractedPills'
import type { ExtractedSupplierQuery } from './SupplierExtractedPills'
import { searchSuppliers } from '@/actions/suppliers'
import { saveSupplierListing, unsaveSupplierListing } from '@/actions/saved-suppliers'
import type { SupplierDirectoryStats } from '@/actions/suppliers'
import type { MarketplaceListing } from '@/actions/marketplace'

// ---------------------------------------------------------------------------
// Brand-orange monochromatic chart palette
// ---------------------------------------------------------------------------
// Tristan 2026-04-28 (design audit cross-cutting fix #2): replaced the
// indigo/cyan/pink/amber/emerald/red rainbow with a brand-orange-derived
// ramp + neutral breaks. Audit P0: "charts on /marketplace fight the
// established #ff4500 accent."

const COLORS = [
  '#ff4500', // international-orange (primary)
  '#fb923c', // orange-400
  '#fdba74', // orange-300
  '#fed7aa', // orange-200
  '#94a3b8', // slate-400 (neutral break for >4 segments)
  '#64748b', // slate-500
  '#475569', // slate-600
  '#334155', // slate-700
  '#1e293b', // slate-800
  '#fde68a', // amber-200 (warm last-resort)
]

const BAR_COLOR_CAPABILITIES = '#ff4500' // international-orange — primary
const BAR_COLOR_MATERIALS    = '#fb923c' // orange-400 — secondary

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

// ---------------------------------------------------------------------------
// Stat tile (mirrors InvestorStatsCharts StatTile)
// ---------------------------------------------------------------------------

function StatTile({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="bg-card shadow-sm rounded-xl px-5 py-4 text-center">
      <div className="text-2xl font-black text-foreground leading-none mb-1">
        {value == null ? '—' : typeof value === 'number' ? fmt(value) : value}
      </div>
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SupplierStatsCharts — inline chart block (no separate file per brief constraint)
// ---------------------------------------------------------------------------

interface SupplierStatsChartsProps {
  stats: SupplierDirectoryStats
}

function SupplierStatsCharts({ stats }: SupplierStatsChartsProps) {
  const tooltipStyle = {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: '12px',
  }

  const tickStyle = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' }
  const gridStroke = 'hsl(var(--border))'

  return (
    <div className="space-y-6 mt-2 mb-8">
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="h-5 w-1 bg-muted-foreground/40 rounded-full" />
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Directory overview — {fmt(stats.total)} suppliers
        </span>
      </div>

      {/* ── Stat tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total suppliers"        value={stats.total} />
        <StatTile label="Verified"               value={stats.verified} />
        <StatTile label="With certifications"    value={stats.withCertifications} />
        <StatTile label="Countries represented"  value={stats.countries} />
      </div>

      {/* ── Charts grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Suppliers by Category — donut, 55% cutout, legend right */}
        <div className="bg-card shadow-sm rounded-xl p-5">
          <h4 className="text-sm font-bold text-foreground mb-4">Suppliers by Category</h4>
          {stats.categoryBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stats.categoryBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="40%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {stats.categoryBreakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => [fmt(Number(value)), String(name)]}
                  contentStyle={tooltipStyle}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>
                      {value.length > 16 ? value.slice(0, 15) + '…' : value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Suppliers by Country — donut, COLORS palette, legend right */}
        <div className="bg-card shadow-sm rounded-xl p-5">
          <h4 className="text-sm font-bold text-foreground mb-4">Suppliers by Country</h4>
          {stats.suppliersByCountry.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stats.suppliersByCountry}
                  dataKey="value"
                  nameKey="name"
                  cx="40%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {stats.suppliersByCountry.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => [fmt(Number(value)), String(name)]}
                  contentStyle={tooltipStyle}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>
                      {value.length > 16 ? value.slice(0, 15) + '…' : value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Capabilities — horizontal bar, #4f46e5, borderRadius 4, no legend */}
        <div className="bg-card shadow-sm rounded-xl p-5">
          <h4 className="text-sm font-bold text-foreground mb-4">Top Capabilities</h4>
          {stats.topCapabilities.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">No data yet</p>
          ) : (
            // Height grows with item count so all 10 y-axis labels render
            // (default Recharts hides labels when bar height < ~22px).
            <ResponsiveContainer width="100%" height={Math.max(260, stats.topCapabilities.length * 26)}>
              <BarChart
                data={stats.topCapabilities}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStroke} />
                <XAxis
                  type="number"
                  tick={tickStyle}
                  tickFormatter={fmt}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  interval={0}
                  tick={tickStyle}
                  tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 17) + '…' : v}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [fmt(Number(value)), 'Suppliers']}
                  contentStyle={tooltipStyle}
                />
                {/* Forge Capital: single colour #4f46e5cc, borderRadius:4, horizontal */}
                <Bar dataKey="value" fill={BAR_COLOR_CAPABILITIES} fillOpacity={0.8} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Materials — horizontal bar (categorical Y-axis).
            2026-04-28: switched from vertical-bar with rotated x-axis
            labels to horizontal-bar layout so the material names don't
            collide on a 375px-wide chart. Mirrors the Top Capabilities
            chart pattern above which already renders cleanly on mobile. */}
        <div className="bg-card shadow-sm rounded-xl p-5">
          <h4 className="text-sm font-bold text-foreground mb-4">Top Materials</h4>
          {stats.topMaterials.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, stats.topMaterials.length * 26)}>
              <BarChart
                data={stats.topMaterials}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStroke} />
                <XAxis
                  type="number"
                  tick={tickStyle}
                  tickFormatter={fmt}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  interval={0}
                  tick={tickStyle}
                  tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 17) + '…' : v}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [fmt(Number(value)), 'Suppliers']}
                  contentStyle={tooltipStyle}
                />
                <Bar dataKey="value" fill={BAR_COLOR_MATERIALS} fillOpacity={0.8} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category chips — mirrors the mockup's filter pills
// ---------------------------------------------------------------------------

const CATEGORY_CHIPS = [
  { label: 'CNC machining', query: 'CNC machining precision parts' },
  { label: 'PCB assembly', query: 'PCB assembly SMT electronics manufacturing' },
  { label: 'Sheet metal', query: 'sheet metal fabrication laser cutting bending' },
  { label: 'Injection moulding', query: 'injection moulding plastic parts' },
  { label: 'Casting & forging', query: 'casting forging metal parts' },
  { label: '3D printing', query: '3D printing additive manufacturing prototyping' },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MappedListing = MarketplaceListing & { similarity?: number }

interface SupplierSearchPanelProps {
  /** Initial server-fetched listings (browse all, no query) */
  initialListings: MarketplaceListing[]
  /** Total supplier count for the count badge */
  totalCount: number
  /** Pre-fetched directory stats for the chart block */
  stats: SupplierDirectoryStats
  /** Initial query from URL ?q= param — triggers auto-search on mount */
  initialQuery?: string
  /** Whether to open the Saved filter view on mount (?saved=1) */
  initialShowSaved?: boolean
  /** Listing IDs the user has already saved — pre-populated from the server */
  initialSavedIds?: string[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SupplierSearchPanel({
  initialListings,
  totalCount,
  stats,
  initialQuery = '',
  initialShowSaved = false,
  initialSavedIds = [],
}: SupplierSearchPanelProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [query, setQuery] = useState(initialQuery)
  const [activeChip, setActiveChip] = useState<string | null>(null)
  const [results, setResults] = useState<MappedListing[]>(
    initialListings as MappedListing[]
  )
  const [displayCount, setDisplayCount] = useState(initialListings.length)
  const [activeQuery, setActiveQuery] = useState<string>(initialQuery)
  const [extractedQuery, setExtractedQuery] = useState<ExtractedSupplierQuery | null>(
    initialQuery ? parseSupplierQuery(initialQuery) : null
  )
  const [isPending, startTransition] = useTransition()
  // FIX 3: optimistic loading state — flips to true immediately on button
  // click so the user sees "Searching…" before the server action returns.
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // FIX 2: Favourites state
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(initialSavedIds))
  const [showSaved, setShowSaved] = useState(initialShowSaved)
  // Track in-flight save/unsave per card
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())

  // INTENT: Charts are visible pre-search and hidden when a search result set
  // is active — mirrors the investor page pattern.
  const isFiltered = activeQuery.trim().length > 0

  // FIX 1: Auto-run search on mount if there's an initialQuery from the URL.
  // Use a ref to ensure it only fires once even in StrictMode double-invocation.
  const didAutoSearch = useRef(false)
  useEffect(() => {
    if (initialQuery && !didAutoSearch.current) {
      didAutoSearch.current = true
      runSearchInternal(initialQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Core search logic (extracted so auto-search and handleSubmit share it)
  // ---------------------------------------------------------------------------

  const runSearchInternal = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults(initialListings as MappedListing[])
        setDisplayCount(initialListings.length)
        setActiveQuery('')
        setExtractedQuery(null)
        setIsSubmitting(false)
        return
      }

      startTransition(async () => {
        let result: Awaited<ReturnType<typeof searchSuppliers>>
        try {
          result = await searchSuppliers({
            query: searchQuery,
            limit: 50,
          })
        } catch (err) {
          console.error('[SupplierSearchPanel] Search failed:', err)
          setResults([])
          setDisplayCount(0)
          setActiveQuery(searchQuery)
          setExtractedQuery(null)
          setIsSubmitting(false)
          return
        }

        // GOTCHA: MarketplaceListing has many optional nullable fields that the
        // SupplierCard doesn't include. Cast via unknown to satisfy the type checker
        // while keeping the data we actually use. The card components only read
        // the fields we populate here.
        const mapped: MappedListing[] = result.results.map((r) => ({
          id: r.id,
          title: r.name,
          description: r.description ?? '',
          category: r.category as MarketplaceListing['category'],
          subcategory: r.subcategory,
          attributes: r.attributes,
          image_url: null,
          is_verified: r.is_verified,
          verification_tier: 'claimed' as const,
          is_demo: false,
          created_by_provider_id: null,
          process_capabilities: (r.attributes.process_capabilities as MarketplaceListing['process_capabilities']) ?? null,
          industries: (r.attributes.industries as string[] | null) ?? null,
          certifications: (r.attributes.certifications as string[] | null) ?? null,
          materials: (r.attributes.materials as string[] | null) ?? null,
          key_equipment: (r.attributes.key_equipment as string[] | null) ?? null,
          financial_health: null,
          enrichment_quality: null,
          security_clearances: null,
          country: (r.attributes.country as string | null) ?? null,
          city: (r.attributes.city as string | null) ?? null,
          company_size: null,
          contact_email: null,
          average_rating: null,
          review_count: null,
          lead_time: (r.attributes.lead_time as string | null) ?? null,
          minimum_order: (r.attributes.minimum_order as string | null) ?? null,
          production_capacity: (r.attributes.production_capacity as string | null) ?? null,
          quality_systems: (r.attributes.quality_systems as string | null) ?? null,
          products: null,
          specialties: null,
          address: null,
          website_url: (r.attributes.website_url as string | null) ?? null,
          founded_year: null,
          employee_count_exact: null,
          data_quality_score: null,
          carbon_disclosed: null,
          key_people: null,
          latitude: null,
          longitude: null,
          similarity: r.similarity,
        } as MappedListing))

        setResults(mapped)
        setDisplayCount(mapped.length)
        setActiveQuery(searchQuery)
        setExtractedQuery(parseSupplierQuery(searchQuery))
        setIsSubmitting(false)
      })
    },
    [initialListings]
  )

  const runSearch = useCallback(
    (searchQuery: string) => {
      // FIX 1: Push the query to the URL so back-nav restores state.
      // Use replace: true when editing mid-search (chip clicks) to avoid
      // polluting history; use push on explicit form submit (handleSubmit does push).
      const params = new URLSearchParams(searchParams.toString())
      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim())
      } else {
        params.delete('q')
      }
      if (showSaved) {
        params.set('saved', '1')
      } else {
        params.delete('saved')
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      runSearchInternal(searchQuery)
    },
    [router, pathname, searchParams, showSaved, runSearchInternal]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // FIX 3: optimistic "Searching…" state fires immediately on button click.
    setIsSubmitting(true)
    const trimmed = query.trim()
    // FIX 1: Use router.push (not replace) on explicit search button press so
    // the user can press Back to return to their previous query.
    const params = new URLSearchParams(searchParams.toString())
    if (trimmed) {
      params.set('q', trimmed)
    } else {
      params.delete('q')
    }
    params.delete('saved')
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
    runSearchInternal(trimmed)
  }

  const handleChipClick = (chip: (typeof CATEGORY_CHIPS)[0]) => {
    if (activeChip === chip.label) {
      // Deselect
      setActiveChip(null)
      setQuery('')
      runSearch('')
    } else {
      setActiveChip(chip.label)
      setQuery(chip.query)
      // FIX 3: show optimistic loading state for chip clicks too
      setIsSubmitting(true)
      runSearch(chip.query)
    }
  }

  const handleClear = () => {
    setQuery('')
    setActiveChip(null)
    setIsSubmitting(false)
    runSearch('')
    textareaRef.current?.focus()
  }

  // FIX 2: Toggle saved filter chip
  const handleToggleSaved = () => {
    const next = !showSaved
    setShowSaved(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next) {
      params.set('saved', '1')
    } else {
      params.delete('saved')
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  // FIX 2: Save / unsave a listing
  const handleToggleSave = useCallback(
    async (listingId: string, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (savingIds.has(listingId)) return // debounce
      setSavingIds(prev => new Set(prev).add(listingId))

      const isSaved = savedIds.has(listingId)

      // Optimistic update
      setSavedIds(prev => {
        const next = new Set(prev)
        if (isSaved) {
          next.delete(listingId)
        } else {
          next.add(listingId)
        }
        return next
      })

      try {
        const result = isSaved
          ? await unsaveSupplierListing(listingId)
          : await saveSupplierListing(listingId)

        if (!result.ok) {
          // Revert optimistic update on failure
          setSavedIds(prev => {
            const next = new Set(prev)
            if (isSaved) {
              next.add(listingId)
            } else {
              next.delete(listingId)
            }
            return next
          })
        }
      } catch {
        // Revert on error
        setSavedIds(prev => {
          const next = new Set(prev)
          if (isSaved) {
            next.add(listingId)
          } else {
            next.delete(listingId)
          }
          return next
        })
      } finally {
        setSavingIds(prev => {
          const next = new Set(prev)
          next.delete(listingId)
          return next
        })
      }
    },
    [savedIds, savingIds]
  )

  // FIX 2: Determine which results to display (normal vs saved-only filter)
  const savedCount = savedIds.size
  const displayResults = showSaved
    ? results.filter(r => savedIds.has(r.id))
    : results

  // FIX 3: Combined pending state for button display
  const isSearching = isSubmitting || isPending

  return (
    <div className="space-y-4">

      {/* ── Search form (Tristan's brief: search bar BEFORE charts; charts UNDER) ── */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Textarea */}
        <div className="relative">
          <label htmlFor="supplier-search" className="sr-only">
            Describe the type of supplier you need
          </label>
          <textarea
            ref={textareaRef}
            id="supplier-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (activeChip) setActiveChip(null)
            }}
            placeholder="Describe what you need — e.g. &ldquo;UK-based CNC machinist for titanium aerospace brackets, AS9100 preferred, prototype to 50-unit batches&rdquo;"
            rows={3}
            className={`
              w-full resize-none rounded-lg border border-input bg-background px-4 py-3
              text-sm text-foreground placeholder:text-muted-foreground
              focus:outline-none focus:ring-2 focus:ring-international-orange/30 focus:border-international-orange
              transition-colors pr-10
            `}
            aria-label="Describe the type of supplier you need"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Category chips + saved filter + search button row */}
        <div className="flex items-center gap-2 flex-wrap">
          {CATEGORY_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => handleChipClick(chip)}
              className={`
                text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-150
                ${
                  activeChip === chip.label
                    ? 'bg-international-orange/10 text-international-orange font-bold ring-1 ring-international-orange/40'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                }
              `}
              aria-pressed={activeChip === chip.label}
            >
              {chip.label}
            </button>
          ))}

          {/* FIX 2: Saved filter chip */}
          <button
            type="button"
            onClick={handleToggleSaved}
            className={`
              flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-150
              ${
                showSaved
                  ? 'bg-international-orange/10 text-international-orange font-bold ring-1 ring-international-orange/40'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }
            `}
            aria-pressed={showSaved}
          >
            <Heart
              className={`h-3 w-3 ${showSaved ? 'fill-international-orange text-international-orange' : ''}`}
            />
            Saved
            {savedCount > 0 && (
              <span className={`
                ml-0.5 text-[10px] font-bold px-1 rounded-full
                ${showSaved ? 'bg-international-orange/20 text-international-orange' : 'bg-muted text-muted-foreground'}
              `}>
                {savedCount}
              </span>
            )}
          </button>

          <Button
            type="submit"
            size="sm"
            disabled={isSearching || !query.trim()}
            className="ml-auto bg-international-orange hover:bg-international-orange text-white gap-1.5"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching…
              </>
            ) : (
              <>
                <Search className="h-3.5 w-3.5" />
                Search
              </>
            )}
          </Button>
        </div>
      </form>

      {/* ── Pre-search stats charts — visible when no active search (placed UNDER the search bar per Tristan's brief, mirroring Forge Capital) ── */}
      {!isFiltered && (
        <SupplierStatsCharts stats={stats} />
      )}

      {/* ── Extracted-from-query pill row — visible when a search is active ── */}
      {isFiltered && extractedQuery !== null && (
        <SupplierExtractedPills
          extracted={extractedQuery}
          onEdit={() => textareaRef.current?.focus()}
        />
      )}

      {/* ── Results count bar — only visible when a search is active ── */}
      {isFiltered && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {showSaved ? (
              <>
                Showing{' '}
                <span className="font-semibold text-foreground">{displayResults.length}</span> saved result{displayResults.length !== 1 ? 's' : ''} from{' '}
                <span className="font-semibold text-foreground">{displayCount}</span> total matches for{' '}
                <span className="italic">&ldquo;{activeQuery}&rdquo;</span>
              </>
            ) : (
              <>
                Showing{' '}
                <span className="font-semibold text-foreground">{displayCount}</span> results for{' '}
                <span className="italic">&ldquo;{activeQuery}&rdquo;</span>
              </>
            )}
            {' · '}
            <button
              type="button"
              onClick={handleClear}
              className="text-international-orange hover:underline font-medium"
            >
              Clear search
            </button>
          </span>

          {isPending && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching…
            </span>
          )}
        </div>
      )}

      {/* ── Pending spinner (pre-first-result, before isFiltered flips) ── */}
      {!isFiltered && isSearching && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Searching…
        </div>
      )}

      {/* ── Results list — only visible after a search is submitted ── */}
      {isFiltered && (
        displayResults.length === 0 && !isPending ? (
          <div className="rounded-xl bg-muted/30 py-12 text-center text-sm text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
            {showSaved ? (
              <>
                <p className="font-medium text-foreground mb-1">No saved suppliers in these results</p>
                <p>
                  Save suppliers by clicking the{' '}
                  <Heart className="inline h-3 w-3" /> on any card, or{' '}
                  <button
                    type="button"
                    onClick={handleToggleSaved}
                    className="text-international-orange hover:underline"
                  >
                    show all results
                  </button>
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground mb-1">No suppliers matched your search</p>
                <p>Try different keywords, or{' '}
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-international-orange hover:underline"
                  >
                    clear the search
                  </button>
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {displayResults.map((listing, idx) => (
              <SupplierMatchCard
                key={listing.id}
                listing={listing}
                rank={idx + 1}
                searchQuery={activeQuery || undefined}
                isSaved={savedIds.has(listing.id)}
                isSaving={savingIds.has(listing.id)}
                onToggleSave={handleToggleSave}
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}
