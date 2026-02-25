'use server'

/**
 * @file finance-dashboard.ts — Server actions for the Finance Hub dashboard
 *
 * @description Aggregation queries for KPIs, revenue trends, transactions,
 * and outstanding invoices. All data comes from existing tables — no new
 * database tables needed.
 *
 * @security All queries filter by foundry_id via getFoundryIdCached().
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import {
  computeDashboardData,
  computeChange,
  generateMonthRange,
  mergeRevenueTrend,
  getMonthStart,
  getPreviousMonthStart,
  getPreviousMonthEnd,
  computeDaysPastDue,
  getAgingBucket,
  computeExpenseBreakdown,
} from '@/lib/finance/aggregation'
import type {
  FinanceActionResult,
  FinanceDashboardData,
  FinanceDashboardComparison,
  RevenueTrendPoint,
  RecentTransaction,
  OutstandingInvoice,
  ExpenseCategory,
  TransactionType,
  TransactionStatus,
} from '@/types/finance'
import { chartColors } from '@/lib/chart-colors'

// ============================================================
// Helpers
// ============================================================

/**
 * Normalise a Money Map amount to monthly based on its period.
 */
function normaliseToMonthly(amount: number, period: string): number {
  switch (period) {
    case 'annual': return amount / 12
    case 'quarterly': return amount / 3
    default: return amount
  }
}

/**
 * Category-to-color mapping for expense breakdown chart.
 */
const EXPENSE_COLORS: Record<string, string> = {
  personnel: 'hsl(14, 100%, 50%)',      // Orange
  infrastructure: 'hsl(217, 91%, 60%)', // Blue
  marketing: 'hsl(258, 90%, 66%)',      // Purple
  operations: 'hsl(38, 92%, 50%)',      // Amber
  other: 'hsl(160, 84%, 39%)',          // Emerald
  Other: 'hsl(160, 84%, 39%)',
}

// ============================================================
// Dashboard Data
// ============================================================

/**
 * Fetch all KPI data for the finance dashboard.
 *
 * @description Performs parallel queries against existing tables:
 * - account_balances (cash position)
 * - orders (revenue, outstanding invoices)
 * - money_map_cost_items (expenses)
 * - retainers + timesheet_entries (retainer revenue)
 *
 * @returns Dashboard data with current period KPIs
 */
