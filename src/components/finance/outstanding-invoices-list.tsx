/**
 * @file outstanding-invoices-list.tsx — Table showing unpaid invoices with aging buckets
 *
 * @description Displays outstanding invoices grouped by aging bucket (Current, 30d, 60d, 90d+)
 * with visual indicators for urgency.
 */

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/types/payments'
import type { OutstandingInvoice, AgingBucket } from '@/types/finance'

interface OutstandingInvoicesListProps {
  invoices: OutstandingInvoice[]
  className?: string
}

const bucketLabels: Record<AgingBucket, string> = {
  current: 'Current',
  '30d': '1-30 days',
  '60d': '31-60 days',
  '90d+': '90+ days',
}

const bucketVariants: Record<AgingBucket, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  current: 'secondary',
  '30d': 'outline',
  '60d': 'default',
  '90d+': 'destructive',
}

export function OutstandingInvoicesList({ invoices, className }: OutstandingInvoicesListProps) {
  if (invoices.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Outstanding Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No outstanding invoices. All caught up!</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Outstanding Invoices
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({invoices.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {invoice.orderNumber ?? `Order ${invoice.orderId.slice(0, 8)}`}
                </p>
                <p className="text-xs text-muted-foreground">{invoice.counterparty}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={bucketVariants[invoice.agingBucket]}>
                  {bucketLabels[invoice.agingBucket]}
                </Badge>
                <p className="text-sm font-semibold text-foreground tabular-nums">
                  {formatCurrency(invoice.amount, invoice.currency)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
