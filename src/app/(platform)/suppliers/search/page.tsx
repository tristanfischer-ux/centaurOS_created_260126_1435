/**
 * @file suppliers/search/page.tsx
 *
 * @description Supplier search page with semantic search capability. Founders can describe
 * what they need in natural language and get ranked supplier matches from the marketplace.
 * Falls back to keyword/browse when semantic search is unavailable.
 *
 * Light mode only — no dark backgrounds.
 */

import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { searchSuppliers } from '@/actions/suppliers'
import { SupplierSearchClient } from './SupplierSearchClient'

export const revalidate = 60

function SearchLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-12 w-full max-w-2xl" />
      <div className="flex gap-3">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Skeleton key={i} className="h-56 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export default async function SupplierSearchPage() {
  // Fetch initial browse results server-side
  const initialData = await searchSuppliers({ limit: 24 })

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">
          Supplier Directory
        </h1>
        <p className="text-gray-500 mb-6">
          Describe what you need — we&apos;ll find the best suppliers using AI-powered semantic search.
        </p>

        <Suspense fallback={<SearchLoading />}>
          <SupplierSearchClient
            initialResults={initialData.results}
            initialTotal={initialData.total}
            initialSearchMode={initialData.searchMode}
          />
        </Suspense>
      </div>
    </div>
  )
}
