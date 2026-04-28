/**
 * Money · runway.ts — pure projection engine for V2 Cockpit.
 *
 * Replaces the legacy `src/lib/cash-burn/burn-engine.ts` which took
 * pre-aggregated weekly grids. V2 takes plan_line_items rows directly plus
 * an optional scenario and an opening-balance input, does the weekly
 * aggregation internally, and emits a projection + runway + monthly burn
 * rate. Pure functions, no DB access; server actions call this after
 * pulling the rows.
 *
 * Parity goal: output matches legacy burn-engine for migrated foundries
 * within rounding error (±1 pence per cell). This is the acceptance
 * criterion for the forward-migration Chunk 1G — we snapshot runway + burn
 * for every foundry's active scenario on the legacy side, run it through
 * this V2 engine on the migrated data, and require a rank correlation ≥
 * 0.95 on runway weeks + identical monthly-burn within 1%.
 *
 * All amounts in pence/cents (integer). Week 0 = the week containing
 * asOfDate; week N = N weeks after. Standard 52 weeks / 12 months = 4.333…
 * weeks/month conversion.
 */

export type PlanLineItemRow = {
  id: string
  direction: 'out' | 'in'
  category: string
  amount_cents: number
  frequency:
    | 'one_off'
    | 'weekly'
    | 'monthly'
    | 'quarterly'
    | 'annual'
    | 'variable'
  effective_from: string
  effective_to: string | null
  probability_pct: number
  annual_uplift_pct: number
}

export type ScenarioOverrideRow = {
  line_item_id: string | null
  override_amount_cents: number | null
  override_frequency: PlanLineItemRow['frequency'] | null
  override_effective_from: string | null
  override_effective_to: string | null
  override_probability_pct: number | null
}

export type RunwayInput = {
  asOfDate: Date
  openingBalanceCents: number
  weeks: number
  lines: PlanLineItemRow[]
  overrides?: ScenarioOverrideRow[]
}

export type RunwayWeekRow = {
  weekStart: string
  weekLabel: string
  totalInCents: number
  totalOutCents: number
  netCents: number
  cumulativeBalanceCents: number
}

