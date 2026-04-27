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
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { searchMarketplaceListings } from '@/actions/marketplace'
import { getMarketplaceStats } from '@/actions/marketplace-stats'
import { getSupplierDirectoryStats } from '@/actions/suppliers'
import {
  getSuppliersDirectoryFacets,
  getSuppliersDirectoryPage,
  getSupplierContactsFacets,
  getSupplierContactsPage,
} from '@/actions/suppliers-directory'
import { getInvestorTierAccess } from '@/actions/investors'
import { SupplierSearchPanel } from './_components/SupplierSearchPanel'
import { MarketplaceTabs } from './_components/MarketplaceTabs'
import { typography } from '@/lib/design-system'
import type { MarketplaceListing } from '@/actions/marketplace'
import type { SupplierDirectoryStats } from '@/actions/suppliers'

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
  let supplierStats: SupplierDirectoryStats | null = null

  const [
    searchResult,
    statsResult,
    supplierStatsResult,
    facetsResult,
    suppliersPageResult,
    contactsFacetsResult,
    contactsPageResult,
    tierResult,
  ] = await Promise.allSettled([
    searchMarketplaceListings({
      categories: ['Products', 'Services'],
      page: 1,
      pageSize: 24,
      sort: 'verified',
    }),
    getMarketplaceStats(),
    getSupplierDirectoryStats(),
    getSuppliersDirectoryFacets(),
    getSuppliersDirectoryPage({ page: 1, pageSize: 20 }),
    getSupplierContactsFacets(),
    getSupplierContactsPage({ page: 1, pageSize: 25 }),
    // Reuse the investor tier helper — same Stripe subscription drives
    // contact-name unmasking on the marketplace contacts tab.
    getInvestorTierAccess(),
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

  if (supplierStatsResult.status === 'fulfilled') {
    supplierStats = supplierStatsResult.value
  } else {
    console.error('[Marketplace] Failed to fetch supplier stats:', supplierStatsResult.reason)
  }

  // Fallback stats object if the fetch failed — prevents prop-type errors downstream
  const statsForPanel: SupplierDirectoryStats = supplierStats ?? {
    total: totalCount,
    verified: verifiedCount,
    withCertifications: 0,
    countries: 0,
    categoryBreakdown: [],
    topCapabilities: [],
    topMaterials: [],
    suppliersByCountry: [],
  }

  return (
    <div className="space-y-6">
      {/* Tristan 2026-04-27: removed Home › Suppliers breadcrumb to match
          the canonical My Profile page-header pattern (red bar + title only). */}
      {/* ── Page header ── */}
      <div className="pb-4 border-b border-border/40">
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
        <span className="inline-flex items-center text-xs text-muted-foreground px-3 py-1.5 rounded-md bg-muted/50">
          {totalCount.toLocaleString()} suppliers in directory
        </span>
        {verifiedCount > 0 && (
          <span className="inline-flex items-center text-xs text-muted-foreground px-3 py-1.5 rounded-md bg-muted/50">
            {verifiedCount.toLocaleString()} verified
          </span>
        )}
        <Link
          href="/marketplace/quotes"
          className="inline-flex items-center text-xs font-semibold text-international-orange px-3 py-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors no-underline"
        >
          + Send request for quotation
        </Link>
      </div>

      {/* ── Tabs (Overview / Suppliers / Contacts) — Forge Capital
          Nightshift Supplier Dashboard parity. Phase A: shell + Overview.
          Phase B: Suppliers table with filters. Phase C: contact directory. */}
      <MarketplaceTabs
        totalSuppliers={totalCount}
        suppliersFacets={
          facetsResult.status === 'fulfilled'
            ? facetsResult.value
            : { countries: [], statuses: [] }
        }
        suppliersInitialPage={
          suppliersPageResult.status === 'fulfilled'
            ? suppliersPageResult.value
            : { rows: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }
        }
        contactsFacets={
          contactsFacetsResult.status === 'fulfilled'
            ? contactsFacetsResult.value
            : { totalContacts: 0, suppliersWithContacts: 0, countries: [] }
        }
        contactsInitialPage={
          contactsPageResult.status === 'fulfilled'
            ? contactsPageResult.value
            : { rows: [], total: 0, page: 1, pageSize: 25, totalPages: 0 }
        }
        totalContacts={
          contactsFacetsResult.status === 'fulfilled'
            ? contactsFacetsResult.value.totalContacts
            : undefined
        }
        isPaid={
          tierResult.status === 'fulfilled'
            ? tierResult.value.tier !== 'free'
            : false
        }
        overview={
          <SupplierSearchPanel
            initialListings={listings}
            totalCount={totalCount}
            stats={statsForPanel}
          />
        }
      />
    </div>
  )
}
