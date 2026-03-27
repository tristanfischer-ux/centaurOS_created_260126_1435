/**
 * @file finance-hub-view.tsx — Client component for the Finance Hub dashboard
 *
 * @description Renders the full finance dashboard with KPI cards, charts,
 * transaction feed, outstanding invoices, and quick actions.
 */

'use client'

import { useCallback } from 'react'
import { PoundSterling } from 'lucide-react'
import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { InsightCardSkeleton } from '@/components/specialists/insight-card-skeleton'
import { usePageInsights } from '@/hooks/use-page-insights'
import { useAdvisorPanel } from '@/contexts/advisor-panel-context'
import { generateFinanceHubInsights } from '@/actions/specialist-page-insights'
import type { AgentInsight } from '@/actions/agent-insights'
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

// INTENT: Static coaching insight when no finance data yet — no API call needed
const EMPTY_STATE_INSIGHT: AgentInsight = {
  id: 'finn-finance-hub-empty',
  foundry_id: '',
  specialist_id: 'finance-lead',
  insight_type: 'recommendation',
  urgency: 'informational',
  title: 'Your finance dashboard',
  body: 'Your finance dashboard brings together revenue, expenses, and cash flow. Connect an accounting integration for real-time data.',
  domain_data: {},
  suggested_actions: [],
  is_read: false,
  is_dismissed: false,
  acted_on: false,
  acted_on_at: null,
  created_at: new Date().toISOString(),
  expires_at: null,
}

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

  // Finn's proactive insights
  const { openPanel } = useAdvisorPanel()
  const handleDiscuss = useCallback((specialistId: string, context: string) => {
    openPanel(specialistId, { handoffContext: context, contextLabel: 'Finance' })
  }, [openPanel])
  const { insights, dismissInsight, isLoading: insightsLoading } = usePageInsights(
    (fast) => generateFinanceHubInsights({
      monthlyRevenue: current.monthlyRevenue,
      monthlyExpenses: current.monthlyExpenses,
      outstandingInvoiceCount: current.outstandingInvoicesCount,
      outstandingAmount: current.outstandingInvoicesAmount,
      overdueAmount: current.overdueAmount,
      cashPosition: current.cashPosition,
    }, fast),
    true,
    { cacheKey: 'finn-finance-hub', emptyInsight: EMPTY_STATE_INSIGHT },
  )

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

      {/* Finn's proactive insights */}
      {insightsLoading && <InsightCardSkeleton />}
      {insights.length > 0 && (
        <div className="space-y-3">
          {insights.map((insight) => (
            <SpecialistInsightCard
              key={insight.id}
              insight={insight}
              onDismiss={() => dismissInsight(insight.id)}
              onDiscuss={handleDiscuss}
              compact
            />
          ))}
        </div>
      )}

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
