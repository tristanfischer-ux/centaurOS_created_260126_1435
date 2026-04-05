/**
 * @file SupplierSearchClient.tsx
 *
 * @description Client component for supplier search with real-time search input,
 * category filter chips, and result cards with similarity scores.
 * Light mode only.
 */

'use client'

import { useState, useTransition, useCallback } from 'react'
import { searchSuppliers } from '@/actions/suppliers'
import type { SupplierCard, SupplierSearchResult } from '@/actions/suppliers'

// ---------------------------------------------------------------------------
// Category chips
// ---------------------------------------------------------------------------

const CATEGORIES = ['Services', 'Products', 'People', 'AI'] as const

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
  const [results, setResults] = useState<SupplierCard[]>(initialResults)
  const [total, setTotal] = useState(initialTotal)
  const [searchMode, setSearchMode] = useState(initialSearchMode)
  const [isPending, startTransition] = useTransition()

  const handleSearch = useCallback(() => {
    startTransition(async () => {
      const data = await searchSuppliers({
        query: query || undefined,
        category: category || undefined,
        limit: 24,
      })
      setResults(data.results)
      setTotal(data.total)
      setSearchMode(data.searchMode)
    })
  }, [query, category])

  const handleCategoryToggle = useCallback((cat: string) => {
    const newCat = category === cat ? null : cat
    setCategory(newCat)
    startTransition(async () => {
      const data = await searchSuppliers({
        query: query || undefined,
        category: newCat || undefined,
        limit: 24,
      })
      setResults(data.results)
      setTotal(data.total)
      setSearchMode(data.searchMode)
    })
  }, [query, category])

  return (
    <div className="space-y-6">
      {/* Search input */}
      <div className="flex gap-3 max-w-2xl">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Describe what you need... e.g. CNC machining for titanium aerospace brackets"
          className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Category chips */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => handleCategoryToggle(cat)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              category === cat
                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {total} result{total !== 1 ? 's' : ''}
          {searchMode === 'semantic' && (
            <span className="ml-2 inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
              AI-matched
            </span>
          )}
          {searchMode === 'keyword' && (
            <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              Keyword search
            </span>
          )}
        </p>
      </div>

      {/* Result cards */}
      {results.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-12 text-center">
          <p className="text-gray-500">No suppliers found. Try adjusting your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map(supplier => (
            <SupplierResultCard key={supplier.id} supplier={supplier} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result card
// ---------------------------------------------------------------------------

function SupplierResultCard({ supplier }: { supplier: SupplierCard }) {
  const attrs = supplier.attributes
  const location = [attrs.city, attrs.country].filter(Boolean).join(', ')
  const certs = (attrs.certifications as string) || ''

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-base font-semibold text-gray-900 line-clamp-1">
          {supplier.name}
        </h3>
        {supplier.similarity != null && (
          <span className="ml-2 shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
            {Math.round(supplier.similarity * 100)}% match
          </span>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          {supplier.category}
        </span>
        {supplier.subcategory && (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {supplier.subcategory}
          </span>
        )}
      </div>

      {supplier.description && (
        <p className="text-sm text-gray-600 line-clamp-3 mb-3">
          {supplier.description}
        </p>
      )}

      <div className="space-y-1 text-xs text-gray-500">
        {location && (
          <p>{location}</p>
        )}
        {certs && (
          <p className="line-clamp-1">Certs: {certs}</p>
        )}
      </div>

      {supplier.is_verified && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-green-600 font-medium">Verified</span>
        </div>
      )}
    </div>
  )
}
