/**
 * Money · pnl-engine.ts — Income Statement + Balance Sheet + Waterfall.
 *
 * Restores the richness of the legacy /cash-burn/pnl report (Loss #6 from
 * the Money V2 parity audit) over the V2 schema: plan_line_items +
 * scenario overrides. Pure functions only — no DB access.
 *
 * Why a separate file from pnl.ts?
 * - pnl.ts is a thin category aggregator shared with the Variance surface.
 * - pnl-engine.ts adds the legacy GAAP-ish presentation (Revenue → COGS →
 *   Gross Profit → OpEx → Operating Profit → Other Income → Net Profit),
 *   a weekly projected balance sheet, and a 7-step waterfall.
 *
 * Category bucketing (locked by this module — not the db enum):
 *   Revenue      : direction='in' AND category in {'revenue'}
 *   Other income : direction='in' AND category in {'grants','loans','equity'}
 *   COGS         : direction='out' AND category in {'materials'}
 *   OpEx         : direction='out' AND any other category (people/premises/
 *                   tools/growth/other)
 *
 * This is deliberately conservative: the current V2 enum doesn't split
 * 'cogs' vs 'production' from 'materials', so we only bucket 'materials'
 * to COGS. Everything else out is OpEx. Founders who want a tighter split
 * can use the variance view or tag in Xero.
 *
 * All amounts in pence/cents (integer). Weeks = ISO Monday-aligned.
 */

import {
  applyOverrides,
  lineAmountForWeek,
  type PlanLineItemRow,
  type ScenarioOverrideRow,
} from './runway'

const MS_PER_DAY = 24 * 60 * 60 * 1000

// ────────────────────────────────────────────────────────────────
// Output types
// ────────────────────────────────────────────────────────────────

export type PnlMonth = {
  month: string // 'YYYY-MM'
  monthLabel: string // 'Apr 2026'
  revenue_cents: number
  cogs_cents: number
  gross_profit_cents: number
  operating_expenses_cents: number
  operating_profit_cents: number
  other_income_cents: number
  net_profit_cents: number
  cumulative_cash_cents: number
}

export type BalanceSheetWeek = {
  week_index: number
  week_start: string
  week_label: string
  assets_cash_cents: number
  assets_receivables_cents: number
  total_assets_cents: number
  liabilities_loans_cents: number
  total_liabilities_cents: number
  equity_cents: number
}

export type WaterfallStep = {
  label: string
  value_cents: number
  kind: 'in' | 'out' | 'total'
}

export type HorizontalBarRow = {
  category: string
  direction: 'in' | 'out'
  total_cents: number
}

export type PnlReportResult = {
  monthly: PnlMonth[]
  balanceSheet: BalanceSheetWeek[]
  waterfall: WaterfallStep[]
  horizontalBars: HorizontalBarRow[]
  totals: {
    revenue_cents: number
    cogs_cents: number
    gross_profit_cents: number
    operating_expenses_cents: number
    operating_profit_cents: number
    other_income_cents: number
    net_profit_cents: number
  }
}

// ────────────────────────────────────────────────────────────────
// Classification
// ────────────────────────────────────────────────────────────────

const COGS_CATEGORIES = new Set(['materials', 'cogs', 'production'])
const OTHER_INCOME_CATEGORIES = new Set(['grants', 'loans', 'equity'])

type Bucket = 'revenue' | 'other_income' | 'cogs' | 'opex'

export function classifyLine(line: PlanLineItemRow): Bucket {
  const cat = (line.category ?? '').toLowerCase()
  if (line.direction === 'in') {
    return OTHER_INCOME_CATEGORIES.has(cat) ? 'other_income' : 'revenue'
  }
  return COGS_CATEGORIES.has(cat) ? 'cogs' : 'opex'
}