export async function getFinanceDashboardData(): Promise<FinanceActionResult<{
  current: FinanceDashboardData
  comparison: FinanceDashboardComparison
}>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const monthStart = getMonthStart()
    const prevMonthStart = getPreviousMonthStart()
    const prevMonthEnd = getPreviousMonthEnd()

    // FLOW: Parallel data fetches — no dependencies between queries
    const [
      balanceResult,
      currentOrdersResult,
      prevOrdersResult,
      outstandingResult,
      costItemsResult,
      retainersResult,
      currentExpensesResult,
    ] = await Promise.all([
      // 1. Cash position from wallet
      supabase
        .from('account_balances')
        .select('balance_amount, currency')
        .eq('user_id', user.id)
        .single(),

      // 2. Orders completed this month (revenue)
      supabase
        .from('orders')
        .select('total_amount, currency')
        .or(`buyer_id.eq.${user.id},seller_id.in.(select id from provider_profiles where user_id = '${user.id}')`)
        .eq('status', 'completed')
        .gte('completed_at', monthStart),

      // 3. Orders completed last month (comparison)
      supabase
        .from('orders')
        .select('total_amount')
        .or(`buyer_id.eq.${user.id},seller_id.in.(select id from provider_profiles where user_id = '${user.id}')`)
        .eq('status', 'completed')
        .gte('completed_at', prevMonthStart)
        .lte('completed_at', prevMonthEnd),

      // 4. Outstanding orders (pending/accepted/in_progress)
      supabase
        .from('orders')
        .select('id, total_amount, created_at')
        .or(`buyer_id.eq.${user.id},seller_id.in.(select id from provider_profiles where user_id = '${user.id}')`)
        .in('status', ['pending', 'accepted', 'in_progress']),

      // 5. Cost items from Money Map
      supabase
        .from('money_map_cost_items')
        .select('amount, period, category')
        .eq('foundry_id', foundryId)
        .eq('is_active', true),

      // 6. Active retainers
      supabase
        .from('retainers')
        .select('hourly_rate, weekly_hours, currency')
        .eq('buyer_id', user.id)
        .eq('status', 'active'),

      // 7. Approved/paid expenses this month — INTENT: include real transactional spend
      // in the monthly cost KPI alongside recurring money-map costs.
      supabase
        .from('finance_expenses')
        .select('amount, category')
        .eq('foundry_id', foundryId)
        .in('status', ['approved', 'paid'])
        .gte('expense_date', monthStart),
    ])

    // Compute wallet balance (in pence)
    const walletBalance = balanceResult.data?.balance_amount ?? 0
    const currency = balanceResult.data?.currency ?? 'GBP'

    // Compute current month order revenue (orders.total_amount is in pounds, convert to pence)
    const orderRevenue = (currentOrdersResult.data ?? [])
      .reduce((sum, o) => sum + Math.round((o.total_amount ?? 0) * 100), 0)

    // Compute retainer monthly revenue (hourly_rate * weekly_hours * ~4.33 weeks)
    const retainerRevenue = (retainersResult.data ?? [])
      .reduce((sum, r) => sum + Math.round((r.hourly_rate ?? 0) * (r.weekly_hours ?? 0) * 4.33 * 100), 0)

    // Compute monthly costs: recurring money-map costs + actual expenses this month
    // Money Map amounts are in pounds; expenses are in pence
    const recurringCosts = (costItemsResult.data ?? [])
      .reduce((sum, c) => sum + Math.round(normaliseToMonthly(c.amount ?? 0, c.period ?? 'monthly') * 100), 0)
    const expenseCosts = (currentExpensesResult.data ?? [])
      .reduce((sum, e) => sum + (e.amount ?? 0), 0)
    const monthlyCosts = recurringCosts + expenseCosts

    // Outstanding invoices
    const outstanding = outstandingResult.data ?? []
    const outstandingAmount = outstanding
      .reduce((sum, o) => sum + Math.round((o.total_amount ?? 0) * 100), 0)

    // DECISION: Use created_at + 30 days as a proxy due date for orders without explicit due_date
    const overdueAmount = outstanding
      .filter(o => {
        const dueDate = new Date(o.created_at ?? Date.now())
        dueDate.setDate(dueDate.getDate() + 30)
        return dueDate < new Date()
      })
      .reduce((sum, o) => sum + Math.round((o.total_amount ?? 0) * 100), 0)

    // Previous month comparison
    const prevOrderRevenue = (prevOrdersResult.data ?? [])
      .reduce((sum, o) => sum + Math.round((o.total_amount ?? 0) * 100), 0)

    const current = computeDashboardData({
      walletBalance,
      orderRevenue,
      retainerRevenue,
      subscriptionRevenue: 0, // Subscription revenue is platform-level, not per-foundry
      monthlyCosts,
      outstandingCount: outstanding.length,
      outstandingAmount,
      overdueAmount,
      currency,
    })

    const comparison: FinanceDashboardComparison = {
      cashPosition: null, // No historical wallet snapshots
      monthlyRevenue: prevOrderRevenue + retainerRevenue, // Retainer assumed stable
      monthlyExpenses: monthlyCosts, // Costs assumed stable month-over-month
      outstandingInvoicesAmount: null,
    }

    return { data: { current, comparison }, error: null }
  } catch (err) {
    console.error('[Finance] Failed to fetch dashboard data:', err)
    return { data: null, error: 'Failed to load financial data' }
  }
}

// ============================================================
// Revenue Trend
// ============================================================

/**
 * Fetch revenue trend data over the last N months.
 *
 * @param months - Number of months to include (default 6)
 * @returns Array of monthly revenue data points
 */
export async function getRevenueTrend(months = 6): Promise<FinanceActionResult<RevenueTrendPoint[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const monthRange = generateMonthRange(months)
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - months)
    startDate.setDate(1)

    // Fetch completed orders in the range
    const { data: orders } = await supabase
      .from('orders')
      .select('total_amount, completed_at')
      .or(`buyer_id.eq.${user.id},seller_id.in.(select id from provider_profiles where user_id = '${user.id}')`)
      .eq('status', 'completed')
      .gte('completed_at', startDate.toISOString())

    // Group orders by month
    const ordersByMonth: Record<string, number> = {}
    for (const order of orders ?? []) {
      if (!order.completed_at) continue
      const d = new Date(order.completed_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      ordersByMonth[key] = (ordersByMonth[key] ?? 0) + Math.round((order.total_amount ?? 0) * 100)
    }

    // Fetch active retainers for a flat monthly estimate
    const { data: retainers } = await supabase
      .from('retainers')
      .select('hourly_rate, weekly_hours, started_at')
      .eq('buyer_id', user.id)
      .eq('status', 'active')

    const monthlyRetainerRevenue = (retainers ?? [])
      .reduce((sum, r) => sum + Math.round((r.hourly_rate ?? 0) * (r.weekly_hours ?? 0) * 4.33 * 100), 0)

    // Spread retainer revenue across months where retainer was active
    const retainersByMonth: Record<string, number> = {}
    for (const { month } of monthRange) {
      retainersByMonth[month] = monthlyRetainerRevenue
    }

    const trend = mergeRevenueTrend(monthRange, ordersByMonth, retainersByMonth, {})

    return { data: trend, error: null }
  } catch (err) {
    console.error('[Finance] Failed to fetch revenue trend:', err)
    return { data: null, error: 'Failed to load revenue trend' }
  }
}

// ============================================================
// Recent Transactions
// ============================================================

