/**
 * @file SupplierSearchClient.tsx
 *
 * @description Client component for supplier search with semantic search, category filters,
 * advanced filters (country, certifications), sorting, pagination, and enriched result cards.
 * Includes stats overview panel with category breakdown and verified count.
 * Links to detail pages via /suppliers/[id].
 * Uses semantic tokens only (no hardcoded colors).
 */

'use client'

import { useState, useTransition, useCallback } from 'react'
import Link from 'next/link'
import { ChevronDown, Filter } from 'lucide-react'
import { searchSuppliers } from '@/actions/suppliers'
import type { SupplierCard, SupplierSearchResult } from '@/actions/suppliers'
import { recordSearchClick } from '@/actions/search-click'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = ['Services', 'Products', 'People', 'AI'] as const
const COMMON_CERTIFICATIONS = ['ISO 9001', 'AS9100', 'NADCAP', 'ISO 13485'] as const
const PAGE_SIZE = 24

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SupplierSearchClientProps {
  initialResults: SupplierCard[]
  initialTotal: number
  initialSearchMode: SupplierSearchResult['searchMode']
}

export function SupplierSearchClient({
  initialResults,
  initialTotal,
  initialSearchMode,
}: SupplierSearchClientProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [country, setCountry] = useState('')
  const [certifications, setCertifications] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<'relevance' | 'name' | 'rating'>('relevance')
  const [results, setResults] = useState<SupplierCard[]>(initialResults)
  const [total, setTotal] = useState(initialTotal)
  const [offset, setOffset] = useState(0)
  const [searchMode, setSearchMode] = useState(initialSearchMode)
  const [isPending, startTransition] = useTransition()
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [showStats, setShowStats] = useState(true)
  // Phase A.5 — id of the most recent `search_query_log` row, used to key
  // click events back to the originating query via `recordSearchClick`.
  const [searchQueryLogId, setSearchQueryLogId] = useState<string | null>(null)

  // Compute stats from current results
  const stats = useCallback(() => {
    const categories: Record<string, number> = { Services: 0, Products: 0, People: 0, AI: 0 }
    let verifiedCount = 0

    // Count from initial browse results (all results seen so far)
    results.forEach(s => {
      if (s.category in categories) categories[s.category]++
      if (s.is_verified) verifiedCount++
    })

    return { categories, verifiedCount }
  }, [results])

  const handleSearch = useCallback(() => {
    setOffset(0)
    startTransition(async () => {
      const data = await searchSuppliers({
        query: query || undefined,
        category: category || undefined,
        country: country || undefined,
        certifications: certifications.length > 0 ? certifications : undefined,
        sortBy,
        limit: PAGE_SIZE,
        offset: 0,
      })
      setResults(data.results)
      setTotal(data.total)
      setSearchMode(data.searchMode)
      setSearchQueryLogId(data.searchQueryLogId ?? null)
    })
  }, [query, category, country, certifications, sortBy])

  const handleCategoryToggle = useCallback((cat: string) => {
    const newCat = category === cat ? null : cat
    setCategory(newCat)
    setOffset(0)
    startTransition(async () => {
      const data = await searchSuppliers({
        query: query || undefined,
        category: newCat || undefined,
        country: country || undefined,
        certifications: certifications.length > 0 ? certifications : undefined,
        sortBy,
        limit: PAGE_SIZE,
        offset: 0,
      })
      setResults(data.results)
      setTotal(data.total)
      setSearchMode(data.searchMode)
      setSearchQueryLogId(data.searchQueryLogId ?? null)
    })
  }, [query, country, certifications, sortBy])

  const handleCertToggle = useCallback((cert: string) => {
    const newCerts = certifications.includes(cert)
      ? certifications.filter(c => c !== cert)
      : [...certifications, cert]
    setCertifications(newCerts)
  }, [certifications])

  const handleLoadMore = useCallback(() => {
    const newOffset = offset + PAGE_SIZE
    setOffset(newOffset)
    startTransition(async () => {
      const data = await searchSuppliers({
        query: query || undefined,
        category: category || undefined,
        country: country || undefined,
        certifications: certifications.length > 0 ? certifications : undefined,
        sortBy,
        limit: PAGE_SIZE,
        offset: newOffset,
      })
      setResults(prev => [...prev, ...data.results])
      setTotal(data.total)
      setSearchMode(data.searchMode)
      // Replace the current query-log id with the latest page so newly
      // appended cards key clicks to the right log row.
      setSearchQueryLogId(data.searchQueryLogId ?? null)
    })
  }, [offset, query, category, country, certifications, sortBy])

  const statsData = stats()

  return (
    <div className="space-y-6">
      {/* Stats panel — collapsible */}
      {showStats && (
        <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Supplier Insights</h3>
            <button
              onClick={() => setShowStats(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Hide supplier insights"
            >
              <ChevronDown className="h-4 w-4 rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <StatCard label="Total Suppliers" value={total} />
            <StatCard label="Services" value={statsData.categories.Services} />
            <StatCard label="Products" value={statsData.categories.Products} />
            <StatCard label="People" value={statsData.categories.People} />
            <StatCard label="Verified" value={statsData.verifiedCount} />
          </div>
        </div>
      )}

      {!showStats && (
        <button
          onClick={() => setShowStats(true)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Show supplier insights
        </button>
      )}

      {/* Search input */}
      <div className="flex gap-3 max-w-2xl">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Describe what you need... e.g. CNC machining for titanium aerospace brackets"
          className="flex-1 rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-international-orange focus:outline-none focus:ring-1 focus:ring-international-orange transition-colors"
          aria-label="Describe the supplier capability you need"
        />
        <button
          onClick={handleSearch}
          disabled={isPending}
          className="rounded-lg bg-international-orange px-6 py-3 text-sm font-medium text-foreground hover:bg-international-orange/90 disabled:opacity-50 transition-colors"
          aria-label={isPending ? 'Searching — please wait' : 'Run supplier search'}
        >
          {isPending ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Category chips */}
      <div className="flex gap-2 flex-wrap items-center">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => handleCategoryToggle(cat)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              category === cat
                ? 'bg-secondary text-foreground border border-international-orange'
                : 'bg-muted text-muted-foreground border border-border hover:bg-muted/80'
            }`}
          >
            {cat}
          </button>
        ))}

        {/* Advanced filters toggle */}
        <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className="ml-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground border border-border hover:bg-muted/50 transition-colors"
        >
          <Filter className="h-4 w-4" />
          Filters
          <ChevronDown className={`h-4 w-4 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Advanced filters — collapsible */}
      {showAdvancedFilters && (
        <div className="rounded-lg border border-border bg-muted p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-2">
              Country
            </label>
            <input
              type="text"
              value={country}
              onChange={e => setCountry(e.target.value)}
              placeholder="e.g. United States, Japan"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-international-orange focus:outline-none focus:ring-1 focus:ring-international-orange transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-2">
              Certifications
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMON_CERTIFICATIONS.map(cert => (
                <button
                  key={cert}
                  onClick={() => handleCertToggle(cert)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    certifications.includes(cert)
                      ? 'bg-international-orange text-foreground'
                      : 'bg-background border border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {cert}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-2">
              Sort by
            </label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'relevance' | 'name' | 'rating')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-international-orange focus:outline-none focus:ring-1 focus:ring-international-orange transition-colors"
            >
              <option value="relevance">Relevance (default)</option>
              <option value="name">Name (A-Z)</option>
              <option value="rating">Rating</option>
            </select>
          </div>

          <button
            onClick={handleSearch}
            className="w-full rounded-lg bg-international-orange px-4 py-2 text-sm font-medium text-foreground hover:bg-international-orange/90 transition-colors"
          >
            Apply Filters
          </button>
        </div>
      )}

      {/* Results header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {results.length} of {total} result{total !== 1 ? 's' : ''}
          {searchMode === 'semantic' && (
            <span className="ml-2 inline-flex items-center rounded-full bg-info/10 px-2.5 py-0.5 text-xs font-medium text-info">
              AI-matched
            </span>
          )}
          {searchMode === 'keyword' && (
            <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              Keyword search
            </span>
          )}
        </p>
      </div>

      {/* Result cards */}
      {results.length === 0 ? (
        <div className="rounded-xl border border-border bg-muted p-12 text-center">
          <p className="text-muted-foreground">No suppliers found. Try adjusting your search.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((supplier, idx) => (
              <SupplierResultCard
                key={supplier.id}
                supplier={supplier}
                onOpen={() => {
                  // Phase A.5 — fire-and-forget click telemetry. No UI gate.
                  if (!searchQueryLogId) return
                  void recordSearchClick({
                    queryLogId: searchQueryLogId,
                    listingId: supplier.id,
                    position: idx,
                    clickType: 'open',
                  })
                }}
              />
            ))}
          </div>

          {/* Load more button */}
          {results.length < total && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                disabled={isPending}
                className="rounded-lg border border-border bg-background px-6 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Loading...' : `Load more (${total - results.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-lg sm:text-xl font-semibold text-foreground mt-1">{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result card
// ---------------------------------------------------------------------------

function SupplierResultCard({
  supplier,
  onOpen,
}: {
  supplier: SupplierCard
  /** Phase A.5 — fired when the cover Link is activated. */
  onOpen?: () => void
}) {
  const attrs = supplier.attributes as Record<string, unknown>
  const location = [attrs.city, attrs.country].filter(Boolean).join(', ')
  const certs = (attrs.certifications as string | string[] | null) || ''
  const industries = (attrs.industries as string | string[] | null) || (attrs.industries_served as string | string[] | null) || ''
  const employeeCount = (attrs.employee_count as number | string | null) || (attrs.company_size as string | null)

  // DECISION: capability_summary (synthesis) > public_synthesis (legacy) > description (raw)
  const synthesis = (attrs.capability_summary as string | null) || (attrs.public_synthesis as string | null)
  const snippet = synthesis || supplier.description

  // Safely parse certifications and industries
  const certsArray = typeof certs === 'string'
    ? certs.split(',').map(c => c.trim()).filter(Boolean).slice(0, 2)
    : Array.isArray(certs) ? certs.slice(0, 2) : []

  const industriesArray = typeof industries === 'string'
    ? industries.split(',').map(i => i.trim()).filter(Boolean).slice(0, 2)
    : Array.isArray(industries) ? industries.slice(0, 2) : []

  return (
    <Link href={`/suppliers/${supplier.id}`} onClick={onOpen}>
      <div className="rounded-lg border border-border bg-card p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer h-full flex flex-col">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-base font-semibold text-foreground line-clamp-1 flex-1">
            {supplier.name}
          </h3>
          {supplier.similarity != null && (
            <span className="ml-2 shrink-0 rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
              {Math.round(supplier.similarity * 100)}% match
            </span>
          )}
        </div>

        <div className="flex gap-2 mb-3 flex-wrap">
          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
            {supplier.category}
          </span>
          {supplier.subcategory && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {supplier.subcategory}
            </span>
          )}
        </div>

        {snippet && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1">
            {snippet}
          </p>
        )}

        {/* Industries badges */}
        {industriesArray.length > 0 && (
          <div className="flex gap-1 mb-2 flex-wrap">
            {industriesArray.map((ind, i) => (
              <span key={i} className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                {ind}
              </span>
            ))}
          </div>
        )}

        {/* Certifications badges */}
        {certsArray.length > 0 && (
          <div className="flex gap-1 mb-3 flex-wrap">
            {certsArray.map((cert, i) => (
              <span key={i} className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                {cert}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-1 text-xs text-muted-foreground mt-auto">
          {location && (
            <p>{location}</p>
          )}
          {employeeCount && (
            <p>
              {typeof employeeCount === 'number'
                ? `${employeeCount} employees`
                : `${employeeCount}`}
            </p>
          )}
        </div>

        {supplier.is_verified && (
          <div className="mt-3 pt-3 border-t border-border">
            <span className="text-xs text-success font-medium">Verified</span>
          </div>
        )}
      </div>
    </Link>
  )
}
