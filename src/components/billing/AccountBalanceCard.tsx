'use client'

/**
 * Account Balance Card
 * Displays current balance and allows top-up
 */

import { useState, useEffect } from 'react'
import { Wallet, Plus, History, Loader2, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { AccountBalance, BalanceTransaction, formatAmount } from '@/types/billing'
import { getAccountBalance, getBalanceTransactions } from '@/actions/billing'
import { TopUpDialog } from './TopUpDialog'
import { format } from 'date-fns'

interface AccountBalanceCardProps {
  className?: string
}

export function AccountBalanceCard({ className }: AccountBalanceCardProps) {
  const [balance, setBalance] = useState<AccountBalance | null>(null)
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showTopUp, setShowTopUp] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    const [balanceResult, transactionsResult] = await Promise.all([
      getAccountBalance(),
      getBalanceTransactions(5),
    ])
    
    if (balanceResult.balance) {
      setBalance(balanceResult.balance)
    }
    setTransactions(transactionsResult.transactions)
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleTopUpSuccess = (newBalance: number) => {
    if (balance) {
      setBalance({ ...balance, balanceAmount: newBalance })
    }
    setShowTopUp(false)
    loadData() // Reload transactions
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'top_up':
        return <Plus className="h-4 w-4 text-status-success" />
      case 'spend':
        return <TrendingUp className="h-4 w-4 text-destructive rotate-180" />
      case 'refund':
        return <Plus className="h-4 w-4 text-status-info" />
      default:
        return <History className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case 'top_up':
        return 'Top-up'
      case 'spend':
        return 'Payment'
      case 'refund':
        return 'Refund'
      case 'adjustment':
        return 'Adjustment'
      case 'withdrawal':
        return 'Withdrawal'
      default:
        return type
    }
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Account Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="text-3xl font-bold">
                {formatAmount(balance?.balanceAmount || 0, 'GBP')}
              </p>
              <p className="text-sm text-muted-foreground">
                Available balance
              </p>
            </div>
            <Button onClick={() => setShowTopUp(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Top Up
            </Button>
          </div>

          {transactions.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="space-y-1">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium">Recent Activity</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHistory(!showHistory)}
                  >
                    <History className="h-4 w-4 mr-1" />
                    {showHistory ? 'Hide' : 'Show All'}
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {(showHistory ? transactions : transactions.slice(0, 3)).map(tx => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        {getTransactionIcon(tx.transactionType)}
                        <div>
                          <p className="font-medium">
                            {getTransactionLabel(tx.transactionType)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(tx.createdAt), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'font-medium',
                          tx.amount > 0 ? 'text-status-success' : 'text-foreground'
                        )}
                      >
                        {tx.amount > 0 ? '+' : ''}{formatAmount(tx.amount, 'GBP')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {balance?.balanceAmount === 0 && transactions.length === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">
                Add funds to pay faster without entering card details each time
              </p>
              <Button variant="outline" onClick={() => setShowTopUp(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Funds
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <TopUpDialog
        open={showTopUp}
        onOpenChange={setShowTopUp}
        onSuccess={handleTopUpSuccess}
        currentBalance={balance?.balanceAmount || 0}
      />
    </>
  )
}