/**
 * Fetch recent financial transactions across all sources.
 *
 * @param limit - Maximum number of transactions to return (default 10)
 * @returns Combined and sorted transaction feed
 */
export async function getRecentTransactions(limit = 10): Promise<FinanceActionResult<RecentTransaction[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    // Fetch balance transactions (wallet activity)
    const { data: balanceTxns } = await supabase
      .from('balance_transactions')
      .select('id, transaction_type, amount, description, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    const transactions: RecentTransaction[] = []

    // Map balance transactions
    for (const txn of balanceTxns ?? []) {
      const typeMap: Record<string, TransactionType> = {
        top_up: 'top_up',
        spend: 'order_payment',
        refund: 'refund',
        adjustment: 'top_up',
        withdrawal: 'payout',
      }

      transactions.push({
        id: txn.id,
        type: typeMap[txn.transaction_type] ?? 'order_payment',
        amount: txn.amount ?? 0,
        currency: 'GBP',
        description: txn.description ?? `${txn.transaction_type}`,
        counterparty: null,
        createdAt: txn.created_at ?? new Date().toISOString(),
        status: 'completed' as TransactionStatus,
      })
    }

    // Sort by date descending and limit
    transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return { data: transactions.slice(0, limit), error: null }
  } catch (err) {
    console.error('[Finance] Failed to fetch recent transactions:', err)
    return { data: null, error: 'Failed to load transactions' }
  }
}

// ============================================================
// Outstanding Invoices
// ============================================================

/**
 * Fetch outstanding (unpaid) invoices with aging information.
 *
 * @returns Array of outstanding invoices with aging buckets
 */
export async function getOutstandingInvoices(): Promise<FinanceActionResult<OutstandingInvoice[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, currency, created_at, buyer_id')
      .or(`buyer_id.eq.${user.id},seller_id.in.(select id from provider_profiles where user_id = '${user.id}')`)
      .in('status', ['pending', 'accepted', 'in_progress'])
      .order('created_at', { ascending: true })

    const invoices: OutstandingInvoice[] = (orders ?? []).map(order => {
      // DECISION: Proxy due date = created_at + 30 days (no explicit due_date column on orders)
      const createdDate = new Date(order.created_at ?? Date.now())
      const dueDate = new Date(createdDate)
      dueDate.setDate(dueDate.getDate() + 30)
      const dueDateStr = dueDate.toISOString()

      const daysPastDue = computeDaysPastDue(dueDateStr)

      return {
        id: order.id,
        orderId: order.id,
        orderNumber: order.order_number,
        counterparty: order.buyer_id === user.id ? 'You (buyer)' : 'You (seller)',
        amount: Math.round((order.total_amount ?? 0) * 100),
        currency: order.currency ?? 'GBP',
        dueDate: dueDateStr,
        daysPastDue: Math.max(0, daysPastDue),
        agingBucket: getAgingBucket(daysPastDue),
      }
    })

    return { data: invoices, error: null }
  } catch (err) {
    console.error('[Finance] Failed to fetch outstanding invoices:', err)
    return { data: null, error: 'Failed to load invoices' }
  }
}

// ============================================================
// Expense Breakdown
// ============================================================

/**
 * Fetch expense breakdown by category for the donut chart.
 *
 * @returns Array of expense categories with amounts and colors
 */
export async function getExpenseBreakdown(): Promise<FinanceActionResult<ExpenseCategory[]>> {
  try {
    const supabase = await createClient()
    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { data: null, error: 'No active foundry' }

    const monthStart = getMonthStart()

    const [{ data: costItems }, { data: expenses }] = await Promise.all([
      supabase
        .from('money_map_cost_items')
        .select('amount, period, category')
        .eq('foundry_id', foundryId)
        .eq('is_active', true),

      // Include this month's approved expenses in the breakdown
      supabase
        .from('finance_expenses')
        .select('amount, category')
        .eq('foundry_id', foundryId)
        .in('status', ['approved', 'paid'])
        .gte('expense_date', monthStart),
    ])

    // Combine recurring costs (normalised to monthly pounds) with expense amounts (pence → pounds)
    const categoryTotals: Record<string, number> = {}

    for (const item of (costItems ?? [])) {
      const cat = item.category ?? 'other'
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + normaliseToMonthly(item.amount ?? 0, item.period ?? 'monthly')
    }
    for (const exp of (expenses ?? [])) {
      const cat = exp.category ?? 'other'
      // Expenses are in pence, convert to pounds to match money-map amounts
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + (exp.amount ?? 0) / 100
    }

    const normalised = Object.entries(categoryTotals).map(([category, monthly_amount]) => ({
      category,
      monthly_amount,
    }))

    const breakdown = computeExpenseBreakdown(normalised, EXPENSE_COLORS)

    return { data: breakdown, error: null }
  } catch (err) {
    console.error('[Finance] Failed to fetch expense breakdown:', err)
    return { data: null, error: 'Failed to load expense breakdown' }
  }
}