export type RunwayProjection = {
  weeks: RunwayWeekRow[]
  runwayWeeks: number | null
  monthlyBurnCents: number
  monthlyBurnMonths: number | null
  cashZeroDate: string | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const WEEKS_PER_YEAR = 52
const WEEKS_PER_MONTH = 52 / 12

function mondayOf(d: Date): Date {
  const copy = new Date(d.getTime())
  copy.setUTCHours(0, 0, 0, 0)
  const dow = copy.getUTCDay() // 0 = Sun, 1 = Mon, ... 6 = Sat
  const diff = (dow + 6) % 7 // days since Monday
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
 * Merge any overrides into the line items, producing an "effective" list.
 * Each override keyed on line_item_id supersedes the base row's amount /
 * frequency / effective_{from,to} / probability_pct when non-null.
 * Orphaned overrides (line_item_id=null) are ignored — the trigger on
 * scenario_overrides should have archived them.
 */
export function applyOverrides(
  lines: PlanLineItemRow[],
  overrides: ScenarioOverrideRow[] | undefined,
): PlanLineItemRow[] {
  if (!overrides || overrides.length === 0) return lines
  const byLineId = new Map<string, ScenarioOverrideRow>()
  for (const o of overrides) {
    if (o.line_item_id) byLineId.set(o.line_item_id, o)
  }
  return lines.map((line) => {
    const o = byLineId.get(line.id)
    if (!o) return line
    return {
      ...line,
      amount_cents: o.override_amount_cents ?? line.amount_cents,
      frequency: o.override_frequency ?? line.frequency,
      effective_from: o.override_effective_from ?? line.effective_from,
      effective_to: o.override_effective_to ?? line.effective_to,
      probability_pct: o.override_probability_pct ?? line.probability_pct,
    }
  })
}

/**
 * Compute the expected amount (in pence) of a single line item in the
 * week starting `weekStart`. Returns 0 if the line is inactive in that week.
 *
 * Frequency handling:
 *   - one_off: 1× amount if weekStart covers effective_from.
 *   - weekly: amount_cents per week.
 *   - monthly: amount_cents / 4.333.
 *   - quarterly: amount_cents / 13.
 *   - annual: amount_cents / 52 (with optional annual_uplift_pct applied
 *     once per crossed year boundary).
 *   - variable: amount_cents / 4.333 (treated as monthly average for V1).
 * Probability scaling applied for income rows (direction='in'); ignored
 * for expense rows (direction='out').
 */
export function lineAmountForWeek(
  line: PlanLineItemRow,
  weekStart: Date,
  weekIndex: number,
): number {
  const from = new Date(line.effective_from)
  const to = line.effective_to ? new Date(line.effective_to) : null
  const weekEnd = addDays(weekStart, 7)
  if (from > weekEnd) return 0
  if (to && to < weekStart) return 0

  const base = line.amount_cents
  let weekly = 0
  switch (line.frequency) {
    case 'one_off':
      if (from >= weekStart && from < weekEnd) weekly = base
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

  // Annual uplift: each full year since effective_from multiplies amount.
  // Income uplift only (revenue growth compounding); costs inflate too but
  // conservatively we apply uplift only when annual_uplift_pct is non-zero.
  if (line.annual_uplift_pct !== 0 && weekIndex > 0) {
    const yearsSinceStart = Math.floor(
      (weekStart.getTime() - from.getTime()) / (MS_PER_DAY * 365),
    )
    if (yearsSinceStart > 0) {
      weekly *= Math.pow(1 + line.annual_uplift_pct / 100, yearsSinceStart)
    }
  }

  // Probability scaling for income rows; expenses scheduled at 100%.
  if (line.direction === 'in') {
    weekly *= line.probability_pct / 100
  }

  return Math.round(weekly)
}

/**
 * Project runway given lines + overrides + opening balance + horizon.
 */
export function projectRunway(input: RunwayInput): RunwayProjection {
  const effective = applyOverrides(input.lines, input.overrides)
  const firstMonday = mondayOf(input.asOfDate)

  const rows: RunwayWeekRow[] = []
  let balance = input.openingBalanceCents

  for (let w = 0; w < input.weeks; w++) {
    const weekStart = addDays(firstMonday, w * 7)
    let out = 0
    let inc = 0
    for (const line of effective) {
      const amt = lineAmountForWeek(line, weekStart, w)
      if (amt === 0) continue
      if (line.direction === 'out') out += amt
      else inc += amt
    }
    const net = inc - out
    balance += net
    rows.push({
      weekStart: isoDate(weekStart),
      weekLabel: `W${w + 1}`,
      totalInCents: inc,
      totalOutCents: out,
      netCents: net,
      cumulativeBalanceCents: balance,
    })
  }

  // Runway: first week where cumulative <= 0.
  let runwayWeeks: number | null = null
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].cumulativeBalanceCents <= 0) {
      runwayWeeks = i
      break
    }
  }

  // If never hits zero in the window, extrapolate from avg weekly burn.
  if (runwayWeeks === null && rows.length > 0) {
    const totalNet = rows.reduce((s, r) => s + r.netCents, 0)
    if (totalNet < 0) {
      const avgWeeklyBurn = Math.abs(totalNet / rows.length)
      const last = rows[rows.length - 1].cumulativeBalanceCents
      if (avgWeeklyBurn > 0 && last > 0) {
        runwayWeeks = rows.length + Math.floor(last / avgWeeklyBurn)
      }
    }
  }

  // Monthly burn: avg weekly net × 4.333 (as a positive number when burning).
  let monthlyBurnCents = 0
  if (rows.length > 0) {
    const totalOut = rows.reduce((s, r) => s + r.totalOutCents, 0)
    const totalIn = rows.reduce((s, r) => s + r.totalInCents, 0)
    const weeklyNetBurn = (totalOut - totalIn) / rows.length
    monthlyBurnCents = Math.round(weeklyNetBurn * WEEKS_PER_MONTH)
  }

  const monthlyBurnMonths =
    runwayWeeks === null ? null : Math.floor(runwayWeeks / WEEKS_PER_MONTH)

  const cashZeroDate =
    runwayWeeks === null
      ? null
      : isoDate(addDays(firstMonday, runwayWeeks * 7))

  return {
    weeks: rows,
    runwayWeeks,
    monthlyBurnCents,
    monthlyBurnMonths,
    cashZeroDate,
  }
}
