/**
 * @file marketplace/page.tsx
 *
 * @description Supplier marketplace page. Matches SUPPLIES-MOCKUP-SUPPLIERS.html:
 *   - Breadcrumb / page header with "Find a supplier" title
 *   - Count context chips (total suppliers · verified count)
 *   - SupplierSearchPanel with textarea + category chips + semantic match cards
 *
 * FLOW:
 *   Server: fetch initial listings (browse all, Products + Services, verified-first)
 *           + marketplace stats for headline counts
 *   Client: SupplierSearchPanel handles interactive search via searchSuppliers action
 *
 * DECISION: Removed MarketplaceBrowse / marketplace-v2 components and replaced with
 * the mockup-faithful layout. The SupplierMatchView (SSE-based profile matching) lives
 * in the marketplace-v2 tab tree and is NOT part of this redesign.
 *
 * INTENT: Chase's page-level briefing is retained below the header — keeps the specialist
 * voice present without blocking the search panel.
 */

import type { Metadata } from 'next'
import { searchMarketplaceListings } from '@/actions/marketplace'
import { getMarketplaceStats } from '@/actions/marketplace-stats'
import { generatePageBriefing } from '@/actions/specialist-page-insights'
import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'
import { SupplierSearchPanel } from './_components/SupplierSearchPanel'
import { typography } from '@/lib/design-system'
import type { MarketplaceListing } from '@/actions/marketplace'

export const metadata: Metadata = {
  title: 'Marketplace',
  description: 'Find manufacturing partners, services, and tools for your hardware startup',
  openGraph: {
    title: 'Marketplace | ForgeOS',
    description: 'Find manufacturing partners, services, and tools for your hardware startup',
    type: 'website',
  },
}

export const revalidate = 30

export default async function MarketplacePage() {
  let listings: MarketplaceListing[] = []
  let totalCount = 0
  let verifiedCount = 0

  const [searchResult, statsResult, briefingResult] = await Promise.allSettled([
    searchMarketplaceListings({
      categories: ['Products', 'Services'],
      page: 1,
      pageSize: 24,
      sort: 'verified',
    }),
    getMarketplaceStats(),
    generatePageBriefing(
      'vp-supply-chain',
      'Marketplace supplier directory — founder looking for manufacturing partners',
      'success'
    ),
  ])

  if (searchResult.status === 'fulfilled') {
    listings = searchResult.value.data
    totalCount = searchResult.value.totalCount
  } else {
    console.error('[Marketplace] Failed to fetch listings:', searchResult.reason)
  }

  if (statsResult.status === 'fulfilled' && statsResult.value) {
    totalCount = statsResult.value.totalListings || totalCount
    verifiedCount = statsResult.value.verifiedCount
  }

  const briefing =
    briefingResult.status === 'fulfilled'
      ? briefingResult.value
      : { narrative: null, severity: 'success' as const }

  const briefingContext = `Marketplace: ${totalCount} suppliers across Products & Services. ${verifiedCount} verified.`

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="pb-4 border-b border-border">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>Find a supplier</h1>
        </div>
        <p className={typography.pageSubtitle}>
          Describe what you need and we surface the best matches — or browse all{' '}
          {totalCount > 0 && (
            <span className="text-foreground font-semibold">{totalCount.toLocaleString()}</span>
          )}{' '}
          suppliers in the directory.
        </p>
      </div>

      {/* ── Context chips ── */}
      <div className="flex flex-wrap gap-2 -mt-2">
        <span className="inline-flex items-center text-xs text-muted-foreground px-3 py-1.5 rounded-md border border-border bg-card">
          {totalCount.toLocaleString()} suppliers in directory
        </span>
        {verifiedCount > 0 && (
          <span className="inline-flex items-center text-xs text-muted-foreground px-3 py-1.5 rounded-md border border-border bg-card">
            {verifiedCount.toLocaleString()} verified
          </span>
        )}
        <a
          href="/marketplace/quotes"
          className="inline-flex items-center text-xs font-semibold text-international-orange px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted transition-colors no-underline"
        >
          + Send request for quotation
        </a>
      </div>

      {/* ── Chase briefing ── */}
      <SpecialistBriefingHero
        specialistId="vp-supply-chain"
        specialistName="Chase"
        specialistTitle="Supply Chain"
        narrative={briefing.narrative}
        fallbackMessage="Chase here. Type what you need — a materials spec, a capability, a geography — and I'll surface the best-matched suppliers. Start broad and refine from there."
        isLoading={false}
        severity={briefing.severity}
        context={{
          type: 'general',
          title: 'Marketplace',
          description: briefingContext,
          metadata: {},
        }}
        storageKey="marketplace"
      />

      {/* ── Search panel + results ── */}
      <SupplierSearchPanel
        initialListings={listings}
        totalCount={totalCount}
      />
    </div>
  )
}
