/**
 * @file invoices-view.tsx — Client component for the Invoices page
 *
 * @description Displays invoices in a filterable table with aging bucket
 * indicators and totals summary.
 */

'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/types/payments'
import type { OutstandingInvoice, AgingBucket } from '@/types/finance'

interface InvoicesViewProps {
  initialInvoices: OutstandingInvoice[]
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

type FilterValue = 'all' | AgingBucket

export function InvoicesView({ initialInvoices }: InvoicesViewProps) {
  const [filter, setFilter] = useState<FilterValue>('all')

  const filtered = filter === 'all'
    ? initialInvoices
    : initialInvoices.filter(inv => inv.agingBucket === filter)

  const totalAmount = filtered.reduce((sum, inv) => sum + inv.amount, 0)

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
          <FileText className="h-5 w-5 text-international-orange" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">Track outstanding payments and aging</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'current', '30d', '60d', '90d+'] as FilterValue[]).map((value) => (
          <Button
            key={value}
            variant={filter === value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(value)}
            className={cn(filter === value && 'bg-international-orange hover:bg-international-orange/90')}
          >
            {value === 'all' ? 'All' : bucketLabels[value as AgingBucket]}
          </Button>
        ))}
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span className="font-semibold text-foreground">
          {formatCurrency(totalAmount, 'GBP')} total
        </span>
      </div>

      {/* Invoices List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {filter === 'all'
                ? 'No outstanding invoices. All caught up!'
                : `No invoices in the "${bucketLabels[filter as AgingBucket]}" bucket.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {filtered.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between py-3 border-b border-border last:border-0"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {invoice.orderNumber ?? `Order ${invoice.orderId.slice(0, 8)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">{invoice.counterparty}</p>
                    {invoice.dueDate && (
                      <p className="text-xs text-muted-foreground">
                        Due: {new Date(invoice.dueDate).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={bucketVariants[invoice.agingBucket]}>
                      {bucketLabels[invoice.agingBucket]}
                    </Badge>
                    <p className="text-sm font-semibold text-foreground tabular-nums min-w-[80px] text-right">
                      {formatCurrency(invoice.amount, invoice.currency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
