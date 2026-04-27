'use client'

/**
 * @file MarketplaceTabs.tsx
 *
 * @description Tab shell for /marketplace mirroring the Forge Capital
 * Nightshift Supplier Dashboard (`Nightshift-Supplier-Dashboard.html`
 * lines 154-228): Overview / Suppliers / Contacts.
 *
 * Phase A (Tristan 2026-04-27, tracker #13): tab shell only. Overview
 * carries the existing `SupplierSearchPanel` unchanged. Suppliers and
 * Contacts are honest "Coming next" empty states until Phase B / C land.
 *
 * Phase B will render a paginated supplier table with 4 filter dropdowns
 * (Category / Country / Status / Quality).
 * Phase C will render a searchable contact directory backed by
 * `vc_pe_contacts` + supplier contact rows.
 */

import { useState, type ReactNode } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Building2, Users, LayoutGrid } from 'lucide-react'
import { SuppliersTable } from './SuppliersTable'
import type {
  SuppliersDirectoryFacets,
  SuppliersDirectoryPageResult,
} from '@/actions/suppliers-directory'

interface MarketplaceTabsProps {
  /** Total supplier count, used for the Suppliers tab badge. */
  totalSuppliers: number
  /** Total contact count, used for the Contacts tab badge. */
  totalContacts?: number
  /** Overview tab content — existing SupplierSearchPanel + headline chips. */
  overview: ReactNode
  /** Phase B: facets + first page of supplier rows for the Suppliers tab. */
  suppliersFacets: SuppliersDirectoryFacets
  suppliersInitialPage: SuppliersDirectoryPageResult
}

function fmtCount(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return n.toLocaleString()
}

export function MarketplaceTabs({
  totalSuppliers,
  totalContacts,
  overview,
  suppliersFacets,
  suppliersInitialPage,
}: MarketplaceTabsProps) {
  const [tab, setTab] = useState<'overview' | 'suppliers' | 'contacts'>('overview')

  const suppliersBadge = totalSuppliers > 0 ? ` (${fmtCount(totalSuppliers)})` : ''
  const contactsBadge = totalContacts && totalContacts > 0 ? ` (${fmtCount(totalContacts)})` : ''

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-3">
        <TabsTrigger value="overview" className="gap-1.5">
          <LayoutGrid className="h-3.5 w-3.5" />
          Overview
        </TabsTrigger>
        <TabsTrigger value="suppliers" className="gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          Suppliers{suppliersBadge}
        </TabsTrigger>
        <TabsTrigger value="contacts" className="gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Contacts{contactsBadge}
        </TabsTrigger>
      </TabsList>

      {/* ── Overview ────────────────────────────────────────────────────── */}
      <TabsContent value="overview" className="mt-6">
        {overview}
      </TabsContent>

      {/* ── Suppliers tab — Phase B (table + filters + pagination) ──────── */}
      <TabsContent value="suppliers" className="mt-6">
        <SuppliersTable facets={suppliersFacets} initialPage={suppliersInitialPage} />
      </TabsContent>

      {/* ── Contacts tab — Phase C placeholder ──────────────────────────── */}
      <TabsContent value="contacts" className="mt-6">
        <div className="rounded-xl bg-muted/30 p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-2">
            Supplier contact directory
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Searchable directory of named contacts at suppliers in the database — same
            layout as the Forge Capital Contacts tab. Lands after the Suppliers tab.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  )
}
