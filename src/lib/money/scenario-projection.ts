/**
 * Money · scenario-projection.ts
 *
 * Pure, deterministic burn projection used by the scenario detail sliders.
 *
 * This lib runs both client-side (for live slider recompute via useMemo) and
 * server-side (for saved projections, tests, etc). It deliberately does NOT
 * import `runway.ts` — that engine takes plan_line_items rows with annual
 * uplifts and probability rules tuned for the Cockpit hero. This one takes
 * a simpler PlanLine shape and applies the four legacy "levers" from the
 * Cash Burn page: revenue delay, cost delay, revenue growth %, opening
 * balance override.
 *
 * No Date.now() is called inside — the caller passes `now` when they want
 * determinism (tests, SSR). If omitted we use `new Date()` at call-time.
 */

export type PlanLine = {
  direction: 'in' | 'out'
  amount_cents: number
  frequency: 'one_off' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'variable'
  effective_from: string // ISO date
  effective_to: string | null
  probability_pct: number | null
}

export type Sliders = {
  revenue_delay_weeks: number
  cost_delay_weeks: number
  revenue_growth_pct: number // -50..100
  opening_balance_cents: number | null
}

export type WeeklyProjection = Array<{
  week_start: string // ISO Monday
  cash_in_cents: number
  cash_out_cents: number
  net_cents: number
  cumulative_cents: number
}>

export type ScenarioProjection = {
  weeks: WeeklyProjection
  cashZeroWeek: number | null
  cashZeroDate: string | null
  runwayWeeks: number | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const WEEKS_PER_YEAR = 52
const WEEKS_PER_MONTH = 52 / 12 // 4.333…

function mondayOf(d: Date): Date {
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

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY)
}

/**
 * Amount (in pence) this line contributes to the week starting `weekStart`.
 * Legacy frequency divisors mirrored from the Cash Burn engine.
 * Probability-weighting applied uniformly (cash-in AND cash-out), matching
 * the legacy contract in task spec.
 */
function lineWeekAmount(
  line: PlanLine,
  effectiveFromShifted: Date,
  weekStart: Date,
): number {
  const weekEnd = addDays(weekStart, 7)
  const to = line.effective_to ? new Date(line.effective_to) : null
  if (effectiveFromShifted > weekEnd) return 0
  if (to && to < weekStart) return 0

  const base = line.amount_cents
  let weekly = 0
  switch (line.frequency) {
    case 'one_off':
      if (effectiveFromShifted >= weekStart && effectiveFromShifted < weekEnd) {
        weekly = base
      }
      break
    case 'weekly':
      weekly = base
      break
    case 'monthly':
      weekly = base / WEEKS_PER_MONTH
      break
    case 'quarterly':
      weekly = base / (WEEKS_PER_YEAR / 4)
      break
    case 'annual':
      weekly = base / WEEKS_PER_YEAR
      break
    case 'variable':
      weekly = base / WEEKS_PER_MONTH
      break
  }

  // Probability-weight using the spec formula: amount * (probability ?? 100) / 100
  const prob = line.probability_pct ?? 100
  weekly *= prob / 100

  return weekly
}

/**
 * Project 52-week burn (default) with the four legacy sliders applied.
 *
 * Slider semantics:
 * - `revenue_delay_weeks` shifts each `direction: 'in'` line's effective_from
 *   forward by N*7 days (no change to effective_to).
 * - `cost_delay_weeks` does the same for `direction: 'out'`.
 * - `revenue_growth_pct` multiplies every cash-in line's contribution by
 *   (1 + growth/100). Applied AFTER probability weighting.
 * - `opening_balance_cents`, if non-null, overrides the foundry default.
 *
 * Cash-zero detection: first week where cumulative_cents <= 0.
 * If the window never hits zero but the overall trend is burning, we
 * extrapolate using the last 12 weeks' average net to give a runway estimate
 * the UI can display as "cash-zero in ~N weeks" even when outside the chart.
 * If the last 12 weeks are net-positive, runway is null (interpreted by UI
 * as "sustainable").
 */
export function projectBurn(
  lines: PlanLine[],
  sliders: Sliders,
  defaultOpeningBalanceCents: number,
  options?: { weeks?: number; now?: Date },
): ScenarioProjection {
  const weeks = options?.weeks ?? 52
  const now = options?.now ?? new Date()
  const firstMonday = mondayOf(now)

  const growthMultiplier = 1 + sliders.revenue_growth_pct / 100

  // Pre-compute shifted effective_from per line once.
  const prepared = lines.map((line) => {
    const shiftDays =
      line.direction === 'in'
        ? sliders.revenue_delay_weeks * 7
        : sliders.cost_delay_weeks * 7
    const shifted = addDays(new Date(line.effective_from), shiftDays)
    return { line, shifted }
  })

  const openingBalance =
    sliders.opening_balance_cents ?? defaultOpeningBalanceCents

  const rows: WeeklyProjection = []
  let balance = openingBalance

  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(firstMonday, w * 7)
    let cashIn = 0
    let cashOut = 0
    for (const { line, shifted } of prepared) {
      const amt = lineWeekAmount(line, shifted, weekStart)
      if (amt === 0) continue
      if (line.direction === 'in') cashIn += amt * growthMultiplier
      else cashOut += amt
    }
    const roundedIn = Math.round(cashIn)
    const roundedOut = Math.round(cashOut)
    const net = roundedIn - roundedOut
    balance += net
    rows.push({
      week_start: isoDate(weekStart),
      cash_in_cents: roundedIn,
      cash_out_cents: roundedOut,
      net_cents: net,
      cumulative_cents: balance,
    })
  }

  // Cash-zero within window.
  let cashZeroWeek: number | null = null
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].cumulative_cents <= 0) {
      cashZeroWeek = i
      break
    }
  }

  let cashZeroDate: string | null = null
  let runwayWeeks: number | null = cashZeroWeek

  if (cashZeroWeek !== null) {
    cashZeroDate = rows[cashZeroWeek].week_start
  } else if (rows.length >= 1) {
    // Extrapolate using the last 12 weeks (or fewer if window is shorter).
    const tailSize = Math.min(12, rows.length)
    const tail = rows.slice(rows.length - tailSize)
    const tailNet = tail.reduce((s, r) => s + r.net_cents, 0)
    const avgWeeklyNet = tailNet / tailSize
    if (avgWeeklyNet < 0) {
      const finalBalance = rows[rows.length - 1].cumulative_cents
      if (finalBalance > 0) {
        const extraWeeks = Math.floor(finalBalance / Math.abs(avgWeeklyNet))
        runwayWeeks = rows.length + extraWeeks
        cashZeroDate = isoDate(addDays(firstMonday, runwayWeeks * 7))
      }
    }
  }

  return {
    weeks: rows,
    cashZeroWeek,
    cashZeroDate,
    runwayWeeks,
  }
}
