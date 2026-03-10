/**
 * @file pnl-builder.ts — Pure P&L and Balance Sheet computation
 *
 * @description Builds Income Statement and Balance Sheet from cash items.
 * Revenue = cash-in where source_type='revenue'
 * COGS = cash-out where pnl_category='cogs'
 * OpEx = cash-out where pnl_category='opex'
 * R&D = cash-out where pnl_category='rnd'
 * EBITDA = Revenue - COGS - OpEx - R&D
 *
 * All amounts in pence. Pure functions, no DB access.
 */

import type {
  CashOutItem,
  CashInItem,
  IncomeStatementRow,
  BalanceSheet,
} from '@/types/cash-burn'
import { normaliseToWeeklyPence, isActiveInWeek } from './weekly-projection'

/**
 * Build an Income Statement grouped by week or month.
 */
export function buildIncomeStatement(
  cashOutItems: CashOutItem[],
  cashInItems: CashInItem[],
  weeks: number,
  groupBy: 'weekly' | 'monthly'
): IncomeStatementRow[] {
  const now = new Date()
  const monday = getMonday(now)

  // Build raw weekly data first
  const weeklyData: Array<{
    weekStart: Date
    revenue: number
    cogs: number
    opex: number
    rnd: number
  }> = []

  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(monday)
    weekStart.setDate(monday.getDate() + w * 7)

    let revenue = 0
    let cogs = 0
    let opex = 0
    let rnd = 0

    // Revenue from cash-in items with source_type='revenue'
    for (const item of cashInItems) {
      if (!item.isActive) continue
      if (item.sourceType !== 'revenue') continue
      if (!isActiveInWeek(item.effectiveFrom, item.effectiveTo, weekStart)) continue

      let amount: number
      if (item.frequency === 'one_time') {
        if (!isOneTimeWeek(item.effectiveFrom, weekStart)) continue
        amount = item.amount
      } else {
        amount = normaliseToWeeklyPence(item.amount, item.frequency)
      }
      amount = Math.round(amount * item.probabilityPct / 100)
      revenue += amount
    }

    // Costs from cash-out items, categorised by pnl_category
    for (const item of cashOutItems) {
      if (!item.isActive) continue
      if (item.pnlCategory === 'excluded' || item.pnlCategory === 'capex') continue
      if (!isActiveInWeek(item.effectiveFrom, item.effectiveTo, weekStart)) continue

      let amount: number
      if (item.frequency === 'one_time') {
        if (!isOneTimeWeek(item.effectiveFrom, weekStart)) continue
        amount = item.amount
      } else {
        amount = normaliseToWeeklyPence(item.amount, item.frequency)
      }

      switch (item.pnlCategory) {
        case 'cogs': cogs += amount; break
        case 'opex': opex += amount; break
        case 'rnd': rnd += amount; break
      }
    }

    weeklyData.push({ weekStart, revenue, cogs, opex, rnd })
  }

  if (groupBy === 'weekly') {
    return weeklyData.map((w, i) => ({
      period: `W${i + 1} (${w.weekStart.getDate()} ${w.weekStart.toLocaleDateString('en-GB', { month: 'short' })})`,
      revenue: w.revenue,
      cogs: w.cogs,
      grossProfit: w.revenue - w.cogs,
      opex: w.opex,
      rnd: w.rnd,
      ebitda: w.revenue - w.cogs - w.opex - w.rnd,
    }))
  }

  // Group by month
  const monthlyMap = new Map<string, { revenue: number; cogs: number; opex: number; rnd: number }>()

  for (const w of weeklyData) {
    const monthKey = `${w.weekStart.getFullYear()}-${String(w.weekStart.getMonth() + 1).padStart(2, '0')}`
    const existing = monthlyMap.get(monthKey) ?? { revenue: 0, cogs: 0, opex: 0, rnd: 0 }
    existing.revenue += w.revenue
    existing.cogs += w.cogs
    existing.opex += w.opex
    existing.rnd += w.rnd
    monthlyMap.set(monthKey, existing)
  }

  const rows: IncomeStatementRow[] = []
  for (const [monthKey, data] of monthlyMap) {
    const [year, month] = monthKey.split('-').map(Number)
    const label = new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    rows.push({
      period: label,
      revenue: data.revenue,
      cogs: data.cogs,
      grossProfit: data.revenue - data.cogs,
      opex: data.opex,
      rnd: data.rnd,
      ebitda: data.revenue - data.cogs - data.opex - data.rnd,
    })
  }

  return rows
}

