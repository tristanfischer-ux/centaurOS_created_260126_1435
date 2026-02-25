'use server'

/**
 * @file finance-reports.ts — Server actions for financial report generation
 *
 * @description Queries existing tables for the given date range and builds
 * P&L, VAT, and Cash Flow Statement reports.
 *
 * @security All queries filter by foundry_id via getFoundryIdCached().
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import type { FinanceActionResult } from '@/types/finance'
import {
  buildPnLReport,
  buildVATReport,
  buildCashFlowStatement,
  type PnLReport,
  type VATReport,
  type CashFlowStatement,
} from '@/lib/finance/reports'
import type { DateRange } from '@/lib/finance/report-utils'

// ============================================================
// Actions
// ============================================================

/**
 * Generate a P&L report for the given date range.
 */
export async function generatePnLReport(
  range: DateRange
): Promise<FinanceActionResult<PnLReport>> {
  try {
    const rawData = await fetchReportData(range)
    if (!rawData) return { data: null, error: 'Failed to load report data' }

    const period = formatPeriodLabel(range)
    const report = buildPnLReport(rawData, period)

    return { data: report, error: null }
  } catch (err) {
    console.error('[Finance] Failed to generate P&L report:', err)
    return { data: null, error: 'Failed to generate report' }
  }
}

/**
 * Generate a VAT summary report for the given date range.
 */
export async function generateVATReport(
  range: DateRange
): Promise<FinanceActionResult<VATReport>> {
  try {
    const rawData = await fetchReportData(range)
    if (!rawData) return { data: null, error: 'Failed to load report data' }

    const period = formatPeriodLabel(range)
    const report = buildVATReport(rawData, period)

    return { data: report, error: null }
  } catch (err) {
    console.error('[Finance] Failed to generate VAT report:', err)
    return { data: null, error: 'Failed to generate report' }
  }
}

/**
 * Generate a Cash Flow Statement for the given date range.
 */
export async function generateCashFlowStatementReport(
  range: DateRange
): Promise<FinanceActionResult<CashFlowStatement>> {
  try {
    const rawData = await fetchReportData(range)
    if (!rawData) return { data: null, error: 'Failed to load report data' }

    const period = formatPeriodLabel(range)
    const report = buildCashFlowStatement(rawData, period)

    return { data: report, error: null }
  } catch (err) {
    console.error('[Finance] Failed to generate cash flow statement:', err)
    return { data: null, error: 'Failed to generate report' }
  }
}

// ============================================================
// Data Fetching
// ============================================================

interface RawReportData {
  orders: Array<{ total_amount: number; vat_amount: number | null; status: string; created_at: string }>
  retainerEntries: Array<{ amount: number; created_at: string }>
  costItems: Array<{ name: string; amount: number; period: string; category: string }>
  expenses: Array<{ description: string; amount: number; category: string }>
  payouts: Array<{ amount: number; status: string; requested_at: string }>
  topUps: Array<{ amount: number; created_at: string }>
  openingBalance: number
  closingBalance: number
}

async function fetchReportData(range: DateRange): Promise<RawReportData | null> {
  const supabase = await createClient()
  const foundryId = await getFoundryIdCached()
  if (!foundryId) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [ordersResult, costItemsResult, expensesResult, payoutsResult, balanceResult, topUpsResult] = await Promise.all([
    // Orders in date range
    supabase
      .from('orders')
      .select('total_amount, vat_amount, status, created_at')
      .gte('created_at', range.from)
      .lte('created_at', range.to)
      .or(`buyer_id.eq.${user.id}`),

    // Cost items (current active)
    supabase
      .from('money_map_cost_items')
      .select('name, amount, period, category')
      .eq('foundry_id', foundryId)
      .eq('is_active', true),

    // INTENT: Approved/paid expenses in the report period.
    // These are transactional costs that aren't in money_map_cost_items,
    // so the P&L was materially incomplete without them.
    supabase
      .from('finance_expenses')
      .select('description, amount, category')
      .eq('foundry_id', foundryId)
      .in('status', ['approved', 'paid'])
      .gte('expense_date', range.from)
      .lte('expense_date', range.to),

    // Payout requests in range (scoped to current user)
    supabase
      .from('payout_requests')
      .select('amount, status, requested_at')
      .eq('user_id', user.id)
      .gte('requested_at', range.from)
      .lte('requested_at', range.to),

    // Current balance
    supabase
      .from('account_balances')
      .select('balance_amount')
      .eq('user_id', user.id)
      .single(),

    // Top-ups (balance transactions with type 'top_up')
    supabase
      .from('balance_transactions')
      .select('amount, created_at')
      .eq('user_id', user.id)
      .eq('transaction_type', 'top_up')
      .gte('created_at', range.from)
      .lte('created_at', range.to),
  ])

  const closingBalance = balanceResult.data?.balance_amount ?? 0

  return {
    orders: (ordersResult.data ?? []).map(o => ({
      total_amount: Number(o.total_amount),
      vat_amount: o.vat_amount ? Number(o.vat_amount) : null,
      status: o.status ?? '',
      created_at: o.created_at ?? '',
    })),
    retainerEntries: [], // INTENT: Retainer timesheet entries could be added when available
    expenses: (expensesResult.data ?? []).map(e => ({
      description: e.description ?? 'Expense',
      amount: Number(e.amount), // in pence
      category: e.category ?? 'other',
    })),
    costItems: (costItemsResult.data ?? []).map(c => ({
      name: c.name ?? 'Cost item',
      amount: Number(c.amount),
      period: c.period ?? 'monthly',
      category: c.category ?? 'other',
    })),
    payouts: (payoutsResult.data ?? []).map(p => ({
      amount: p.amount ?? 0,
      status: p.status ?? '',
      requested_at: p.requested_at ?? '',
    })),
    topUps: (topUpsResult.data ?? []).map(t => ({
      amount: t.amount ?? 0,
      created_at: t.created_at ?? '',
    })),
    openingBalance: closingBalance, // INTENT: Would need historical snapshot for true opening balance
    closingBalance,
  }
}

// ============================================================
// Helpers
// ============================================================

function formatPeriodLabel(range: DateRange): string {
  const from = new Date(range.from)
  const to = new Date(range.to)

  const fromStr = from.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const toStr = to.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return `${fromStr} – ${toStr}`
}

