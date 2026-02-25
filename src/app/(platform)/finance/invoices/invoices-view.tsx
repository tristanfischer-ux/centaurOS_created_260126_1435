/**
 * @file invoices-view.tsx — Client component for the Invoices page
 *
 * @description Displays both marketplace invoices (from orders) and
 * standalone invoices in a filterable view with aging bucket indicators
 * and quick Mark Paid action on hover.
 */

'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { FileText, Plus, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/types/payments'
import { updateInvoiceStatus } from '@/actions/finance-invoices'
import type { OutstandingInvoice, AgingBucket, StandaloneInvoice } from '@/types/finance'

interface InvoicesViewProps {
  initialInvoices: OutstandingInvoice[]
  standaloneInvoices: StandaloneInvoice[]
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

const invoiceStatusVariants: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'warning'> = {
  draft: 'secondary',
  sent: 'default',
  paid: 'success',
  overdue: 'destructive',
  cancelled: 'warning',
}

type FilterValue = 'all' | AgingBucket
type Tab = 'outstanding' | 'standalone'

export function InvoicesView({ initialInvoices, standaloneInvoices: initialStandaloneInvoices }: InvoicesViewProps) {
  const [filter, setFilter] = useState<FilterValue>('all')
  const [tab, setTab] = useState<Tab>('outstanding')
  const [invoices, setInvoices] = useState(initialStandaloneInvoices)
  const [isPending, startTransition] = useTransition()

  const filteredOutstanding = filter === 'all'
    ? initialInvoices
    : initialInvoices.filter(inv => inv.agingBucket === filter)

  const totalOutstanding = filteredOutstanding.reduce((sum, inv) => sum + inv.amount, 0)

  const handleMarkPaid = (invoiceId: string) => {
    // Optimistic update — badge flips to paid immediately
    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: 'paid' as const } : inv))
    startTransition(async () => {
      const result = await updateInvoiceStatus(invoiceId, 'paid')
      if (result.error) {
        // Revert on failure
        setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: 'sent' as const } : inv))
        toast.error('Failed to mark invoice as paid')
      } else if (result.data) {
        setInvoices(prev => prev.map(inv => inv.id === invoiceId ? result.data! : inv))
        toast.success('Invoice marked as paid')
      }
    })
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Invoices</h1>
            <p className="text-sm text-muted-foreground">Track payments and manage invoices</p>
          </div>
        </div>
        <Link href="/finance/invoices/new">
          <Button className="bg-international-orange hover:bg-international-orange/90">
            <Plus className="h-4 w-4 mr-2" />
            New Invoice
          </Button>
        </Link>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab('outstanding')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'outstanding'
              ? 'border-international-orange text-international-orange'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Outstanding ({initialInvoices.length})
        </button>
        <button
          onClick={() => setTab('standalone')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'standalone'
              ? 'border-international-orange text-international-orange'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Invoices ({invoices.length})
        </button>
      </div>

      {/* Outstanding tab */}
      {tab === 'outstanding' && (
        <>
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
            <span>{filteredOutstanding.length} invoice{filteredOutstanding.length !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span className="font-semibold text-foreground">
              {formatCurrency(totalOutstanding, 'GBP')} total
            </span>
          </div>

          {/* List */}
          {filteredOutstanding.length === 0 ? (
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
                  {filteredOutstanding.map((invoice) => (
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
        </>
      )}

      {/* Standalone invoices tab */}
      {tab === 'standalone' && (
        <>
          {invoices.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  No invoices created yet.
                </p>
                <Link href="/finance/invoices/new">
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create your first invoice
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between py-3 border-b border-border last:border-0 hover:bg-muted/50 -mx-4 px-4 rounded transition-colors group"
                    >
                      <Link href={`/finance/invoices/${invoice.id}`} className="flex-1 space-y-0.5 min-w-0 mr-3">
                        <p className="text-sm font-medium text-foreground">
                          {invoice.invoiceNumber}
                        </p>
                        <p className="text-xs text-muted-foreground">{invoice.recipientName}</p>
                        <p className="text-xs text-muted-foreground">
                          Due: {new Date(invoice.dueDate).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </Link>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(invoice.status === 'sent' || invoice.status === 'overdue') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2"
                            onClick={() => handleMarkPaid(invoice.id)}
                            disabled={isPending}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-status-success" />
                            <span className="text-xs">Paid</span>
                          </Button>
                        )}
                        <Badge variant={invoiceStatusVariants[invoice.status] ?? 'secondary'}>
                          {invoice.status}
                        </Badge>
                        {invoice.isRecurring && (
                          <Badge variant="outline">recurring</Badge>
                        )}
                        <p className="text-sm font-semibold text-foreground tabular-nums min-w-[80px] text-right">
                          {formatCurrency(invoice.total, invoice.currency)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