/**
 * Build a Balance Sheet as of a specific date.
 */
export function buildBalanceSheet(
  cashOutItems: CashOutItem[],
  cashInItems: CashInItem[],
  openingBalance: number,
  asOfDate: Date
): BalanceSheet {
  const monday = getMonday(new Date())
  const weeksBetween = Math.max(0, Math.floor((asOfDate.getTime() - monday.getTime()) / (7 * 24 * 60 * 60 * 1000)))

  let totalOperatingIncome = 0
  let totalCosts = 0
  let totalEquityInvested = 0
  let totalLoans = 0
  let totalCapex = 0

  // Accumulate cash flows up to asOfDate
  for (let w = 0; w <= weeksBetween; w++) {
    const weekStart = new Date(monday)
    weekStart.setDate(monday.getDate() + w * 7)

    if (weekStart > asOfDate) break

    // Cash in
    for (const item of cashInItems) {
      if (!item.isActive) continue
      if (!isActiveInWeek(item.effectiveFrom, item.effectiveTo, weekStart)) continue

      let amount: number
      if (item.frequency === 'one_time') {
        if (!isOneTimeWeek(item.effectiveFrom, weekStart)) continue
        amount = item.amount
      } else {
        amount = normaliseToWeeklyPence(item.amount, item.frequency)
      }
      amount = Math.round(amount * item.probabilityPct / 100)

      if (item.sourceType === 'equity') {
        totalEquityInvested += amount
      } else if (item.sourceType === 'loan') {
        totalLoans += amount
      } else {
        // INTENT: Operating income = revenue + grants + other (not loans/equity)
        totalOperatingIncome += amount
      }
    }

    // Cash out
    for (const item of cashOutItems) {
      if (!item.isActive) continue
      if (!isActiveInWeek(item.effectiveFrom, item.effectiveTo, weekStart)) continue

      let amount: number
      if (item.frequency === 'one_time') {
        if (!isOneTimeWeek(item.effectiveFrom, weekStart)) continue
        amount = item.amount
      } else {
        amount = normaliseToWeeklyPence(item.amount, item.frequency)
      }

      if (item.pnlCategory === 'capex') {
        totalCapex += amount
      }
      totalCosts += amount
    }
  }

  // INTENT: Assets = Liabilities + Equity (accounting equation)
  // Cash = opening + operating income + equity + loans - costs
  // RetainedEarnings = operating income - (costs excluding capex)
  const cash = openingBalance + totalOperatingIncome + totalEquityInvested + totalLoans - totalCosts
  // INTENT: Straight-line depreciation over 3 years for P&L presentation
  // Cash flow still shows full outflow when it occurs
  const DEPRECIATION_WEEKS = 156
  const depreciatedEquipment = Math.max(0, totalCapex - Math.round(totalCapex * Math.min(weeksBetween, DEPRECIATION_WEEKS) / DEPRECIATION_WEEKS))
  const equipment = depreciatedEquipment
  const totalAssets = cash + equipment
  const totalLiabilities = totalLoans
  // INTENT: Retained earnings must include depreciation expense so the
  // accounting equation (Assets = Liabilities + Equity) balances.
  // depreciatedEquipment replaces totalCapex to reflect the P&L impact.
  const retainedEarnings = totalOperatingIncome - (totalCosts - depreciatedEquipment)
  const totalEquity = openingBalance + totalEquityInvested + retainedEarnings

  return {
    cash,
    equipment,
    totalAssets,
    loans: totalLoans,
    totalLiabilities,
    equityInvested: totalEquityInvested + openingBalance,
    retainedEarnings,
    totalEquity,
  }
}

// ============================================================
// Helpers
// ============================================================

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function isOneTimeWeek(effectiveFrom: string, weekStart: Date): boolean {
  const from = new Date(effectiveFrom)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  return from >= weekStart && from <= weekEnd
}
