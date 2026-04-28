/**
 * Money · pnl.ts — monthly / quarterly P&L aggregation.
 *
 * Replaces `src/lib/cash-burn/pnl-builder.ts`. V2 aggregates from
 * plan_line_items + xero_transaction (actuals) per MONEY-SCHEMA §1
 * ambiguity resolution #1: Plan is forecast; Xero is actuals; they're
 * separate tables joined at query time. The Variance view subtracts them
 * per category per month.
 *
 * All amounts in pence/cents. Pure functions, no DB access.
 */

import {
  applyOverrides,
  lineAmountForWeek,
  type PlanLineItemRow,
  type ScenarioOverrideRow,
} from './runway'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type PnlCategory =
  | 'people'
  | 'premises'
  | 'tools'
  | 'materials'
  | 'growth'
  | 'other'
  | 'revenue'
  | 'grants'
  | 'equity'
  | 'loans'

export const COST_CATEGORIES: readonly PnlCategory[] = [
  'people',
  'premises',
  'tools',
  'materials',
  'growth',
  'other',
] as const

export const INCOME_CATEGORIES: readonly PnlCategory[] = [
  'revenue',
  'grants',
  'equity',
  'loans',
] as const

export type PnlPeriod = 'month' | 'quarter'

export type PnlRow = {
  periodStart: string // ISO date (first day of month or quarter)
  periodLabel: string // "Apr 2026" or "Q2 2026"
  byCategory: Record<PnlCategory, number>
  totalIn: number
  totalOut: number
  net: number
}

export type PnlReport = {
  period: PnlPeriod
  rows: PnlRow[]
}

export type XeroTransactionLite = {
  transaction_date: string
  amount_cents: number // signed: negative = out, positive = in (Xero convention)
  assigned_category: string
  category_override?: string | null
}

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function startOfQuarterUTC(d: Date): Date {
  const qStartMonth = Math.floor(d.getUTCMonth() / 3) * 3
  return new Date(Date.UTC(d.getUTCFullYear(), qStartMonth, 1))
}

