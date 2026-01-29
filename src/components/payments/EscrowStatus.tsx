'use client'

/**
 * EscrowStatus Component
 * Visual display of escrow status with transaction timeline
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Wallet,
  Building2,
  RefreshCw,
  TrendingUp,
  Minus,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/types/payments'
import type {
  EscrowStatusProps,
  EscrowTransaction,
  EscrowStatus as EscrowStatusType,
  EscrowTransactionType,
} from '@/types/payments'
import { getPaymentStatus } from '@/actions/payments'

interface EscrowStatusDisplayProps extends EscrowStatusProps {
  totalAmount?: number
  currency?: string
  transactions?: EscrowTransaction[]
  escrowStatus?: EscrowStatusType
  totalHeld?: number
  totalReleased?: number
  totalRefunded?: number
  pendingRelease?: number
}

const STATUS_CONFIG: Record<
  EscrowStatusType,
  { label: string; color: string; icon: React.ReactNode; description: string }
> = {
  pending: {
    label: 'Awaiting Payment',
    color: 'bg-amber-100 text-amber-800',
    icon: <Clock className="h-4 w-4" />,
    description: 'Payment has not been received yet',
  },
  held: {
    label: 'Funds Held in Escrow',
    color: 'bg-blue-100 text-blue-800',
    icon: <Shield className="h-4 w-4" />,
    description: 'Payment received and securely held',
  },
  partial_release: {
    label: 'Partially Released',
    color: 'bg-purple-100 text-purple-800',
    icon: <TrendingUp className="h-4 w-4" />,
    description: 'Some funds released, balance remaining',
  },
  released: {
    label: 'Fully Released',
    color: 'bg-green-100 text-green-800',
    icon: <CheckCircle2 className="h-4 w-4" />,
    description: 'All funds released to seller',
  },
  refunded: {
    label: 'Refunded',
    color: 'bg-red-100 text-red-800',
    icon: <RefreshCw className="h-4 w-4" />,
    description: 'Funds returned to buyer',
  },
}

const TRANSACTION_CONFIG: Record<
  EscrowTransactionType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  deposit: {
    label: 'Payment Deposited',
    icon: <Plus className="h-3 w-3" />,
    color: 'text-blue-600',
  },
  hold: {
    label: 'Funds Held in Escrow',
    icon: <Shield className="h-3 w-3" />,
    color: 'text-blue-600',
  },
  release: {
    label: 'Released to Seller',
    icon: <ArrowRight className="h-3 w-3" />,
    color: 'text-green-600',
  },
  refund: {
    label: 'Refunded to Buyer',
    icon: <RefreshCw className="h-3 w-3" />,
    color: 'text-red-600',
  },
  fee_deduction: {
    label: 'Platform Fee',
    icon: <Minus className="h-3 w-3" />,
    color: 'text-slate-500',
  },
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Transaction Timeline Item
 */
