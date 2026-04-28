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
 * DECISION: SupplierStatsCharts is defined inline in this file (not a separate file)
 * per the brief's "keep file count to the three above" constraint.
 * DECISION: stats are fetched in the server page (page.tsx) and passed as a prop
 * because this is a client component and cannot await server actions directly.
 */

import { useState, useTransition, useCallback, useRef } from 'react'
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
import { Search, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SupplierMatchCard } from './SupplierMatchCard'
import { SupplierExtractedPills, parseSupplierQuery } from './SupplierExtractedPills'
import type { ExtractedSupplierQuery } from './SupplierExtractedPills'
import { searchSuppliers } from '@/actions/suppliers'
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

interface SupplierSearchPanelProps {
  /** Initial server-fetched listings (browse all, no query) */
  initialListings: MarketplaceListing[]
  /** Total supplier count for the count badge */
  totalCount: number
  /** Pre-fetched directory stats for the chart block */
  stats: SupplierDirectoryStats
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SupplierSearchPanel({
  initialListings,
  totalCount,
  stats,
}: SupplierSearchPanelProps) {
  const [query, setQuery] = useState('')
  const [activeChip, setActiveChip] = useState<string | null>(null)
  const [results, setResults] = useState<(MarketplaceListing & { similarity?: number })[]>(
    initialListings as (MarketplaceListing & { similarity?: number })[]
  )
  const [displayCount, setDisplayCount] = useState(initialListings.length)
  const [activeQuery, setActiveQuery] = useState<string>('')
  const [extractedQuery, setExtractedQuery] = useState<ExtractedSupplierQuery | null>(null)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // INTENT: Charts are visible pre-search and hidden when a search result set
  // is active — mirrors the investor page pattern.
  const isFiltered = activeQuery.trim().length > 0

  const runSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) {
        // Reset to initial browse — charts reappear
        setResults(initialListings as (MarketplaceListing & { similarity?: number })[])
        setDisplayCount(initialListings.length)
        setActiveQuery('')
        setExtractedQuery(null)
        return
      }

      startTransition(async () => {
        // 50 default — couples with the supplier detail page's max useful
        // pagination at this point. 24 was too low: founders flagged the
        // count looking suspiciously identical across very different queries
        // because the cap was pinning every result set at 24.
        const result = await searchSuppliers({
          query: searchQuery,
          limit: 50,
        })

        // searchSuppliers returns SupplierCard[], but we need MarketplaceListing shape for the card.
        // Map SupplierCard → MarketplaceListing (best-effort — the card reads from .attributes anyway).
        const mapped = result.results.map((r) => ({
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
          similarity: r.similarity,
        }))

        setResults(mapped)
        setDisplayCount(mapped.length)
        setActiveQuery(searchQuery)
        // Parse the query client-side (no LLM call — regex only) and store
        // for the extracted-pills row rendered between form and count bar.
        setExtractedQuery(parseSupplierQuery(searchQuery))
      })
    },
    [initialListings]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    runSearch(query.trim())
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
      runSearch(chip.query)
    }
  }

  const handleClear = () => {
    setQuery('')
    setActiveChip(null)
    runSearch('')
    textareaRef.current?.focus()
  }

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

        {/* Category chips + search button row */}
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

          <Button
            type="submit"
            size="sm"
            disabled={isPending || !query.trim()}
            className="ml-auto bg-international-orange hover:bg-international-orange text-white gap-1.5"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            Search
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

      {/* ── Results count bar ── */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          {isFiltered ? (
            <>
              Showing{' '}
              <span className="font-semibold text-foreground">{displayCount}</span> results for{' '}
              <span className="italic">&ldquo;{activeQuery}&rdquo;</span>
              {' · '}
              <button
                type="button"
                onClick={handleClear}
                className="text-international-orange hover:underline font-medium"
              >
                Clear search
              </button>
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span>
              {' suppliers in the directory'}
              {displayCount > 0 && ` · showing ${displayCount}`}
            </>
          )}
        </span>

        {isPending && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching…
          </span>
        )}
      </div>

      {/* ── Results list ── */}
      {results.length === 0 && !isPending ? (
        <div className="rounded-xl bg-muted/30 py-12 text-center text-sm text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-medium text-foreground mb-1">No suppliers matched your search</p>
          <p>Try different keywords, or{' '}
            <button
              type="button"
              onClick={handleClear}
              className="text-international-orange hover:underline"
            >
              browse all suppliers
            </button>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((listing, idx) => (
            <SupplierMatchCard
              key={listing.id}
              listing={listing}
              rank={isFiltered ? idx + 1 : undefined}
              searchQuery={activeQuery || undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
