import type { Metadata } from 'next'
import { getSupplierDirectoryStats } from '@/actions/suppliers'
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

export default async function MarketplacePage() {
  // Fetch only directory stats — no initial listings.
  // Supplier rows render ONLY after a search is submitted (client-side, via
  // searchSuppliers server action inside SupplierSearchPanel).
  // DECISION: removed the serial waterfall from the old page (listings + stats +
  // Chase briefing + project context + recommendations + saved IDs all on load).
  // The only server-side work now is the stats aggregation (~60ms).
  const stats = await getSupplierDirectoryStats().catch(() => null)

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

      {/* Search panel — paste-your-deck textarea + search box at top,
          directory overview + charts below (only when no search active),
          supplier match cards render only on search submit */}
      {stats ? (
        <SupplierSearchPanel
          initialListings={[]}
          totalCount={stats.total}
          stats={stats}
        />
      ) : (
        <SupplierSearchPanel
          initialListings={[]}
          totalCount={0}
          stats={{
            total: 0,
            verified: 0,
            withCertifications: 0,
            countries: 0,
            categoryBreakdown: [],
            topCapabilities: [],
            topMaterials: [],
            suppliersByCountry: [],
          }}
        />
      )}
    </div>
  )
}
