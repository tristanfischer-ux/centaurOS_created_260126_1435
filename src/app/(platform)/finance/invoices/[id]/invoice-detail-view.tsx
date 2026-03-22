/**
 * @file invoice-detail-view.tsx — Client component for invoice detail display
 *
 * @description Renders full invoice details with line items, totals, status
 * management, and payment link QR code/share options.
 */

'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, Send, XCircle, RefreshCw, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PaymentLinkGenerator } from '@/components/finance/invoices/payment-link-generator'
import { toast } from 'sonner'
import { updateInvoiceStatus, createPaymentLink } from '@/actions/finance-invoices'
import { formatCurrency } from '@/types/payments'
import type { StandaloneInvoice, PaymentLink } from '@/types/finance'

interface InvoiceDetailViewProps {
  invoice: StandaloneInvoice
  paymentLink: PaymentLink | null
}

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'warning'> = {
  draft: 'secondary',
  sent: 'default',
  paid: 'success',
  overdue: 'destructive',
  cancelled: 'warning',
}

export function InvoiceDetailView({ invoice: initialInvoice, paymentLink: initialLink }: InvoiceDetailViewProps) {
  const [invoice, setInvoice] = useState(initialInvoice)
  const [link, setLink] = useState<PaymentLink | null>(initialLink)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleMarkSent = () => {
    setError(null)
    startTransition(async () => {
      const result = await updateInvoiceStatus(invoice.id, 'sent')
      if (result.error) { setError(result.error); return }
      if (result.data) { setInvoice(result.data); toast.success('Invoice marked as sent') }
    })
  }

  const handleMarkPaid = () => {
    setError(null)
    startTransition(async () => {
      const result = await updateInvoiceStatus(invoice.id, 'paid')
      if (result.error) { setError(result.error); return }
      if (result.data) { setInvoice(result.data); toast.success('Invoice marked as paid') }
    })
  }

  const handleCancel = () => {
    setError(null)
    startTransition(async () => {
      const result = await updateInvoiceStatus(invoice.id, 'cancelled')
      if (result.error) { setError(result.error); return }
      if (result.data) { setInvoice(result.data); toast.success('Invoice cancelled') }
    })
  }

  const handleGenerateLink = () => {
    setError(null)
    startTransition(async () => {
      const result = await createPaymentLink({
        amount: invoice.total,
        currency: invoice.currency,
        description: `Invoice ${invoice.invoiceNumber} — ${invoice.recipientName}`,
        invoiceId: invoice.id,
      })
      if (result.error) { setError(result.error); return }
      if (result.data) setLink(result.data)
    })
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/finance/invoices">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-foreground">
              {invoice.invoiceNumber}
            </h1>
            <Badge variant={STATUS_BADGE[invoice.status] ?? 'secondary'}>
              {invoice.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            To: {invoice.recipientName} ({invoice.recipientEmail})
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Header row */}
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground border-b border-border pb-2">
                  <div className="col-span-6">Description</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2 text-right">Price</div>
                  <div className="col-span-2 text-right">Amount</div>
                </div>
                {invoice.lineItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 text-sm">
                    <div className="col-span-6">{item.description}</div>
                    <div className="col-span-2 text-right text-muted-foreground">{item.quantity}</div>
                    <div className="col-span-2 text-right text-muted-foreground">
                      {formatCurrency(item.unitPrice, invoice.currency)}
                    </div>
                    <div className="col-span-2 text-right font-medium">
                      {formatCurrency(item.amount, invoice.currency)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-border mt-4 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">VAT (20%)</span>
                  <span>{formatCurrency(invoice.vatAmount, invoice.currency)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(invoice.total, invoice.currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Due date</p>
                  <p className="font-medium">
                    {new Date(invoice.dueDate).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {new Date(invoice.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                {invoice.isRecurring && invoice.recurrenceInterval && (
                  <div>
                    <p className="text-muted-foreground">Recurrence</p>
                    <p className="font-medium capitalize">{invoice.recurrenceInterval}</p>
                  </div>
                )}
              </div>
              {invoice.notes && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {invoice.status === 'draft' && (
              <Button onClick={handleMarkSent} disabled={isPending}>
                <Send className="h-4 w-4 mr-2" />
                Mark as Sent
              </Button>
            )}
            {(invoice.status === 'sent' || invoice.status === 'overdue') && (
              <Button
                onClick={handleMarkPaid}
                disabled={isPending}
                className="bg-status-success hover:bg-status-success/90 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark as Paid
              </Button>
            )}
            {(invoice.status === 'draft' || invoice.status === 'sent') && (
              <Button variant="outline" onClick={handleCancel} disabled={isPending}>
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
            {!link && invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
              <Button variant="outline" onClick={handleGenerateLink} disabled={isPending}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate Payment Link
              </Button>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>

        {/* Payment Link Sidebar */}
        <div>
          {link ? (
            <PaymentLinkGenerator link={link} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No payment link generated yet.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
