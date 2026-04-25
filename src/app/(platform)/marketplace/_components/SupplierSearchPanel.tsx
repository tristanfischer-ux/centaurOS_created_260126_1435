'use client'

/**
 * @file SupplierSearchPanel.tsx
 *
 * @description Interactive supplier search panel. Matches the SUPPLIES-MOCKUP-SUPPLIERS.html layout:
 *   1. Paste-textarea at top — "describe what type of company you're looking for"
 *   2. Category filter chips (CNC machining, PCB assembly, Sheet metal, etc.)
 *   3. Results count bar
 *   4. Supplier match cards — one per result, ordered by semantic similarity
 *
 * FLOW:
 *   - On load: renders initial listings passed as props (browse all)
 *   - On submit: calls searchSuppliers server action with the textarea query
 *   - Semantic path (query > 5 chars): calls match_marketplace_listings RPC via suppliers.ts
 *   - Browse path: renders initial server-fetched listings unfiltered
 *
 * INTENT: This is a client component because the search is interactive. The initial
 * listings are passed from the server page so we get instant LCP with no flash.
 */

import { useState, useTransition, useCallback, useRef } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SupplierMatchCard } from './SupplierMatchCard'
import { searchSuppliers } from '@/actions/suppliers'
import type { MarketplaceListing } from '@/actions/marketplace'

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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SupplierSearchPanel({
  initialListings,
  totalCount,
}: SupplierSearchPanelProps) {
  const [query, setQuery] = useState('')
  const [activeChip, setActiveChip] = useState<string | null>(null)
  const [results, setResults] = useState<(MarketplaceListing & { similarity?: number })[]>(
    initialListings as (MarketplaceListing & { similarity?: number })[]
  )
  const [displayCount, setDisplayCount] = useState(initialListings.length)
  const [activeQuery, setActiveQuery] = useState<string>('')
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const runSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) {
        // Reset to initial browse
        setResults(initialListings as (MarketplaceListing & { similarity?: number })[])
        setDisplayCount(initialListings.length)
        setActiveQuery('')
        return
      }

      startTransition(async () => {
        const result = await searchSuppliers({
          query: searchQuery,
          limit: 24,
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

  const isFiltered = activeQuery.trim().length > 0

  return (
    <div className="space-y-4">
      {/* ── Search form ── */}
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
                text-xs font-medium px-3 py-1.5 rounded-full border transition-all duration-150
                ${
                  activeChip === chip.label
                    ? 'bg-international-orange/10 border-international-orange/40 text-international-orange font-bold'
                    : 'bg-muted border-border text-muted-foreground hover:border-border-strong hover:text-foreground'
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
        <div className="rounded-xl border border-border bg-muted/30 py-12 text-center text-sm text-muted-foreground">
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
          {results.map((listing) => (
            <SupplierMatchCard
              key={listing.id}
              listing={listing}
              searchQuery={activeQuery || undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
