/**
 * @file financial.ts
 *
 * @description Fetches financial data for the report financial-snapshot section.
 * Aggregates across orders, retainers, finance_expenses, money_map_cost_items,
 * and finance_budgets to produce a period-over-period financial overview.
 *
 * INTENT: All amounts are stored in pence (integers) in the database.
 * Values returned here remain in pence — formatting to £ happens at render time.
 *
 * @related
 * - src/actions/report-generator.ts — Orchestrates this fetcher
 * - src/actions/finance-reports.ts — Standalone finance reports (P&L, VAT, Cash Flow)
 * - src/lib/reports/report-document-types.ts — FinancialSnapshotSectionData
 */

import type { createClient } from '@/lib/supabase/server'
import type { FinancialSnapshotSectionData, BudgetHealthRow } from '@/lib/reports/report-document-types'

/**
 * Fetch financial snapshot data for a reporting period.
 *
 * @param supabase - Authenticated Supabase client
 * @param foundryId - Foundry to scope queries to
 * @param dateRange - Period start and end dates (ISO strings)
 * @returns Financial snapshot section data
 */
export async function fetchFinancialSnapshotData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  foundryId: string,
  dateRange: { start: string; end: string },
): Promise<FinancialSnapshotSectionData> {
  // INTENT: Calculate previous period of equal length for comparison
  const startDate = new Date(dateRange.start)
  const endDate = new Date(dateRange.end)
  const periodMs = endDate.getTime() - startDate.getTime()
  const prevStart = new Date(startDate.getTime() - periodMs)
  const prevEnd = new Date(startDate.getTime() - 1)
  const prevStartStr = prevStart.toISOString().split('T')[0]
  const prevEndStr = prevEnd.toISOString().split('T')[0]

  const [
    { data: periodOrders },
    { data: prevOrders },
    { data: periodRetainers },
    { data: prevRetainers },
    { data: periodExpenses },
    { data: prevExpenses },
    { data: periodCosts },
    { data: prevCosts },
    { data: activeOrders },
    { data: budgets },
  ] = await Promise.all([
    // Current period order revenue
    supabase
      .from('orders')
      .select('total_amount, status')
      .eq('seller_id', foundryId)
      .gte('created_at', `${dateRange.start}T00:00:00`)
      .lte('created_at', `${dateRange.end}T23:59:59`),
    // Previous period order revenue
    supabase
      .from('orders')
      .select('total_amount, status')
      .eq('seller_id', foundryId)
      .gte('created_at', `${prevStartStr}T00:00:00`)
      .lte('created_at', `${prevEndStr}T23:59:59`),
    // Current period retainer revenue (active retainers)
    supabase
      .from('retainers')
      .select('hourly_rate, weekly_hours, started_at')
      .eq('seller_id', foundryId)
      .eq('status', 'active')
      .lte('started_at', `${dateRange.end}T23:59:59`),
    // Previous period retainer revenue
    supabase
      .from('retainers')
      .select('hourly_rate, weekly_hours, started_at')
      .eq('seller_id', foundryId)
      .eq('status', 'active')
      .lte('started_at', `${prevEndStr}T23:59:59`),
    // Current period expenses (approved or paid)
    supabase
      .from('finance_expenses')
      .select('amount, category')
      .eq('foundry_id', foundryId)
      .in('status', ['approved', 'paid'])
      .gte('expense_date', dateRange.start)
      .lte('expense_date', dateRange.end),
    // Previous period expenses
    supabase
      .from('finance_expenses')
      .select('amount')
      .eq('foundry_id', foundryId)
      .in('status', ['approved', 'paid'])
      .gte('expense_date', prevStartStr)
      .lte('expense_date', prevEndStr),
    // Current period recurring costs
    supabase
      .from('money_map_cost_items')
      .select('amount, period, category')
      .eq('foundry_id', foundryId)
      .eq('is_active', true),
    // Previous period recurring costs (same set, for comparison)
    supabase
      .from('money_map_cost_items')
      .select('amount, period')
      .eq('foundry_id', foundryId)
      .eq('is_active', true),
    // Active orders by status
    supabase
      .from('orders')
      .select('status')
      .eq('seller_id', foundryId)
      .not('status', 'in', '("completed","cancelled")'),
    // Budget data
    supabase
      .from('finance_budgets')
      .select('category, amount, period')
      .eq('foundry_id', foundryId)
      .eq('is_active', true),
  ])

  // INTENT: Calculate period length in months for normalizing recurring costs
  const periodDays = Math.max(1, Math.ceil(periodMs / (1000 * 60 * 60 * 24)))
  const periodMonths = periodDays / 30.44

  // Revenue from orders
  const orderRevenue = (periodOrders ?? []).reduce((sum, o) => sum + (o.total_amount ?? 0), 0)
  const prevOrderRevenue = (prevOrders ?? []).reduce((sum, o) => sum + (o.total_amount ?? 0), 0)

  // Revenue from retainers (rate * hours * weeks in period)
  const weeksInPeriod = periodDays / 7
  const retainerRevenue = (periodRetainers ?? []).reduce((sum, r) => {
    return sum + Math.round(r.hourly_rate * r.weekly_hours * weeksInPeriod)
  }, 0)
  const prevWeeksInPeriod = Math.max(1, (prevEnd.getTime() - prevStart.getTime()) / (1000 * 60 * 60 * 24 * 7))
  const prevRetainerRevenue = (prevRetainers ?? []).reduce((sum, r) => {
    return sum + Math.round(r.hourly_rate * r.weekly_hours * prevWeeksInPeriod)
  }, 0)

  const periodRevenue = orderRevenue + retainerRevenue
  const previousPeriodRevenue = prevOrderRevenue + prevRetainerRevenue

  // Expenses (transactional)
  const expenseTotal = (periodExpenses ?? []).reduce((sum, e) => sum + (e.amount ?? 0), 0)
  const prevExpenseTotal = (prevExpenses ?? []).reduce((sum, e) => sum + (e.amount ?? 0), 0)

  // INTENT: Normalize recurring costs to the period length
  const normalizeCost = (amount: number, period: string): number => {
    const monthly = period === 'annual' ? amount / 12
      : period === 'quarterly' ? amount / 3
      : amount
    return Math.round(monthly * periodMonths)
  }

  const recurringCostTotal = (periodCosts ?? []).reduce((sum, c) => sum + normalizeCost(c.amount, c.period), 0)
  const prevRecurringCostTotal = (prevCosts ?? []).reduce((sum, c) => sum + normalizeCost(c.amount, c.period), 0)

  const periodExpensesTotal = expenseTotal + recurringCostTotal
  const previousPeriodExpenses = prevExpenseTotal + prevRecurringCostTotal

  const netPosition = periodRevenue - periodExpensesTotal
  const previousNetPosition = previousPeriodRevenue - previousPeriodExpenses

  // Active orders by status
  const statusCounts = new Map<string, number>()
  for (const order of activeOrders ?? []) {
    const s = order.status ?? 'unknown'
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1)
  }
  const activeOrdersByStatus = Array.from(statusCounts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)

  // INTENT: Budget health — compare budget amounts to actual spend by category.
  // Normalize budgets to the period length for fair comparison.
  const budgetByCategory = new Map<string, number>()
  for (const b of budgets ?? []) {
    const normalized = normalizeCost(b.amount, b.period)
    budgetByCategory.set(b.category, (budgetByCategory.get(b.category) ?? 0) + normalized)
  }

  // Actual spend by category (expenses + recurring costs)
  const actualByCategory = new Map<string, number>()
  for (const e of periodExpenses ?? []) {
    actualByCategory.set(e.category, (actualByCategory.get(e.category) ?? 0) + e.amount)
  }
  for (const c of periodCosts ?? []) {
    const normalized = normalizeCost(c.amount, c.period)
    actualByCategory.set(c.category, (actualByCategory.get(c.category) ?? 0) + normalized)
  }

  const budgetHealth: BudgetHealthRow[] = []
  for (const [category, budgeted] of budgetByCategory) {
    const actual = actualByCategory.get(category) ?? 0
    const variance = budgeted - actual
    const variancePercent = budgeted > 0 ? Math.round((variance / budgeted) * 100) : 0
    budgetHealth.push({ category, budgeted, actual, variance, variancePercent })
  }
  budgetHealth.sort((a, b) => a.variance - b.variance)

  const overBudgetCount = budgetHealth.filter(b => b.variance < 0).length

  return {
    periodRevenue,
    previousPeriodRevenue,
    periodExpenses: periodExpensesTotal,
    previousPeriodExpenses: previousPeriodExpenses,
    netPosition,
    previousNetPosition,
    activeOrderCount: activeOrders?.length ?? 0,
    activeOrdersByStatus,
    budgetHealth,
    overBudgetCount,
  }
}
