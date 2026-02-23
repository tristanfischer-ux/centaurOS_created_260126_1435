/**
 * @file page.tsx — Finance Invoices listing page
 *
 * @description Displays all invoices (orders) with filtering by status
 * and aging buckets. Reuses order data from the marketplace.
 */

import type { Metadata } from 'next'
import { getOutstandingInvoices } from '@/actions/finance-dashboard'
import { InvoicesView } from './invoices-view'

export const metadata: Metadata = {
  title: 'Invoices | Finance | ForgeOS',
  description: 'View and manage your invoices and payment status',
}

export default async function InvoicesPage(): Promise<React.ReactNode> {
  const result = await getOutstandingInvoices().catch(() => ({
    data: null,
    error: 'Failed to load invoices',
  }))

  return <InvoicesView initialInvoices={result.data ?? []} />
}
