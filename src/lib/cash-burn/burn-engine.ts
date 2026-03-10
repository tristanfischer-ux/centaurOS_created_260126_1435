/**
 * @file burn-engine.ts — Pure burn projection engine
 *
 * @description Combines cash in/out grids with scenario adjustments to
 * produce a burn projection with cumulative balance and runway calculation.
 * All amounts in pence. Pure functions, no DB access.
 */

import type {
  BurnScenario,
  BurnProjection,
  BurnWeekRow,
  WeeklyOutRow,
  WeeklyInRow,
} from '@/types/cash-burn'

/**
 * Project burn over time by combining cash in/out grids with scenario adjustments.
 *
 * @param cashOutGrid - Weekly cost grid
 * @param cashInGrid - Weekly revenue/funding grid
 * @param scenario - Scenario with opening balance, delays, and growth
 * @returns Burn projection with weekly rows, runway, and monthly burn rate
 */
export function projectBurn(
  cashOutGrid: WeeklyOutRow[],
  cashInGrid: WeeklyInRow[],
  scenario: BurnScenario
): BurnProjection {
  const weeks = Math.max(cashOutGrid.length, cashInGrid.length)
  if (weeks === 0) {
    return { weeks: [], runwayWeeks: null, monthlyBurnRate: 0 }
  }

  const rows: BurnWeekRow[] = []
  let cumulativeBalance = scenario.openingBalance
  // INTENT: Compound annual growth over 52 weeks, not flat multiplier
  // VALIDATION: Guard against NaN when growth < -100% (e.g. -200% → negative base)
  const growthBase = 1 + scenario.revenueGrowthPct / 100
  const weeklyGrowthFactor = scenario.revenueGrowthPct !== 0 && growthBase > 0
    ? Math.pow(growthBase, 1 / 52)
    : 1

  for (let w = 0; w < weeks; w++) {
    // Apply delays: shift the source week index
    const inWeekIdx = w - scenario.revenueDelayWeeks
    const outWeekIdx = w - scenario.costDelayWeeks

    // Get cash in for this week (with delay applied)
    let totalIn = 0
    if (inWeekIdx >= 0 && inWeekIdx < cashInGrid.length) {
      totalIn = cashInGrid[inWeekIdx].totalIn
    }

    // Apply compound revenue growth scaling
    if (weeklyGrowthFactor !== 1 && inWeekIdx >= 0 && inWeekIdx < cashInGrid.length) {
      // Scale only the revenue portion, not loans/equity/grants
      // INTENT: Use inWeekIdx (source week) not w (display week) — the growth
      // exponent should reflect how many weeks of growth the source data has,
      // not the shifted display position.
      const revenueOnly = cashInGrid[inWeekIdx].revenue
      const nonRevenue = totalIn - revenueOnly
      totalIn = Math.round(revenueOnly * Math.pow(weeklyGrowthFactor, inWeekIdx)) + nonRevenue
    }

    // Get cash out for this week (with delay applied)
    let totalOut = 0
    if (outWeekIdx >= 0 && outWeekIdx < cashOutGrid.length) {
      totalOut = cashOutGrid[outWeekIdx].totalOut
    }

    const net = totalIn - totalOut
    cumulativeBalance += net

    // Use the label from the original week position (not the shifted one)
    const weekLabel = w < cashOutGrid.length
      ? cashOutGrid[w].weekLabel
      : cashInGrid[w]?.weekLabel ?? `W${w + 1}`
    const weekStart = w < cashOutGrid.length
      ? cashOutGrid[w].weekStart
      : cashInGrid[w]?.weekStart ?? ''

    rows.push({
      weekStart,
      weekLabel,
      totalIn,
      totalOut,
      net,
      cumulativeBalance,
    })
  }

  const { weeks: runwayWeeks, monthlyBurn } = computeRunway(rows, scenario.openingBalance)

  return {
    weeks: rows,
    runwayWeeks,
    monthlyBurnRate: monthlyBurn,
  }
}

/**
 * Calculate runway weeks and average monthly burn from a projection.
 */
function computeRunway(
  rows: BurnWeekRow[],
  openingBalance: number
): { weeks: number | null; monthlyBurn: number } {
  if (rows.length === 0) {
    return { weeks: null, monthlyBurn: 0 }
  }

  // Find the first week where cumulative balance hits zero or negative
  // INTENT: Balance at exactly 0 means cash is exhausted — not "sustainable"
  let runwayWeeks: number | null = null
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].cumulativeBalance <= 0) {
      runwayWeeks = i
      break
    }
  }

  // If balance never goes negative in the window, check if we're net positive
  if (runwayWeeks === null) {
    const totalNet = rows.reduce((sum, r) => sum + r.net, 0)
    if (totalNet >= 0) {
      // Sustainable — net positive over the period
      return { weeks: null, monthlyBurn: 0 }
    }
    // Burning cash but doesn't hit zero in the window
    // Extrapolate from average weekly burn
    const avgWeeklyBurn = Math.abs(totalNet / rows.length)
    const lastBalance = rows[rows.length - 1].cumulativeBalance
    if (avgWeeklyBurn > 0 && lastBalance > 0) {
      runwayWeeks = rows.length + Math.floor(lastBalance / avgWeeklyBurn)
    }
  }

  // Calculate average monthly burn (4.33 weeks per month)
  const totalOut = rows.reduce((sum, r) => sum + r.totalOut, 0)
  const totalIn = rows.reduce((sum, r) => sum + r.totalIn, 0)
  const netBurnPerWeek = (totalOut - totalIn) / rows.length
  const monthlyBurn = Math.round(netBurnPerWeek * (52 / 12))

  return { weeks: runwayWeeks, monthlyBurn }
}
