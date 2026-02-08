/**
 * @file cost-of-delay/types.ts
 *
 * @description Pure types and calculation functions for the Cost of Delay calculator.
 * All financial logic lives here — no React, no side effects.
 *
 * Core concept: Every month you delay launching costs you
 *   (monthly_overhead + lost_monthly_revenue).
 * If you can spend less than that to ship a month earlier, you save money.
 */

/** User-provided inputs for the calculator */
export interface CostOfDelayInputs {
  /** Monthly burn rate — salaries, rent, subscriptions, etc. */
  monthlyOverhead: number
  /** Expected monthly revenue once launched */
  expectedMonthlyRevenue: number
  /** Months from now until planned launch (original timeline) */
  monthsUntilLaunch: number
  /** Months that could be saved by investing to accelerate */
  monthsSaved: number
  /** One-time cost to achieve the acceleration */
  accelerationCost: number
}

/** A single data point on the cumulative chart */
export interface ChartDataPoint {
  month: number
  label: string
  doNothing: number
  accelerate: number
  savings: number
}

/** Summary metrics derived from the inputs */
export interface SummaryMetrics {
  /** Cost of Delay per month = overhead + lost revenue */
  costOfDelayPerMonth: number
  /** Total months saved */
  monthsSaved: number
  /** Net savings at 12-month mark (accelerate vs do nothing) */
  savingsAt12Months: number
  /** Net savings at 24-month mark */
  savingsAt24Months: number
  /** ROI of the acceleration investment as a percentage */
  accelerationROI: number
  /** Months until the acceleration cost pays for itself */
  breakEvenMonths: number
}

/** Default inputs for a fresh calculator */
export const DEFAULT_INPUTS: CostOfDelayInputs = {
  monthlyOverhead: 20000,
  expectedMonthlyRevenue: 50000,
  monthsUntilLaunch: 6,
  monthsSaved: 2,
  accelerationCost: 15000,
}

const CHART_MONTHS = 24

/**
 * Calculates cumulative net position for a scenario at a given month.
 *
 * @param month - The month index (0 = now)
 * @param launchMonth - The month when revenue starts
 * @param monthlyOverhead - Monthly burn rate
 * @param monthlyRevenue - Monthly revenue post-launch
 * @param upfrontCost - One-time cost at month 0 (e.g. acceleration investment)
 * @returns Cumulative net financial position
 */
function cumulativePosition(
  month: number,
  launchMonth: number,
  monthlyOverhead: number,
  monthlyRevenue: number,
  upfrontCost: number
): number {
  let cumulative = -upfrontCost

  for (let m = 1; m <= month; m++) {
    if (m <= launchMonth) {
      // Pre-launch: paying overhead, no revenue
      cumulative -= monthlyOverhead
    } else {
      // Post-launch: earning revenue, still paying overhead
      cumulative += monthlyRevenue - monthlyOverhead
    }
  }

  return cumulative
}

/**
 * Generates chart data points for both scenarios over 24 months.
 *
 * @param inputs - Calculator inputs
 * @returns Array of data points for the cumulative comparison chart
 */
export function generateChartData(inputs: CostOfDelayInputs): ChartDataPoint[] {
  const {
    monthlyOverhead,
    expectedMonthlyRevenue,
    monthsUntilLaunch,
    monthsSaved,
    accelerationCost,
  } = inputs

  const originalLaunch = monthsUntilLaunch
  const acceleratedLaunch = Math.max(0, monthsUntilLaunch - monthsSaved)

  const points: ChartDataPoint[] = []

  for (let m = 0; m <= CHART_MONTHS; m++) {
    const doNothing = cumulativePosition(
      m,
      originalLaunch,
      monthlyOverhead,
      expectedMonthlyRevenue,
      0
    )
    const accelerate = cumulativePosition(
      m,
      acceleratedLaunch,
      monthlyOverhead,
      expectedMonthlyRevenue,
      accelerationCost
    )

    points.push({
      month: m,
      label: m === 0 ? "Now" : `Mo ${m}`,
      doNothing,
      accelerate,
      savings: accelerate - doNothing,
    })
  }

  return points
}

/**
 * Calculates summary metrics from the inputs.
 *
 * @param inputs - Calculator inputs
 * @returns Derived financial metrics
 */
export function calculateMetrics(inputs: CostOfDelayInputs): SummaryMetrics {
  const {
    monthlyOverhead,
    expectedMonthlyRevenue,
    monthsUntilLaunch,
    monthsSaved,
    accelerationCost,
  } = inputs

  const costOfDelayPerMonth = monthlyOverhead + expectedMonthlyRevenue

  // Total value of months saved = months_saved * cost_of_delay_per_month
  const totalValueOfAcceleration = monthsSaved * costOfDelayPerMonth

  // Net savings = value gained - cost paid
  const netSavings = totalValueOfAcceleration - accelerationCost

  // Use chart data for precise 12/24 month figures
  const chartData = generateChartData(inputs)
  const savingsAt12Months = chartData[12]?.savings ?? 0
  const savingsAt24Months = chartData[24]?.savings ?? 0

  // ROI: (net gain / cost) * 100
  const accelerationROI =
    accelerationCost > 0
      ? ((totalValueOfAcceleration - accelerationCost) / accelerationCost) * 100
      : 0

  // Break-even: how many months of revenue offset the acceleration cost
  // After both scenarios are launched, the accelerated one earns revenue faster.
  // The monthly advantage = expectedMonthlyRevenue (earned in months the other scenario hasn't launched yet)
  // But once both are launched, the advantage stops growing (it's already banked).
  // So break-even is simply: accelerationCost / costOfDelayPerMonth months after the accelerated launch.
  const breakEvenMonths =
    costOfDelayPerMonth > 0
      ? accelerationCost / costOfDelayPerMonth
      : Infinity

  return {
    costOfDelayPerMonth,
    monthsSaved,
    savingsAt12Months,
    savingsAt24Months,
    accelerationROI,
    breakEvenMonths: Math.ceil(breakEvenMonths * 10) / 10, // Round to 1 decimal
  }
}
