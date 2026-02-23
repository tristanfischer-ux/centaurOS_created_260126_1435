/**
 * @file aggregation.ts — Pure computation functions for finance data
 *
 * @description No database calls — only transforms and calculations.
 * Designed to be testable in isolation. All monetary values in
 * smallest currency unit (pence).
 */

import type {
  FinanceDashboardData,
  FinanceDashboardComparison,
  RevenueTrendPoint,
  OutstandingInvoice,
  AgingBucket,
  ExpenseCategory,
} from '@/types/finance'

// ============================================================
// Dashboard Aggregation
// ============================================================

interface DashboardInputs {
  /** Wallet balance in pence */
  walletBalance: number
  /** Revenue from orders this month */
  orderRevenue: number
  /** Revenue from retainers this month */
  retainerRevenue: number
  /** Revenue from subscriptions this month */
  subscriptionRevenue: number
  /** Total costs from Money Map cost items */
  monthlyCosts: number
  /** Count of unpaid orders */
  outstandingCount: number
  /** Total value of unpaid orders */
  outstandingAmount: number
  /** Total value of overdue orders */
  overdueAmount: number
  /** Currency code */
  currency: string
}

/**
 * Compute dashboard KPIs from raw data inputs.
 *
 * @param inputs - Pre-fetched financial data
 * @returns Aggregated dashboard data
 */
export function computeDashboardData(inputs: DashboardInputs): FinanceDashboardData {
  const monthlyRevenue = inputs.orderRevenue + inputs.retainerRevenue + inputs.subscriptionRevenue
  const netMargin = monthlyRevenue - inputs.monthlyCosts
  const netMarginPct = monthlyRevenue > 0
    ? (netMargin / monthlyRevenue) * 100
    : 0

  return {
    cashPosition: inputs.walletBalance,
    monthlyRevenue,
    monthlyExpenses: inputs.monthlyCosts,
    netMargin,
    netMarginPct: Math.round(netMarginPct * 10) / 10,
    outstandingInvoicesCount: inputs.outstandingCount,
    outstandingInvoicesAmount: inputs.outstandingAmount,
    overdueAmount: inputs.overdueAmount,
    currency: inputs.currency,
  }
}

/**
 * Compute percentage change between current and previous period.
 *
 * @param current - Current period value
 * @param previous - Previous period value (null if unavailable)
 * @returns Percentage change or null if no comparison data
 */
export function computeChange(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
}

// ============================================================
// Revenue Trend
// ============================================================

/**
 * Generate month labels for the last N months.
 *
 * @param months - Number of months to include
 * @returns Array of { month, label } objects sorted chronologically
 */
export function generateMonthRange(months: number): Array<{ month: string; label: string }> {
  const result: Array<{ month: string; label: string }> = []
  const now = new Date()

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    result.push({ month, label })
  }

  return result
}

/**
 * Merge revenue data from multiple sources into trend points.
 *
 * @param months - Month range to fill
 * @param ordersByMonth - Map of month -> order revenue
 * @param retainersByMonth - Map of month -> retainer revenue
 * @param subscriptionsByMonth - Map of month -> subscription revenue
 * @returns Array of RevenueTrendPoint
 */
export function mergeRevenueTrend(
  months: Array<{ month: string; label: string }>,
  ordersByMonth: Record<string, number>,
  retainersByMonth: Record<string, number>,
  subscriptionsByMonth: Record<string, number>,
): RevenueTrendPoint[] {
  return months.map(({ month, label }) => {
    const orders = ordersByMonth[month] ?? 0
    const retainers = retainersByMonth[month] ?? 0
    const subscriptions = subscriptionsByMonth[month] ?? 0

    return {
      month,
      label,
      revenue: orders + retainers + subscriptions,
      orders,
      retainers,
      subscriptions,
    }
  })
}

// ============================================================
// Aging Buckets
// ============================================================

/**
 * Determine the aging bucket for an invoice based on days past due.
 *
 * @param daysPastDue - Number of days past the due date (0 or negative = current)
 * @returns The aging bucket category
 */
export function getAgingBucket(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return 'current'
  if (daysPastDue <= 30) return '30d'
  if (daysPastDue <= 60) return '60d'
  return '90d+'
}

/**
 * Compute days past due from a due date string.
 *
 * @param dueDate - ISO date string or null
 * @returns Days past due (negative means not yet due)
 */
export function computeDaysPastDue(dueDate: string | null): number {
  if (!dueDate) return 0
  const due = new Date(dueDate)
  const now = new Date()
  const diffMs = now.getTime() - due.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

// ============================================================
// Expense Breakdown
// ============================================================

/**
 * Categorise cost items into expense categories for the donut chart.
 *
 * @param costItems - Array of { category, monthly_amount }
 * @param colorMap - Mapping of category names to chart colors
 * @returns Array of ExpenseCategory sorted by amount descending
 */
export function computeExpenseBreakdown(
  costItems: Array<{ category: string; monthly_amount: number }>,
  colorMap: Record<string, string>,
): ExpenseCategory[] {
  // Group by category
  const grouped: Record<string, number> = {}
  for (const item of costItems) {
    const cat = item.category || 'Other'
    grouped[cat] = (grouped[cat] ?? 0) + item.monthly_amount
  }

  const total = Object.values(grouped).reduce((sum, v) => sum + v, 0)
  if (total === 0) return []

  return Object.entries(grouped)
    .map(([category, amount]) => ({
      category,
      amount,
      color: colorMap[category] ?? colorMap['Other'] ?? 'hsl(217, 91%, 60%)',
      percentage: Math.round((amount / total) * 1000) / 10,
    }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Get the start of the current month as an ISO string.
 */
export function getMonthStart(): string {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Get the start of the previous month as an ISO string.
 */
export function getPreviousMonthStart(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Get the end of the previous month as an ISO string.
 */
export function getPreviousMonthEnd(): string {
  const d = new Date()
  d.setDate(0) // Last day of previous month
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}
