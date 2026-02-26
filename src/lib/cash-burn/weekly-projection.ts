/**
 * @file weekly-projection.ts — Pure weekly cash flow grid generation
 *
 * @description Converts cash out/in items into 52-week grids.
 * All amounts in pence. Pure functions, no DB access.
 */

import type {
  Frequency,
  CashOutItem,
  CashInItem,
  WeeklyOutRow,
  WeeklyInRow,
} from '@/types/cash-burn'

/**
 * Convert an amount in pence from any frequency to weekly pence.
 * One-time items are NOT normalised — they are handled per-week.
 */
export function normaliseToWeeklyPence(amountPence: number, frequency: Frequency): number {
  switch (frequency) {
    case 'weekly':
      return amountPence
    case 'monthly':
      return Math.round(amountPence * 12 / 52)
    case 'annual':
      return Math.round(amountPence / 52)
    case 'one_time':
      return amountPence // returned as-is; caller decides when to apply
  }
}

/**
 * Check if an item is active during a given week.
 */
export function isActiveInWeek(
  effectiveFrom: string,
  effectiveTo: string | null,
  weekStart: Date
): boolean {
  const from = new Date(effectiveFrom)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  if (from > weekEnd) return false
  if (effectiveTo) {
    const to = new Date(effectiveTo)
    if (to < weekStart) return false
  }
  return true
}

/**
 * Get the Monday of the week containing the given date.
 */
function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Format a week start date as "W1 (3 Mar)", "W2 (10 Mar)", etc.
 */
function formatWeekLabel(weekStart: Date, weekIndex: number): string {
  const day = weekStart.getDate()
  const month = weekStart.toLocaleDateString('en-GB', { month: 'short' })
  return `W${weekIndex + 1} (${day} ${month})`
}

/**
 * Check if a one-time item should fire in this specific week.
 * One-time items fire in the week that contains their effective_from date.
 */
function isOneTimeWeek(effectiveFrom: string, weekStart: Date): boolean {
  const from = new Date(effectiveFrom)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  return from >= weekStart && from <= weekEnd
}

/**
 * Generate a 52-week cash out grid from cost items.
 */
export function generateCashOutGrid(
  items: CashOutItem[],
  weeks: number,
  startDate: Date
): WeeklyOutRow[] {
  const monday = getMonday(startDate)
  const rows: WeeklyOutRow[] = []

  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(monday)
    weekStart.setDate(monday.getDate() + w * 7)

    let fixedCosts = 0
    let variableCosts = 0

    for (const item of items) {
      if (!item.isActive) continue
      if (!isActiveInWeek(item.effectiveFrom, item.effectiveTo, weekStart)) continue

      let amount: number
      if (item.frequency === 'one_time') {
        if (!isOneTimeWeek(item.effectiveFrom, weekStart)) continue
        amount = item.amount
      } else {
        amount = normaliseToWeeklyPence(item.amount, item.frequency)
      }

      if (item.costType === 'fixed') {
        fixedCosts += amount
      } else {
        variableCosts += amount
      }
    }

    rows.push({
      weekStart: weekStart.toISOString().split('T')[0],
      weekLabel: formatWeekLabel(weekStart, w),
      fixedCosts,
      variableCosts,
      totalOut: fixedCosts + variableCosts,
    })
  }

  return rows
}

/**
 * Generate a 52-week cash in grid from revenue/funding items.
 */
export function generateCashInGrid(
  items: CashInItem[],
  weeks: number,
  startDate: Date
): WeeklyInRow[] {
  const monday = getMonday(startDate)
  const rows: WeeklyInRow[] = []

  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(monday)
    weekStart.setDate(monday.getDate() + w * 7)

    let revenue = 0
    let loans = 0
    let equity = 0
    let grants = 0
    let other = 0

    for (const item of items) {
      if (!item.isActive) continue
      if (!isActiveInWeek(item.effectiveFrom, item.effectiveTo, weekStart)) continue

      let amount: number
      if (item.frequency === 'one_time') {
        if (!isOneTimeWeek(item.effectiveFrom, weekStart)) continue
        amount = item.amount
      } else {
        amount = normaliseToWeeklyPence(item.amount, item.frequency)
      }

      // Apply probability weighting
      amount = Math.round(amount * item.probabilityPct / 100)

      switch (item.sourceType) {
        case 'revenue': revenue += amount; break
        case 'loan': loans += amount; break
        case 'equity': equity += amount; break
        case 'government_grant': grants += amount; break
        case 'other': other += amount; break
      }
    }

    rows.push({
      weekStart: weekStart.toISOString().split('T')[0],
      weekLabel: formatWeekLabel(weekStart, w),
      revenue,
      loans,
      equity,
      grants,
      other,
      totalIn: revenue + loans + equity + grants + other,
    })
  }

  return rows
}
