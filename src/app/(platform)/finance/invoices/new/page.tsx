/**
 * @file page.tsx — Quick invoice creation page
 *
 * @description Hosts the multi-step invoice wizard for creating
 * standalone invoices with optional payment link generation.
 */

import type { Metadata } from 'next'
import { QuickInvoiceForm } from '@/components/finance/invoices/quick-invoice-form'

export const metadata: Metadata = {
  title: 'New Invoice | Finance',
  description: 'Create a standalone invoice and generate a payment link',
}

export default function NewInvoicePage(): React.ReactNode {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">New Invoice</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a standalone invoice and optionally generate a shareable payment link.
        </p>
      </div>
      <QuickInvoiceForm />
    </div>
  )
}
