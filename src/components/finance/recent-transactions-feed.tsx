/**
 * @file recent-transactions-feed.tsx — Combined transaction feed
 *
 * @description Shows recent financial transactions across all sources:
 * orders, payments, escrow releases, payouts, top-ups.
 */

'use client'

import {
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  CreditCard,
  Banknote,
  Receipt,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/types/payments'
import type { RecentTransaction, TransactionType } from '@/types/finance'

interface RecentTransactionsFeedProps {
  transactions: RecentTransaction[]
  className?: string
}

const typeConfig: Record<TransactionType, {
  icon: React.ComponentType<{ className?: string }>
  label: string
  isInflow: boolean
}> = {
  order_payment: { icon: Receipt, label: 'Order Payment', isInflow: true },
  escrow_release: { icon: Banknote, label: 'Escrow Release', isInflow: true },
  payout: { icon: ArrowUpRight, label: 'Payout', isInflow: false },
  top_up: { icon: CreditCard, label: 'Top Up', isInflow: true },
  refund: { icon: RefreshCw, label: 'Refund', isInflow: false },
  retainer_payment: { icon: ArrowDownLeft, label: 'Retainer Payment', isInflow: true },
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function RecentTransactionsFeed({ transactions, className }: RecentTransactionsFeedProps) {
  if (transactions.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {transactions.map((txn) => {
            const config = typeConfig[txn.type]
            const Icon = config.icon
            const isPositive = config.isInflow && txn.amount > 0

            return (
              <div
                key={txn.id}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'h-8 w-8 rounded-lg flex items-center justify-center',
                    isPositive ? 'bg-status-success/10' : 'bg-muted'
                  )}>
                    <Icon className={cn(
                      'h-4 w-4',
                      isPositive ? 'text-status-success' : 'text-muted-foreground'
                    )} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">{txn.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {config.label} · {formatRelativeDate(txn.createdAt)}
                    </p>
                  </div>
                </div>
                <p className={cn(
                  'text-sm font-semibold tabular-nums',
                  isPositive ? 'text-status-success' : 'text-foreground'
                )}>
                  {isPositive ? '+' : ''}{formatCurrency(txn.amount, txn.currency)}
                </p>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
