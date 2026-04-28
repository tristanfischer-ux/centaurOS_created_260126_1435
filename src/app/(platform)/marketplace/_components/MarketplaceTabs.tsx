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
import { ContactsTable } from './ContactsTable'
import type {
  SuppliersDirectoryFacets,
  SuppliersDirectoryPageResult,
  SupplierContactsFacets,
  SupplierContactsPageResult,
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
  /** Phase C: facets + first page of contact rows for the Contacts tab. */
  contactsFacets: SupplierContactsFacets
  contactsInitialPage: SupplierContactsPageResult
  /** Whether the current viewer's tier reveals full contact names. */
  isPaid: boolean
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
  contactsFacets,
  contactsInitialPage,
  isPaid,
}: MarketplaceTabsProps) {
  const [tab, setTab] = useState<'overview' | 'suppliers' | 'contacts'>('overview')
  // Lazy-mount: SuppliersTable / ContactsTable only mount on first visit.
  // Prevents their on-mount useEffect fetches from running while the user
  // is on the Overview tab — those async startTransition calls blocked
  // click events on the TabsTriggers (React defers interaction during
  // pending transitions). Mounting on first activation eliminates the race.
  const [suppliersVisited, setSuppliersVisited] = useState(false)
  const [contactsVisited, setContactsVisited] = useState(false)

  const handleTabChange = (v: string): void => {
    const next = v as typeof tab
    setTab(next)
    if (next === 'suppliers') setSuppliersVisited(true)
    if (next === 'contacts') setContactsVisited(true)
  }

  const suppliersBadge = totalSuppliers > 0 ? ` (${fmtCount(totalSuppliers)})` : ''
  // Prefer the prop-supplied total when known; fall back to facets.
  const effectiveContactsCount = totalContacts ?? contactsFacets.totalContacts
  const contactsBadge = effectiveContactsCount > 0 ? ` (${fmtCount(effectiveContactsCount)})` : ''

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
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
        {suppliersVisited && (
          <SuppliersTable facets={suppliersFacets} initialPage={suppliersInitialPage} />
        )}
      </TabsContent>

      {/* ── Contacts tab — Phase C (supplier key-people directory) ──────── */}
      <TabsContent value="contacts" className="mt-6">
        {contactsVisited && (
          <ContactsTable
            facets={contactsFacets}
            initialPage={contactsInitialPage}
            isPaid={isPaid}
          />
        )}
      </TabsContent>
    </Tabs>
  )
}
