/**
 * @file page.tsx — Public payment page (unauthenticated)
 *
 * @description Allows anyone with a payment link to view the amount
 * and complete payment. No authentication required.
 */

import type { Metadata } from 'next'
import { getPaymentLinkByCode } from '@/actions/finance-invoices'
import { PaymentPageView } from './payment-page-view'

interface PageProps {
  params: Promise<{ linkId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { linkId } = await params
  const result = await getPaymentLinkByCode(linkId)

  if (!result.data) {
    return { title: 'Payment Link' }
  }

  const amount = (result.data.amount / 100).toFixed(2)
  return {
    title: `Pay £${amount}`,
    description: result.data.description || `Payment of £${amount}`,
  }
}

export default async function PublicPaymentPage({ params }: PageProps): Promise<React.ReactNode> {
  const { linkId } = await params
  const result = await getPaymentLinkByCode(linkId)

  return (
    <PaymentPageView
      paymentLink={result.data}
      error={result.error}
    />
  )
}
