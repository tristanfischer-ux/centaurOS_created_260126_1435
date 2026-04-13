/**
 * @file page.tsx — Finance Hub dashboard page
 *
 * @description Server component that performs parallel data fetches for the
 * finance dashboard, then passes initial data to the client view component.
 * Follows the same pattern as today/page.tsx.
 */

import type { Metadata } from 'next'
import {
  getFinanceDashboardData,
  getRevenueTrend,
  getRecentTransactions,
  getOutstandingInvoices,
  getExpenseBreakdown,
} from '@/actions/finance-dashboard'
import { FinanceHubView } from './finance-hub-view'

export const metadata: Metadata = {
  title: 'Finance',
  description: 'Your unified financial dashboard — revenue, expenses, cash flow, and invoices at a glance',
  openGraph: {
    title: 'Finance | ForgeOS',
    description: 'Your unified financial dashboard — revenue, expenses, cash flow, and invoices at a glance',
    type: 'website',
  },
}

export default async function FinancePage(): Promise<React.ReactNode> {
  const [dashboardResult, trendResult, transactionsResult, invoicesResult, expenseResult] = await Promise.all([
    getFinanceDashboardData().catch(() => ({ data: null, error: 'Failed to load dashboard' })),
    getRevenueTrend(6).catch(() => ({ data: null, error: 'Failed to load trend' })),
    getRecentTransactions(10).catch(() => ({ data: null, error: 'Failed to load transactions' })),
    getOutstandingInvoices().catch(() => ({ data: null, error: 'Failed to load invoices' })),
    getExpenseBreakdown().catch(() => ({ data: null, error: 'Failed to load expenses' })),
  ])

  return (
    <FinanceHubView
      initialDashboard={dashboardResult.data}
      initialTrend={trendResult.data ?? []}
      initialTransactions={transactionsResult.data ?? []}
      initialInvoices={invoicesResult.data ?? []}
      initialExpenses={expenseResult.data ?? []}
      hasError={!dashboardResult.data}
    />
  )
}