function addMonthsUTC(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function labelMonth(d: Date): string {
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function labelQuarter(d: Date): string {
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `Q${q} ${d.getUTCFullYear()}`
}

function emptyCategoryMap(): Record<PnlCategory, number> {
  return {
    people: 0,
    premises: 0,
    tools: 0,
    materials: 0,
    growth: 0,
    other: 0,
    revenue: 0,
    grants: 0,
    equity: 0,
    loans: 0,
  }
}

function isPnlCategory(c: string): c is PnlCategory {
  return (
    c === 'people' ||
    c === 'premises' ||
    c === 'tools' ||
    c === 'materials' ||
    c === 'growth' ||
    c === 'other' ||
    c === 'revenue' ||
    c === 'grants' ||
    c === 'equity' ||
    c === 'loans'
  )
}

/**
 * Build a forecast P&L from plan_line_items by walking the horizon week-by-
 * week and aggregating into months (or quarters). Uses the same weekly
 * amount function as runway.ts so forecast + variance numbers are
 * consistent.
 */
export function buildForecastPnl(input: {
  lines: PlanLineItemRow[]
  overrides?: ScenarioOverrideRow[]
  asOfDate: Date
  periods: number
  period: PnlPeriod
}): PnlReport {
  const effective = applyOverrides(input.lines, input.overrides)
  const startPeriod =
    input.period === 'month'
      ? startOfMonthUTC(input.asOfDate)
      : startOfQuarterUTC(input.asOfDate)
  const monthsPerPeriod = input.period === 'month' ? 1 : 3

  const rows: PnlRow[] = []
  for (let p = 0; p < input.periods; p++) {
    const pStart = addMonthsUTC(startPeriod, p * monthsPerPeriod)
    const pEnd = addMonthsUTC(pStart, monthsPerPeriod)

    const byCategory = emptyCategoryMap()
    // Walk week by week across the period.
    let cur = new Date(pStart)
    let weekIndex = 0
    while (cur < pEnd) {
      for (const line of effective) {
        const amt = lineAmountForWeek(line, cur, weekIndex)
        if (amt === 0) continue
        if (isPnlCategory(line.category)) {
          byCategory[line.category] += amt
        }
      }
      cur = new Date(cur.getTime() + 7 * MS_PER_DAY)
      weekIndex++
    }

    const totalOut = COST_CATEGORIES.reduce((s, c) => s + byCategory[c], 0)
    const totalIn = INCOME_CATEGORIES.reduce((s, c) => s + byCategory[c], 0)

    rows.push({
      periodStart: isoDate(pStart),
      periodLabel:
        input.period === 'month' ? labelMonth(pStart) : labelQuarter(pStart),
      byCategory,
      totalIn,
      totalOut,
      net: totalIn - totalOut,
    })
  }

  return { period: input.period, rows }
}

/**
 * Build an actuals P&L from Xero transactions, aggregated by month or
 * quarter. Uses category_override when present, else assigned_category.
 * Xero convention: negative amounts = out, positive = in. We bucket into
 * the 10-category ForgeOS enum.
 */
export function buildActualsPnl(input: {
  transactions: XeroTransactionLite[]
  asOfDate: Date
  periods: number
  period: PnlPeriod
}): PnlReport {
  const startPeriod =
    input.period === 'month'
      ? startOfMonthUTC(input.asOfDate)
      : startOfQuarterUTC(input.asOfDate)
  const monthsPerPeriod = input.period === 'month' ? 1 : 3

  // Bucket transactions into period-start keys.
  const buckets = new Map<string, Record<PnlCategory, number>>()
  for (const tx of input.transactions) {
    const txDate = new Date(tx.transaction_date)
    const pStart =
      input.period === 'month'
        ? startOfMonthUTC(txDate)
        : startOfQuarterUTC(txDate)
    const key = isoDate(pStart)
    const bucket = buckets.get(key) ?? emptyCategoryMap()
    const cat = tx.category_override ?? tx.assigned_category
    if (isPnlCategory(cat)) {
      // Xero convention: negative = out, positive = in. We store positive
      // magnitude in both cost and income buckets (sign is implicit in
      // which bucket). Revenue bucket → abs amount when positive.
      bucket[cat] += Math.abs(tx.amount_cents)
    }
    buckets.set(key, bucket)
  }

  const rows: PnlRow[] = []
  for (let p = 0; p < input.periods; p++) {
    const pStart = addMonthsUTC(startPeriod, p * monthsPerPeriod)
    const key = isoDate(pStart)
    const byCategory = buckets.get(key) ?? emptyCategoryMap()
    const totalOut = COST_CATEGORIES.reduce((s, c) => s + byCategory[c], 0)
    const totalIn = INCOME_CATEGORIES.reduce((s, c) => s + byCategory[c], 0)
    rows.push({
      periodStart: isoDate(pStart),
      periodLabel:
        input.period === 'month' ? labelMonth(pStart) : labelQuarter(pStart),
      byCategory,
      totalIn,
      totalOut,
      net: totalIn - totalOut,
    })
  }

  return { period: input.period, rows }
}

/**
 * Variance = actuals − forecast per (period, category). Negative means
 * actuals are under forecast (for costs: good; for income: bad). Positive
 * means actuals are over forecast.
 */
export function buildVarianceReport(forecast: PnlReport, actuals: PnlReport): PnlReport {
  if (forecast.period !== actuals.period) {
    throw new Error('buildVarianceReport: period mismatch')
  }
  const actualsByKey = new Map(actuals.rows.map((r) => [r.periodStart, r]))
  const rows: PnlRow[] = forecast.rows.map((f) => {
    const a = actualsByKey.get(f.periodStart)
    const byCategory = emptyCategoryMap()
    for (const c of [...COST_CATEGORIES, ...INCOME_CATEGORIES] as PnlCategory[]) {
      byCategory[c] = (a?.byCategory[c] ?? 0) - f.byCategory[c]
    }
    const totalOut = COST_CATEGORIES.reduce((s, c) => s + byCategory[c], 0)
    const totalIn = INCOME_CATEGORIES.reduce((s, c) => s + byCategory[c], 0)
    return {
      periodStart: f.periodStart,
      periodLabel: f.periodLabel,
      byCategory,
      totalIn,
      totalOut,
      net: totalIn - totalOut,
    }
  })
  return { period: forecast.period, rows }
}
