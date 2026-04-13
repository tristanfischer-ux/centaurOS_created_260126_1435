/**
 * @file page.tsx — Finance Invoices listing page
 *
 * @description Displays all invoices (marketplace orders + standalone)
 * with filtering by status and aging buckets.
 */

import type { Metadata } from 'next'
import { getOutstandingInvoices } from '@/actions/finance-dashboard'
import { getStandaloneInvoices } from '@/actions/finance-invoices'
import { InvoicesView } from './invoices-view'

export const metadata: Metadata = {
  title: 'Invoices | Finance',
  description: 'View and manage your invoices and payment status',
}

export default async function InvoicesPage(): Promise<React.ReactNode> {
  const [outstandingResult, standaloneResult] = await Promise.all([
    getOutstandingInvoices().catch(() => ({ data: null, error: 'Failed to load invoices' })),
    getStandaloneInvoices().catch(() => ({ data: null, error: 'Failed to load invoices' })),
  ])

  return (
    <InvoicesView
      initialInvoices={outstandingResult.data ?? []}
      standaloneInvoices={standaloneResult.data ?? []}
    />
  )
}
