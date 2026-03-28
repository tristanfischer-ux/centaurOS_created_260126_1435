/**
 * @file finance-hub-view.tsx — Client component for the Finance Hub dashboard
 *
 * @description Renders the full finance dashboard with KPI cards, charts,
 * transaction feed, outstanding invoices, and quick actions.
 */

'use client'

import { useMemo } from 'react'
import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'
import { usePageBriefing } from '@/hooks/use-page-briefing'
import { generatePageBriefing } from '@/actions/specialist-page-insights'
import { typography } from '@/lib/design-system'
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
        <div>
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Finance</h1>
          </div>
          <p className={typography.pageSubtitle}>Your financial overview</p>
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

  // ── AI Briefing ──────────────────────────────────────────────────────────
  const briefingContext = useMemo(() => {
    return `Revenue: £${current.monthlyRevenue / 100}, Expenses: £${current.monthlyExpenses / 100}, Outstanding invoices: ${current.outstandingInvoicesCount} (£${current.outstandingInvoicesAmount / 100}), Overdue: £${current.overdueAmount / 100}`
  }, [current])

  const briefingSeverity = useMemo(() => {
    return current.overdueAmount > 0 ? 'warning' as const : 'success' as const
  }, [current.overdueAmount])

  const briefing = usePageBriefing(
    () => generatePageBriefing('finance-lead', briefingContext, briefingSeverity),
    briefingSeverity,
    true,
    'briefing-finance-hub',
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div>
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>Finance</h1>
        </div>
        <p className={typography.pageSubtitle}>Your unified financial dashboard</p>
      </div>

      {/* Finn's briefing */}
      <SpecialistBriefingHero
        specialistId="finance-lead"
        specialistName="Finn"
        specialistTitle="Finance Lead"
        narrative={briefing.narrative}
        fallbackMessage="Your finance dashboard brings together revenue, expenses, and cash flow. The more data you connect, the sharper my advice becomes."
        isLoading={briefing.isLoading}
        severity={briefing.severity}
        context={{ type: 'general', title: 'Finance Hub', description: 'Financial overview and insights', metadata: {} }}
        storageKey="finance-hub"
      />

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