// ────────────────────────────────────────────────────────────────
// Date helpers
// ────────────────────────────────────────────────────────────────

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function addMonthsUTC(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function mondayOfUTC(d: Date): Date {
  const copy = new Date(d.getTime())
  copy.setUTCHours(0, 0, 0, 0)
  const dow = copy.getUTCDay()
  const diff = (dow + 6) % 7
  copy.setUTCDate(copy.getUTCDate() - diff)
  return copy
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ────────────────────────────────────────────────────────────────
// Main builder
// ────────────────────────────────────────────────────────────────

/**
 * Build the full P&L report bundle from plan_line_items.
 *
 * - monthly[]: 12 rows (by default) of calendar-month-aligned Income
 *   Statement lines, cumulative cash running forward from opening balance.
 * - balanceSheet[]: one row per week across the horizon with cash,
 *   probability-weighted receivables (income booked at 100% but earning at
 *   probability_pct → the delta is receivables), total loans outstanding,
 *   derived equity.
 * - waterfall[]: 7 steps — Revenue → -COGS → Gross Profit → -OpEx →
 *   Operating Profit → +Other Income → Net Profit.
 * - horizontalBars[]: annualised total per (category, direction) pair,
 *   sorted desc by magnitude inside each direction.
 */
export function buildPnl(
  lines: PlanLineItemRow[],
  asOfDate: Date,
  openingBalanceCents: number,
  options?: { months?: number; overrides?: ScenarioOverrideRow[] },
): PnlReportResult {
  const months = Math.max(1, Math.min(36, options?.months ?? 12))
  const effective = applyOverrides(lines, options?.overrides)

  const startMonth = startOfMonthUTC(asOfDate)

  // Precompute week walkers per month so we can share results across
  // monthly + balance-sheet aggregations.
  const monthly: PnlMonth[] = []
  let cumulativeCash = openingBalanceCents

  // Build monthly Income Statement.
  for (let m = 0; m < months; m++) {
    const mStart = addMonthsUTC(startMonth, m)
    const mEnd = addMonthsUTC(mStart, 1)

    let revenue = 0
    let cogs = 0
    let opex = 0
    let otherIncome = 0

    // Walk week-by-week inside the month. Use the ISO-Monday aligned
    // weekStart for the engine call so lineAmountForWeek's one_off checks
    // and probability scaling align with runway.ts.
    let cur = mondayOfUTC(mStart)
    let weekIndex = 0
    while (cur < mEnd) {
      for (const line of effective) {
        const amt = lineAmountForWeek(line, cur, weekIndex)
        if (amt === 0) continue
        const bucket = classifyLine(line)
        switch (bucket) {
          case 'revenue':
            revenue += amt
            break
          case 'other_income':
            otherIncome += amt
            break
          case 'cogs':
            cogs += amt
            break
          case 'opex':
            opex += amt
            break
        }
      }
      cur = new Date(cur.getTime() + 7 * MS_PER_DAY)
      weekIndex++
    }

    const grossProfit = revenue - cogs
    const operatingProfit = grossProfit - opex
    const netProfit = operatingProfit + otherIncome
    cumulativeCash += netProfit

    monthly.push({
      month: monthKey(mStart),
      monthLabel: monthLabel(mStart),
      revenue_cents: revenue,
      cogs_cents: cogs,
      gross_profit_cents: grossProfit,
      operating_expenses_cents: opex,
      operating_profit_cents: operatingProfit,
      other_income_cents: otherIncome,
      net_profit_cents: netProfit,
      cumulative_cash_cents: cumulativeCash,
    })
  }

  // Totals across the horizon.
  const totals = monthly.reduce(
    (acc, r) => ({
      revenue_cents: acc.revenue_cents + r.revenue_cents,
      cogs_cents: acc.cogs_cents + r.cogs_cents,
      gross_profit_cents: acc.gross_profit_cents + r.gross_profit_cents,
      operating_expenses_cents:
        acc.operating_expenses_cents + r.operating_expenses_cents,
      operating_profit_cents:
        acc.operating_profit_cents + r.operating_profit_cents,
      other_income_cents: acc.other_income_cents + r.other_income_cents,
      net_profit_cents: acc.net_profit_cents + r.net_profit_cents,
    }),
    {
      revenue_cents: 0,
      cogs_cents: 0,
      gross_profit_cents: 0,
      operating_expenses_cents: 0,
      operating_profit_cents: 0,
      other_income_cents: 0,
      net_profit_cents: 0,
    },
  )

  // ────────────────────────────────────────────────────────────
  // Waterfall (7 steps)
  // ────────────────────────────────────────────────────────────
  const waterfall: WaterfallStep[] = [
    { label: 'Revenue', value_cents: totals.revenue_cents, kind: 'in' },
    { label: 'COGS', value_cents: -totals.cogs_cents, kind: 'out' },
    {
      label: 'Gross Profit',
      value_cents: totals.gross_profit_cents,
      kind: 'total',
    },
    {
      label: 'OpEx',
      value_cents: -totals.operating_expenses_cents,
      kind: 'out',
    },
    {
      label: 'Operating Profit',
      value_cents: totals.operating_profit_cents,
      kind: 'total',
    },
    {
      label: 'Other Income',
      value_cents: totals.other_income_cents,
      kind: 'in',
    },
    {
      label: 'Net Profit',
      value_cents: totals.net_profit_cents,
      kind: 'total',
    },
  ]

  // ────────────────────────────────────────────────────────────
  // Balance sheet — one row per week across horizon.
  // Receivables = cumulative probability gap on income (full amount at
  // 100% minus actually-recognised at probability_pct). Loans = cumulative
  // loan category inflows (simplification: treated as liabilities until
  // repaid; V1 doesn't model repayment schedules).
  // ────────────────────────────────────────────────────────────
  const horizonEnd = addMonthsUTC(startMonth, months)
  const weekZero = mondayOfUTC(startMonth)
  const balanceSheet: BalanceSheetWeek[] = []

  let bsCash = openingBalanceCents
  let bsReceivables = 0
  let bsLoans = 0
  let bsWeek = 0
  let bsCur = new Date(weekZero.getTime())
  while (bsCur < horizonEnd) {
    // Weekly increments.
    for (const line of effective) {
      const amtWeighted = lineAmountForWeek(line, bsCur, bsWeek)
      if (amtWeighted === 0) continue
      const bucket = classifyLine(line)

      if (line.direction === 'in') {
        // lineAmountForWeek already probability-weights income. To model
        // receivables we replay at 100% and call the gap "booked but not
        // yet collected". Avoids second engine call — derive from
        // probability_pct directly.
        const prob = line.probability_pct / 100
        const fullAmount = prob > 0 ? amtWeighted / prob : amtWeighted
        const uncollected = Math.round(fullAmount - amtWeighted)
        bsReceivables += uncollected

        if (bucket === 'other_income' && (line.category ?? '').toLowerCase() === 'loans') {
          bsLoans += amtWeighted
        }
        bsCash += amtWeighted
      } else {
        bsCash -= amtWeighted
      }
    }

    const totalAssets = bsCash + bsReceivables
    const totalLiabilities = bsLoans
    const equity = totalAssets - totalLiabilities

    balanceSheet.push({
      week_index: bsWeek,
      week_start: isoDate(bsCur),
      week_label: `W${bsWeek + 1} · ${bsCur.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })}`,
      assets_cash_cents: bsCash,
      assets_receivables_cents: bsReceivables,
      total_assets_cents: totalAssets,
      liabilities_loans_cents: bsLoans,
      total_liabilities_cents: totalLiabilities,
      equity_cents: equity,
    })

    bsCur = new Date(bsCur.getTime() + 7 * MS_PER_DAY)
    bsWeek++
  }

  // ────────────────────────────────────────────────────────────
  // Horizontal bars — per (category, direction) total across horizon.
  // ────────────────────────────────────────────────────────────
  const totalsByKey = new Map<string, HorizontalBarRow>()
  let walkCur = new Date(weekZero.getTime())
  let walkWeek = 0
  while (walkCur < horizonEnd) {
    for (const line of effective) {
      const amt = lineAmountForWeek(line, walkCur, walkWeek)
      if (amt === 0) continue
      const cat = (line.category ?? 'other').toLowerCase()
      const key = `${line.direction}::${cat}`
      const existing = totalsByKey.get(key) ?? {
        category: cat,
        direction: line.direction,
        total_cents: 0,
      }
      existing.total_cents += amt
      totalsByKey.set(key, existing)
    }
    walkCur = new Date(walkCur.getTime() + 7 * MS_PER_DAY)
    walkWeek++
  }

  const horizontalBars: HorizontalBarRow[] = [...totalsByKey.values()].sort(
    (a, b) => {
      if (a.direction !== b.direction) return a.direction === 'in' ? -1 : 1
      return b.total_cents - a.total_cents
    },
  )

  return {
    monthly,
    balanceSheet,
    waterfall,
    horizontalBars,
    totals,
  }
}
