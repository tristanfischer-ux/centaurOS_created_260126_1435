import type { Metadata } from 'next'
import { getSupplierDirectoryStats } from '@/actions/suppliers'
import { getSavedSupplierIds } from '@/actions/saved-suppliers'
import { SupplierSearchPanel } from './_components/SupplierSearchPanel'
import { typography } from '@/lib/design-system'

export const metadata: Metadata = {
  title: 'Suppliers',
  description: 'Find manufacturing partners and services for your hardware startup',
  openGraph: {
    title: 'Suppliers | ForgeOS',
    description: 'Find manufacturing partners and services for your hardware startup',
    type: 'website',
  },
}

// INTENT: revalidate=30 lets the stats panel refresh without a full deploy.
export const revalidate = 30

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; saved?: string }>
}) {
  // Resolve async searchParams (Next.js 15+)
  const params = await searchParams

  // Run stats + saved-IDs fetch in parallel
  const [stats, savedIds] = await Promise.all([
    getSupplierDirectoryStats().catch(() => null),
    getSavedSupplierIds().catch(() => [] as string[]),
  ])

  const emptyStats = {
    total: 0,
    verified: 0,
    withCertifications: 0,
    countries: 0,
    categoryBreakdown: [],
    topCapabilities: [],
    topMaterials: [],
    suppliersByCountry: [],
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="pb-4 border-b border-muted">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>Suppliers</h1>
        </div>
        <p className={typography.pageSubtitle}>
          Manufacturing partners and services for your hardware venture
        </p>
      </div>

      {/* Search panel — URL-param driven so back-nav restores search state */}
      <SupplierSearchPanel
        initialListings={[]}
        totalCount={stats?.total ?? 0}
        stats={stats ?? emptyStats}
        initialQuery={params.q ?? ''}
        initialShowSaved={params.saved === '1'}
        initialSavedIds={savedIds}
      />
    </div>
  )
}
