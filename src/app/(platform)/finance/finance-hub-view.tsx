/**
 * @file finance-hub-view.tsx — Client component for the Finance Hub dashboard
 *
 * @description Renders the full finance dashboard with KPI cards, charts,
 * transaction feed, outstanding invoices, and quick actions.
 */

'use client'

import { PoundSterling } from 'lucide-react'
import { FinanceKpiCards } from '@/components/finance/kpi-cards'
import { RevenueTrendChart } from '@/components/finance/revenue-trend-chart'
import { ExpenseBreakdownChart } from '@/components/finance/expense-breakdown-chart'
import { OutstandingInvoicesList } from '@/components/finance/outstanding-invoices-list'
import { RecentTransactionsFeed } from '@/components/finance/recent-transactions-feed'
import { QuickActionsBar } from '@/components/finance/quick-actions-bar'
import type {
  FinanceDashboardData,
  FinanceDashboardComparison,
  RevenueTrendPoint,
  RecentTransaction,
  OutstandingInvoice,
  ExpenseCategory,
} from '@/types/finance'

interface FinanceHubViewProps {
  initialDashboard: { current: FinanceDashboardData; comparison: FinanceDashboardComparison } | null
  initialTrend: RevenueTrendPoint[]
  initialTransactions: RecentTransaction[]
  initialInvoices: OutstandingInvoice[]
  initialExpenses: ExpenseCategory[]
  hasError: boolean
}

export function FinanceHubView({
  initialDashboard,
  initialTrend,
  initialTransactions,
  initialInvoices,
  initialExpenses,
  hasError,
}: FinanceHubViewProps) {
  if (hasError || !initialDashboard) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
            <PoundSterling className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Finance</h1>
            <p className="text-sm text-muted-foreground">Your financial overview</p>
          </div>
        </div>
        <div className="text-center py-16 space-y-3">
          <p className="text-sm text-muted-foreground">
            Unable to load financial data. This could be because you haven&apos;t set up any financial activity yet.
          </p>
          <p className="text-sm text-muted-foreground">
            Start by creating orders in the Marketplace or setting up your Money Map.
          </p>
        </div>
      </div>
    )
  }

  const { current, comparison } = initialDashboard

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
          <PoundSterling className="h-5 w-5 text-international-orange" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Finance</h1>
          <p className="text-sm text-muted-foreground">Your unified financial dashboard</p>
        </div>
      </div>

      {/* Quick Actions */}
      <QuickActionsBar />

      {/* KPI Cards */}
      <FinanceKpiCards data={current} comparison={comparison} />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueTrendChart
          data={initialTrend}
          currency={current.currency}
        />
        <ExpenseBreakdownChart data={initialExpenses} />
      </div>

      {/* Transactions & Invoices Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentTransactionsFeed transactions={initialTransactions} />
        <OutstandingInvoicesList invoices={initialInvoices} />
      </div>
    </div>
  )
}
