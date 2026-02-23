/**
 * @file forecast.ts — Pure cash flow forecasting engine
 *
 * @description Produces forward-looking cash flow projections with
 * best/expected/worst scenario bands. Computes runway and burn rate.
 * All functions are pure (no DB, fully testable).
 */

// ============================================================
// Types
// ============================================================

export interface RecurringRevenue {
  source: string
  monthlyAmount: number // in pence
}

export interface RecurringCost {
  source: string
  monthlyAmount: number // in pence
  category: string
}

export interface ForecastInput {
  currentBalance: number         // in pence
  recurringRevenue: RecurringRevenue[]
  recurringCosts: RecurringCost[]
  months: number                 // how many months to project
}

export interface ForecastPoint {
  month: string        // ISO month e.g. "2026-03"
  label: string        // "Mar 2026"
  balance: number      // projected end-of-month balance
  inflow: number       // total monthly inflow
  outflow: number      // total monthly outflow
  net: number          // inflow - outflow
  bestCase: number     // optimistic balance (+20% revenue, -10% costs)
  worstCase: number    // pessimistic balance (-20% revenue, +10% costs)
}

export interface RunwayResult {
  monthsRemaining: number | null  // null = sustainable (inflow >= outflow)
  burnRate: number                // monthly net burn in pence (negative = losing money)
  totalMonthlyRevenue: number
  totalMonthlyCosts: number
}

export interface ScenarioAdjustment {
  type: 'add_client' | 'lose_client' | 'add_hire' | 'price_change'
  amount: number // monthly delta in pence (positive = more money in/out)
}

// ============================================================
// Forecast
// ============================================================

/**
 * Project cash flow over N months with scenario bands.
 */
export function projectCashFlow(input: ForecastInput): ForecastPoint[] {
  const { currentBalance, recurringRevenue, recurringCosts, months } = input

  const monthlyRevenue = recurringRevenue.reduce((sum, r) => sum + r.monthlyAmount, 0)
  const monthlyCosts = recurringCosts.reduce((sum, c) => sum + c.monthlyAmount, 0)
  const monthlyNet = monthlyRevenue - monthlyCosts

  // Scenario factors
  const bestRevenueFactor = 1.20    // +20% revenue
  const bestCostFactor = 0.90       // -10% costs
  const worstRevenueFactor = 0.80   // -20% revenue
  const worstCostFactor = 1.10      // +10% costs

  const bestMonthlyNet = Math.round(monthlyRevenue * bestRevenueFactor) - Math.round(monthlyCosts * bestCostFactor)
  const worstMonthlyNet = Math.round(monthlyRevenue * worstRevenueFactor) - Math.round(monthlyCosts * worstCostFactor)

  const points: ForecastPoint[] = []
  let balance = currentBalance
  let bestBalance = currentBalance
  let worstBalance = currentBalance

  const now = new Date()

  for (let i = 1; i <= months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

    balance += monthlyNet
    bestBalance += bestMonthlyNet
    worstBalance += worstMonthlyNet

    points.push({
      month,
      label,
      balance,
      inflow: monthlyRevenue,
      outflow: monthlyCosts,
      net: monthlyNet,
      bestCase: bestBalance,
      worstCase: worstBalance,
    })
  }

  return points
}

/**
 * Apply scenario adjustments to forecast input.
 */
export function applyScenarios(
  input: ForecastInput,
  adjustments: ScenarioAdjustment[]
): ForecastInput {
  let revenueAdjustment = 0
  let costAdjustment = 0

  for (const adj of adjustments) {
    switch (adj.type) {
      case 'add_client':
      case 'price_change':
        revenueAdjustment += adj.amount
        break
      case 'lose_client':
        revenueAdjustment -= adj.amount
        break
      case 'add_hire':
        costAdjustment += adj.amount
        break
    }
  }

  return {
    ...input,
    recurringRevenue: [
      ...input.recurringRevenue,
      ...(revenueAdjustment !== 0
        ? [{ source: 'Scenario adjustment', monthlyAmount: revenueAdjustment }]
        : []),
    ],
    recurringCosts: [
      ...input.recurringCosts,
      ...(costAdjustment !== 0
        ? [{ source: 'Scenario adjustment', monthlyAmount: costAdjustment, category: 'other' }]
        : []),
    ],
  }
}

/**
 * Calculate runway (months until cash runs out) and burn rate.
 */
export function calculateRunway(
  currentBalance: number,
  recurringRevenue: RecurringRevenue[],
  recurringCosts: RecurringCost[]
): RunwayResult {
  const totalMonthlyRevenue = recurringRevenue.reduce((sum, r) => sum + r.monthlyAmount, 0)
  const totalMonthlyCosts = recurringCosts.reduce((sum, c) => sum + c.monthlyAmount, 0)
  const burnRate = totalMonthlyRevenue - totalMonthlyCosts

  if (burnRate >= 0) {
    // Sustainable — revenue covers costs
    return {
      monthsRemaining: null,
      burnRate,
      totalMonthlyRevenue,
      totalMonthlyCosts,
    }
  }

  // Burning cash — calculate months until zero
  const monthsRemaining = Math.floor(currentBalance / Math.abs(burnRate))

  return {
    monthsRemaining: Math.max(0, monthsRemaining),
    burnRate,
    totalMonthlyRevenue,
    totalMonthlyCosts,
  }
}
