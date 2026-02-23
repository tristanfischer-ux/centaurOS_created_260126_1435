/**
 * @file page.tsx — Invoice detail page with payment link
 *
 * @description Shows full invoice details including line items, totals,
 * status, and an associated payment link with QR code if available.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getStandaloneInvoice } from '@/actions/finance-invoices'
import { getPaymentLinks } from '@/actions/finance-invoices'
import { InvoiceDetailView } from './invoice-detail-view'

export const metadata: Metadata = {
  title: 'Invoice | Finance | ForgeOS',
  description: 'View invoice details and payment link',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function InvoiceDetailPage({ params }: PageProps): Promise<React.ReactNode> {
  const { id } = await params

  const [invoiceResult, linksResult] = await Promise.all([
    getStandaloneInvoice(id).catch(() => ({ data: null, error: 'Failed to load invoice' })),
    getPaymentLinks().catch(() => ({ data: null, error: 'Failed to load payment links' })),
  ])

  if (!invoiceResult.data) {
    notFound()
  }

  // Find the associated payment link
  const paymentLink = invoiceResult.data.paymentLinkId
    ? (linksResult.data ?? []).find(l => l.id === invoiceResult.data!.paymentLinkId) ?? null
    : null

  return (
    <InvoiceDetailView
      invoice={invoiceResult.data}
      paymentLink={paymentLink}
    />
  )
}