function TransactionItem({
  transaction,
  currency,
}: {
  transaction: EscrowTransaction
  currency: string
}) {
  const config = TRANSACTION_CONFIG[transaction.type]

  return (
    <div className="flex items-start gap-3 pb-4 last:pb-0">
      <div
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full bg-slate-100',
          config.color
        )}
      >
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={cn('text-sm font-medium', config.color)}>{config.label}</span>
          <span className="text-sm font-mono tabular-nums">
            {transaction.type === 'fee_deduction' || transaction.type === 'release' || transaction.type === 'refund'
              ? `-${formatCurrency(transaction.amount, currency)}`
              : `+${formatCurrency(transaction.amount, currency)}`}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(transaction.createdAt)}</p>
        {transaction.stripeTransferId && (
          <p className="text-xs text-muted-foreground font-mono">
            Transfer: {transaction.stripeTransferId.slice(0, 20)}...
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Main EscrowStatus Component
 */
export function EscrowStatus({
  orderId,
  showTimeline = true,
  totalAmount,
  currency = 'GBP',
  transactions: propTransactions,
  escrowStatus: propStatus,
  totalHeld: propTotalHeld,
  totalReleased: propTotalReleased,
  totalRefunded: propTotalRefunded,
  pendingRelease: propPendingRelease,
}: EscrowStatusDisplayProps) {
  const [isLoading, setIsLoading] = useState(!propStatus)
  const [status, setStatus] = useState<EscrowStatusType | null>(propStatus || null)
  const [transactions, setTransactions] = useState<EscrowTransaction[]>(propTransactions || [])
  const [totalHeld, setTotalHeld] = useState(propTotalHeld || 0)
  const [totalReleased, setTotalReleased] = useState(propTotalReleased || 0)
  const [totalRefunded, setTotalRefunded] = useState(propTotalRefunded || 0)
  const [pendingRelease, setPendingRelease] = useState(propPendingRelease || 0)

  useEffect(() => {
    // If we have all the props, don't fetch
    if (propStatus) {
      setStatus(propStatus)
      setIsLoading(false)
      return
    }

    async function fetchStatus() {
      try {
        const result = await getPaymentStatus(orderId)
        if (result.data) {
          setStatus(result.data.order.escrowStatus)
          setTransactions(result.data.escrowTransactions)
          setTotalHeld(result.data.totalHeld)
          setTotalReleased(result.data.totalReleased)
          setTotalRefunded(result.data.totalRefunded)
          setPendingRelease(result.data.pendingRelease)
        }
      } catch (error) {
        console.error('Error fetching escrow status:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStatus()
  }, [orderId, propStatus])

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            <p>Unable to load escrow status</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const statusConfig = STATUS_CONFIG[status]
  const effectiveTotalAmount = totalAmount || totalHeld
  const releaseProgress = effectiveTotalAmount > 0 
    ? Math.round(((totalReleased + totalRefunded) / effectiveTotalAmount) * 100) 
    : 0

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-blue-600" />
            Escrow Status
          </CardTitle>
          <Badge className={cn('flex items-center gap-1', statusConfig.color)}>
            {statusConfig.icon}
            {statusConfig.label}
          </Badge>
        </div>
        <CardDescription>{statusConfig.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Balance Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wallet className="h-4 w-4" />
              Held in Escrow
            </div>
            <p className="text-lg font-bold">{formatCurrency(pendingRelease, currency)}</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Building2 className="h-4 w-4" />
              Released
            </div>
            <p className="text-lg font-bold text-green-600">
              {formatCurrency(totalReleased, currency)}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        {effectiveTotalAmount > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment Progress</span>
              <span className="font-medium">{releaseProgress}% complete</span>
            </div>
            <Progress value={releaseProgress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatCurrency(totalReleased + totalRefunded, currency)} processed</span>
              <span>{formatCurrency(effectiveTotalAmount, currency)} total</span>
            </div>
          </div>
        )}

        {/* Transaction Timeline */}
        {showTimeline && transactions.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Transaction History
              </h4>
              <div className="relative">
                <div className="absolute left-3 top-3 bottom-3 w-px bg-slate-200 dark:bg-slate-700" />
                <div className="space-y-4 relative">
                  {transactions.map((tx) => (
                    <TransactionItem key={tx.id} transaction={tx} currency={currency} />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Escrow Protection Info */}
        {status === 'held' && (
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-700 dark:text-blue-300">Protected by Escrow</p>
                <p className="text-blue-600 dark:text-blue-400 mt-0.5">
                  Funds are held securely until work is approved. The seller receives payment only after you confirm delivery.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Compact version for sidebars
 */
export function EscrowStatusCompact({
  escrowStatus,
  totalReleased,
  pendingRelease,
  currency = 'GBP',
}: {
  escrowStatus: EscrowStatusType
  totalHeld?: number
  totalReleased: number
  pendingRelease: number
  currency?: string
}) {
  const statusConfig = STATUS_CONFIG[escrowStatus]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Escrow Status</span>
        <Badge className={cn('text-xs', statusConfig.color)}>
          {statusConfig.label}
        </Badge>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Held</span>
          <span className="font-medium">{formatCurrency(pendingRelease, currency)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Released</span>
          <span className="font-medium text-green-600">{formatCurrency(totalReleased, currency)}</span>
        </div>
      </div>
    </div>
  )
}

export default EscrowStatus
