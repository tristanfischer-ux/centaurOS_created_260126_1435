/**
 * scripts/lib/scenario-planning.ts
 *
 * UNIVERSAL scenario / sensitivity engine for the Anvil PDF design dossier.
 *
 * Varies ONLY EXOGENOUS assumptions (do NOT change the bill of materials):
 * feedstock/energy prices, output sale price + policy premium, utilisation
 * (capped at the design's rated hours), cost of capital, and capex via a
 * labelled FOAK->NOAK learning curve FLOORED by the bottom-up BoM. Physical
 * design levers (yield, selectivity, throughput) are EXCLUDED — changing them
 * resizes the plant and would need a full design re-run, not a financial scalar.
 * (Design council 2026-06-07: drawer forgeos_decisions_28796f97dde61210.)
 *
 * DETERMINISTIC + pure: the DCF below is a faithful port of the Python tool
 * scripts/lib/orchestrator/tools/python/yield_economics_npv.py::compute, so the
 * "Base" scenario reproduces the dossier's headline economics exactly (guarded
 * by the regression harness invariant scenario_recompute_matches_base).
 *
 * Run the self-test:  npx tsx scripts/lib/scenario-planning.ts --selftest
 */

// ---------------------------------------------------------------------------
// Resolved economic inputs the DCF consumes (mirror of the Python payload).
// ---------------------------------------------------------------------------
export interface ResolvedEcon {
  capex_gbp: number
  opex_gbp_year: number
  annual_yield_units: number
  market_price_gbp_per_unit: number
  discount_rate_frac: number          // 0.10 == 10%
  project_life_years: number
  price_inflation_frac: number
  operational_inflation_frac: number
  tax_rate_frac: number
}

export interface DcfResult {
  npv_gbp: number
  irr_pct: number | null
  payback_years: number | null         // null == beyond plant life / never
  levelised_per_unit_gbp: number       // all-in: opex/yield + capex/(yield*life)
  cashflows: number[]
}

/** Faithful port of yield_economics_npv.py::calculate_irr (Newton + bisection + never-profit guard). */
export function calcIrr(cashflows: number[], guess = 0.10, tol = 1e-6, maxIter = 100): number | null {
  if (!cashflows.some((cf) => cf > 0) || !cashflows.some((cf) => cf < 0)) return null
  // every post-year-0 flow <= 0 -> NPV never crosses zero -> no IRR
  if (cashflows.slice(1).every((cf) => cf <= 0)) return null
  try {
    let r = guess
    for (let i = 0; i < maxIter; i++) {
      if (r <= -0.9999) break
      const npv = cashflows.reduce((s, cf, t) => s + cf / (1 + r) ** t, 0)
      const dNpv = cashflows.reduce((s, cf, t) => s + (-t * cf) / (1 + r) ** (t + 1), 0)
      if (Math.abs(dNpv) < 1e-12) break
      const rNew = r - npv / dNpv
      if (!Number.isFinite(rNew) || Math.abs(rNew) > 1e6) break
      if (Math.abs(rNew - r) < tol) return rNew
      r = rNew
    }
    let low = -0.99
    let high = 5.0
    for (let i = 0; i < 200; i++) {
      const mid = (low + high) / 2
      const npvMid = cashflows.reduce((s, cf, t) => s + cf / (1 + mid) ** t, 0)
      if (Math.abs(npvMid) < tol) return mid
      const npvLow = cashflows.reduce((s, cf, t) => s + cf / (1 + low) ** t, 0)
      if (npvLow * npvMid < 0) high = mid
      else low = mid
    }
  } catch {
    return null
  }
  return null
}

/** Faithful port of yield_economics_npv.py::compute (the financial core only). */
export function dcf(e: ResolvedEcon): DcfResult {
  const yld = Math.max(0.1, e.annual_yield_units)
  const grossYr1 = yld * e.market_price_gbp_per_unit
  const cashflows: number[] = [-e.capex_gbp]
  let payback: number | null = null
  for (let t = 1; t <= e.project_life_years; t++) {
    const revenue = grossYr1 * (1 + e.price_inflation_frac) ** (t - 1)
    const opex = e.opex_gbp_year * (1 + e.operational_inflation_frac) ** (t - 1)
    const dep = e.capex_gbp / e.project_life_years
    const ebt = revenue - opex - dep
    const tax = Math.max(0, ebt) * e.tax_rate_frac
    const cf = ebt - tax + dep
    cashflows.push(cf)
    if (payback === null && cashflows.reduce((s, c) => s + c, 0) >= 0) payback = t
  }
  const npv = cashflows.reduce((s, cf, t) => s + cf / (1 + e.discount_rate_frac) ** t, 0)
  const irr = calcIrr(cashflows)
  const costPerUnitOpex = e.opex_gbp_year / yld
  const capexAmort = e.capex_gbp / (yld * e.project_life_years)
  return {
    npv_gbp: Math.round(npv),
    irr_pct: irr === null ? null : Math.round(irr * 1000) / 10,
    payback_years: payback,
    levelised_per_unit_gbp: Math.round((costPerUnitOpex + capexAmort) * 100) / 100,
    cashflows: cashflows.map((cf) => Math.round(cf)),
  }
}

// ---------------------------------------------------------------------------
// Scenario model — the per-design economic structure (derived from the
// economics step's recorded inputs; bands are per-class config with a generic
// fallback). Variable costs scale with utilisation; one fixed slice scales
// with capex (so the NOAK capex lever correctly lowers capex-linked O&M).
// ---------------------------------------------------------------------------
export interface VariableCost {
  id: string
  label: string
  price_base: number
  price_unit: string
  qty_per_year_at_base_hours: number
}

export interface ScenarioModel {
  output_unit_label: string          // "kg SAF"
  output_unit_short: string          // "kg" | "t" | "kWh"
  levelised_unit_label: string       // "£/t SAF" (display) — see levelised_display_factor
  levelised_display_factor: number   // multiply £/output-unit by this for display (e.g. 1000 for £/kg -> £/t)
  capex_base_gbp: number
  bom_floor_gbp: number              // capex may not drop below the bottom-up BoM
  hours_base: number
  hours_design_max: number           // utilisation cap (can't exceed design)
  annual_yield_at_base_hours: number
  output_price_base: number
  output_price_unit: string          // "£/kg (Jet-A + RTFO)"
  discount_rate_pct_base: number
  project_life_years: number
  price_inflation_pct: number
  operational_inflation_pct: number
  tax_rate_pct: number
  fixed_capex_fraction: number       // fixed opex = capex * this
  fixed_non_capex_gbp: number
  variable_costs: VariableCost[]
}

/** Per-lever low/high bands (pessimistic / optimistic). */
export interface Bands {
  capex: { pessimistic: number; optimistic: number }
  output_price: { pessimistic: number; optimistic: number }
  hours: { pessimistic: number; optimistic: number }
  discount_rate_pct: { pessimistic: number; optimistic: number }
  variable_prices: Record<string, { pessimistic: number; optimistic: number }>
}

/** The perturbable state. */
interface LeverState {
  capex_gbp: number
  hours: number
  output_price: number
  discount_rate_pct: number
  variable_prices: Record<string, number>
}

function baseState(m: ScenarioModel): LeverState {
  return {
    capex_gbp: m.capex_base_gbp,
    hours: m.hours_base,
    output_price: m.output_price_base,
    discount_rate_pct: m.discount_rate_pct_base,
    variable_prices: Object.fromEntries(m.variable_costs.map((v) => [v.id, v.price_base])),
  }
}

function resolve(m: ScenarioModel, s: LeverState): ResolvedEcon {
  const util = s.hours / m.hours_base
  const yld = m.annual_yield_at_base_hours * util
  const varOpex = m.variable_costs.reduce(
    (sum, v) => sum + (s.variable_prices[v.id] ?? v.price_base) * v.qty_per_year_at_base_hours * util,
    0,
  )
  const fixedOpex = m.fixed_non_capex_gbp + s.capex_gbp * m.fixed_capex_fraction
  return {
    capex_gbp: s.capex_gbp,
    opex_gbp_year: varOpex + fixedOpex,
    annual_yield_units: yld,
    market_price_gbp_per_unit: s.output_price,
    discount_rate_frac: s.discount_rate_pct / 100,
    project_life_years: m.project_life_years,
    price_inflation_frac: m.price_inflation_pct / 100,
    operational_inflation_frac: m.operational_inflation_pct / 100,
    tax_rate_frac: m.tax_rate_pct / 100,
  }
}

// ---------------------------------------------------------------------------
// Levers — each knows how to set its value into a LeverState, plus its band.
// ---------------------------------------------------------------------------
interface LeverDef {
  id: string
  label: string
  unit: string
  base: number
  pessimistic: number
  optimistic: number
  set: (s: LeverState, v: number) => void
  /** clamp a goal-seek value to a physical/plausible range; returns [clamped, infeasibleReason?] */
  feasibility: (v: number) => { ok: boolean; reason?: string }
}

function buildLevers(m: ScenarioModel, b: Bands): LeverDef[] {
  const levers: LeverDef[] = []
  // dominant variable cost first (largest base variable opex), then the rest
  const sortedVar = [...m.variable_costs].sort(
    (a, c) => c.price_base * c.qty_per_year_at_base_hours - a.price_base * a.qty_per_year_at_base_hours,
  )
  for (const v of sortedVar) {
    const band = b.variable_prices[v.id]
    if (!band) continue
    levers.push({
      id: `vprice_${v.id}`,
      label: `${v.label} price`,
      unit: v.price_unit,
      base: v.price_base,
      pessimistic: band.pessimistic,
      optimistic: band.optimistic,
      set: (s, val) => { s.variable_prices[v.id] = Math.max(0, val) },
      feasibility: (val) => (val < 0 ? { ok: false, reason: 'negative price' } : { ok: true }),
    })
  }
  levers.push({
    id: 'output_price',
    label: 'Output price (incl. premium)',
    unit: m.output_price_unit,
    base: m.output_price_base,
    pessimistic: b.output_price.pessimistic,
    optimistic: b.output_price.optimistic,
    set: (s, v) => { s.output_price = Math.max(0, v) },
    feasibility: (v) => (v < 0 ? { ok: false, reason: 'negative price' } : { ok: true }),
  })
  levers.push({
    id: 'capex',
    label: 'Installed capex',
    unit: '£',
    base: m.capex_base_gbp,
    pessimistic: b.capex.pessimistic,
    optimistic: Math.max(m.bom_floor_gbp, b.capex.optimistic),
    set: (s, v) => { s.capex_gbp = v },
    feasibility: (v) =>
      v < m.bom_floor_gbp ? { ok: false, reason: `below bottom-up BoM floor (£${fmtM(m.bom_floor_gbp)})` } : { ok: true },
  })
  levers.push({
    id: 'utilisation',
    label: 'Utilisation',
    unit: 'h/yr',
    base: m.hours_base,
    pessimistic: b.hours.pessimistic,
    optimistic: Math.min(m.hours_design_max, b.hours.optimistic),
    set: (s, v) => { s.hours = Math.min(m.hours_design_max, Math.max(0, v)) },
    feasibility: (v) =>
      v > m.hours_design_max ? { ok: false, reason: `exceeds design rating (${m.hours_design_max} h/yr)` } : { ok: true },
  })
  levers.push({
    id: 'discount_rate',
    label: 'Cost of capital',
    unit: '%',
    base: m.discount_rate_pct_base,
    pessimistic: b.discount_rate_pct.pessimistic,
    optimistic: b.discount_rate_pct.optimistic,
    set: (s, v) => { s.discount_rate_pct = Math.max(0, v) },
    feasibility: (v) => (v < 0 ? { ok: false, reason: 'negative discount rate' } : { ok: true }),
  })
  return levers
}

// ---------------------------------------------------------------------------
// Public output types
// ---------------------------------------------------------------------------
export interface ScenarioResult {
  id: string
  label: string
  lever_values: Record<string, number>
  npv_gbp: number
  irr_pct: number | null
  payback_years: number | null
  levelised_per_unit_gbp: number
  levelised_display: number          // levelised * display_factor
  clears_hurdle: boolean
  capex_below_floor: boolean
}
export interface TornadoItem {
  lever_id: string
  label: string
  unit: string
  base_value: number
  pessimistic_value: number
  optimistic_value: number
  npv_pessimistic: number
  npv_optimistic: number
  delta_npv_abs: number
}
export interface GoalSeekItem {
  lever_id: string
  label: string
  unit: string
  current_value: number              // value in the NOAK baseline
  required_value: number | null      // to clear NPV>=0; null if unreachable
  feasible: boolean
  reason?: string
}
export interface WaterfallStep { label: string; from_npv: number; to_npv: number; delta_npv: number }
export interface ScenarioPlanning {
  output_unit_label: string
  levelised_unit_label: string
  irr_hurdle_pct: number
  bom_floor_gbp: number
  base: ScenarioResult
  scenarios: ScenarioResult[]
  tornado: TornadoItem[]
  goal_seek: GoalSeekItem[]
  waterfall: WaterfallStep[]
  honest_reading: { clears_any: boolean; binding_lever_label: string; points: string[] }
  meta: { levers: string[]; note: string }
}

/** A named scenario = explicit lever values (not auto-direction; council fix). */
export interface NamedScenarioSpec { id: string; label: string; values: Partial<Record<'capex' | 'output_price' | 'utilisation' | 'discount_rate' | string, number>> }

function applySpec(m: ScenarioModel, levers: LeverDef[], spec: NamedScenarioSpec): LeverState {
  const s = baseState(m)
  for (const [k, v] of Object.entries(spec.values)) {
    if (v === undefined) continue
    const lev = levers.find((l) => l.id === k)
    if (lev) lev.set(s, v)
  }
  return s
}

function toResult(m: ScenarioModel, levers: LeverDef[], id: string, label: string, s: LeverState, hurdle: number): ScenarioResult {
  const d = dcf(resolve(m, s))
  const clears = d.npv_gbp >= 0 || (d.irr_pct !== null && d.irr_pct >= hurdle)
  return {
    id, label,
    lever_values: { capex: s.capex_gbp, output_price: s.output_price, utilisation: s.hours, discount_rate: s.discount_rate_pct, ...s.variable_prices },
    npv_gbp: d.npv_gbp,
    irr_pct: d.irr_pct,
    payback_years: d.payback_years,
    levelised_per_unit_gbp: d.levelised_per_unit_gbp,
    levelised_display: Math.round(d.levelised_per_unit_gbp * m.levelised_display_factor),
    clears_hurdle: clears,
    capex_below_floor: s.capex_gbp < m.bom_floor_gbp - 1,
  }
}

/** Binary-search a single lever to NPV=0, holding the rest at the given baseline state. */
function goalSeekLever(m: ScenarioModel, lev: LeverDef, baseline: LeverState): { value: number | null; feasible: boolean; reason?: string } {
  const npvAt = (v: number): number => {
    const s: LeverState = { ...baseline, variable_prices: { ...baseline.variable_prices } }
    lev.set(s, v)
    return dcf(resolve(m, s)).npv_gbp
  }
  // search a wide bracket around the lever's optimistic direction
  let lo = Math.min(lev.optimistic, lev.pessimistic, lev.base)
  let hi = Math.max(lev.optimistic, lev.pessimistic, lev.base)
  // widen toward whichever end improves NPV
  const span = Math.max(hi - lo, Math.abs(lev.base) || 1)
  lo = lo - span * 4
  hi = hi + span * 4
  if (lev.id === 'discount_rate' || lev.id.startsWith('vprice_')) lo = Math.max(lo, 0)
  if (lev.id === 'utilisation') { lo = 0; hi = m.hours_design_max }
  const fLo = npvAt(lo)
  const fHi = npvAt(hi)
  if (fLo === fHi || (fLo < 0 && fHi < 0) || (fLo > 0 && fHi > 0)) {
    return { value: null, feasible: false, reason: 'no crossing in plausible range' }
  }
  let a = lo, b = hi, fa = fLo
  for (let i = 0; i < 100; i++) {
    const mid = (a + b) / 2
    const fm = npvAt(mid)
    if (Math.abs(fm) < 1000 || b - a < 1e-6) { a = mid; break }
    if ((fa < 0) === (fm < 0)) { a = mid; fa = fm }   // track sign at `a`; no stale recompute
    else b = mid
  }
  const val = (a + b) / 2
  const feas = lev.feasibility(val)
  return { value: val, feasible: feas.ok, reason: feas.reason }
}

export function computeScenarioPlanning(
  m: ScenarioModel,
  b: Bands,
  opts: { irr_hurdle_pct: number; scenarios?: NamedScenarioSpec[] },
): ScenarioPlanning {
  const levers = buildLevers(m, b)
  const hurdle = opts.irr_hurdle_pct
  const base = toResult(m, levers, 'base', 'Base (FOAK, as designed)', baseState(m), hurdle)

  // default named scenarios (explicit values, council fix — no auto "best bundle")
  const dominant = levers.find((l) => l.id.startsWith('vprice_'))
  const specs: NamedScenarioSpec[] = opts.scenarios ?? [
    {
      id: 'downside', label: 'Downside',
      values: {
        capex: b.capex.pessimistic, output_price: b.output_price.pessimistic, discount_rate: b.discount_rate_pct.pessimistic,
        ...(dominant ? { [dominant.id]: dominant.pessimistic } : {}),
      },
    },
    {
      id: 'noak', label: 'NOAK (nth-of-a-kind)',
      values: {
        capex: Math.max(m.bom_floor_gbp, b.capex.optimistic), output_price: b.output_price.optimistic, discount_rate: b.discount_rate_pct.optimistic,
        ...(dominant ? { [dominant.id]: dominant.optimistic } : {}),
      },
    },
  ]
  const scenarios = specs.map((sp) => toResult(m, levers, sp.id, sp.label, applySpec(m, levers, sp), hurdle))

  // tornado: each lever pessimistic & optimistic, others at base
  const tornado: TornadoItem[] = levers.map((lev) => {
    const sP = baseState(m); lev.set(sP, lev.pessimistic)
    const sO = baseState(m); lev.set(sO, lev.optimistic)
    const npvP = dcf(resolve(m, sP)).npv_gbp
    const npvO = dcf(resolve(m, sO)).npv_gbp
    return {
      lever_id: lev.id, label: lev.label, unit: lev.unit,
      base_value: lev.base, pessimistic_value: lev.pessimistic, optimistic_value: lev.optimistic,
      npv_pessimistic: npvP, npv_optimistic: npvO, delta_npv_abs: Math.abs(npvO - npvP),
    }
  }).sort((a, c) => c.delta_npv_abs - a.delta_npv_abs)

  // goal-seek from the FOAK BASE (which fails): the single-lever move each would
  // need, others held at base — "what would it take" (council Gemini #4 / DeepSeek #4).
  // From a failing base this reads as a genuine requirement, not headroom.
  const gsBaseline = baseState(m)
  const goal_seek: GoalSeekItem[] = levers.map((lev) => {
    const r = goalSeekLever(m, lev, gsBaseline)
    const cur = lev.id === 'capex' ? gsBaseline.capex_gbp
      : lev.id === 'output_price' ? gsBaseline.output_price
      : lev.id === 'utilisation' ? gsBaseline.hours
      : lev.id === 'discount_rate' ? gsBaseline.discount_rate_pct
      : gsBaseline.variable_prices[lev.id.replace('vprice_', '')] ?? lev.base
    return { lever_id: lev.id, label: lev.label, unit: lev.unit, current_value: cur, required_value: r.value, feasible: r.feasible, reason: r.reason }
  })

  // waterfall: base -> NOAK, delta per lever applied cumulatively (in tornado-impact order)
  const noakResult = scenarios.find((s) => s.id === 'noak')
  const waterfall: WaterfallStep[] = []
  {
    const s = baseState(m)
    let prev = dcf(resolve(m, s)).npv_gbp
    const order = tornado.map((t) => t.lever_id)
    const noakSpec = specs.find((sp) => sp.id === 'noak')
    for (const id of order) {
      const target = noakSpec?.values[id as keyof typeof noakSpec.values]
      const lev = levers.find((l) => l.id === id)
      if (target === undefined || !lev) continue
      lev.set(s, target as number)
      const now = dcf(resolve(m, s)).npv_gbp
      waterfall.push({ label: lev.label, from_npv: prev, to_npv: now, delta_npv: now - prev })
      prev = now
    }
  }

  const clearsAny = base.clears_hurdle || scenarios.some((s) => s.clears_hurdle)
  const binding = tornado[0]
  const points: string[] = []
  points.push(
    clearsAny
      ? `Clears the investability bar (NPV >= 0 or IRR >= ${hurdle}%) in: ${[base, ...scenarios].filter((s) => s.clears_hurdle).map((s) => s.label).join(', ')}.`
      : `No bounded scenario clears the investability bar (NPV >= 0 or IRR >= ${hurdle}%); the closest is ${[base, ...scenarios].sort((a, c) => c.npv_gbp - a.npv_gbp)[0].label} at £${fmtM(([base, ...scenarios].sort((a, c) => c.npv_gbp - a.npv_gbp)[0].npv_gbp))}M NPV.`,
  )
  if (binding) points.push(`Binding lever: ${binding.label} (largest NPV swing, £${fmtM(binding.delta_npv_abs)}M across its range).`)
  const infeasible = goal_seek.filter((g) => !g.feasible)
  if (infeasible.length) points.push(`From the FOAK base, no plausible value of these alone reaches NPV >= 0 — they need the rest of the bundle to move too: ${infeasible.map((g) => g.label).join(', ')}.`)
  const reachable = goal_seek.filter((g) => g.feasible && g.required_value !== null)
  for (const g of reachable) {
    points.push(`From the FOAK base, ${g.label} alone would have to reach ${fmtVal(g.required_value!, g.unit)} (now ${fmtVal(g.current_value, g.unit)}) for NPV >= 0.`)
  }

  return {
    output_unit_label: m.output_unit_label,
    levelised_unit_label: m.levelised_unit_label,
    irr_hurdle_pct: hurdle,
    bom_floor_gbp: m.bom_floor_gbp,
    base,
    scenarios,
    tornado,
    goal_seek,
    waterfall,
    honest_reading: { clears_any: clearsAny, binding_lever_label: binding?.label ?? '', points },
    meta: { levers: levers.map((l) => l.id), note: noakResult ? '' : 'no NOAK scenario' },
  }
}

// ---------------------------------------------------------------------------
// formatting helpers (display only)
// ---------------------------------------------------------------------------
function fmtM(gbp: number): string { return (Math.round((gbp / 1e6) * 10) / 10).toString() }
function fmtVal(v: number, unit: string): string {
  if (unit === '£') return `£${fmtM(v)}M`
  if (unit === '%') return `${Math.round(v * 10) / 10}%`
  return `${Math.round(v * 100) / 100} ${unit}`.trim()
}

// ---------------------------------------------------------------------------
// SELF-TEST — must reproduce the SAF dossier base (£8.62/kg, NPV −£75.3M).
// ---------------------------------------------------------------------------
function safTestModel(): ScenarioModel {
  return {
    output_unit_label: 'kg SAF', output_unit_short: 'kg',
    levelised_unit_label: '£/t SAF', levelised_display_factor: 1000,
    capex_base_gbp: 25_000_000, bom_floor_gbp: 10_301_070,
    hours_base: 8000, hours_design_max: 8000,
    annual_yield_at_base_hours: 1_000_000,
    output_price_base: 2.2, output_price_unit: '£/kg',
    discount_rate_pct_base: 10, project_life_years: 20,
    price_inflation_pct: 2, operational_inflation_pct: 2, tax_rate_pct: 25,
    fixed_capex_fraction: 0.04, fixed_non_capex_gbp: 0,
    variable_costs: [
      { id: 'h2', label: 'Hydrogen', price_base: 5.0, price_unit: '£/kg', qty_per_year_at_base_hours: 140 * 8000 },
      { id: 'elec', label: 'Electricity', price_base: 0.10, price_unit: '£/kWh', qty_per_year_at_base_hours: 507 * 8000 },
      { id: 'co2', label: 'CO2 feedstock', price_base: 45, price_unit: '£/t', qty_per_year_at_base_hours: 1 * 8000 },
    ],
  }
}

function selfTest(): void {
  const m = safTestModel()
  const baseEcon = resolve(m, baseState(m))
  const d = dcf(baseEcon)
  const okLev = Math.abs(d.levelised_per_unit_gbp - 8.62) <= 0.05
  const okNpv = Math.abs(d.npv_gbp - -75_322_752) / 75_322_752 <= 0.02
  console.log('opex/yr     =', Math.round(baseEcon.opex_gbp_year), '(expect 7,365,600)')
  console.log('levelised   =', d.levelised_per_unit_gbp, '£/kg  (expect 8.62)', okLev ? 'PASS' : 'FAIL')
  console.log('NPV         =', d.npv_gbp, 'GBP  (expect ~ -75,322,752)', okNpv ? 'PASS' : 'FAIL')
  console.log('IRR         =', d.irr_pct, '  payback =', d.payback_years)
  const bands: Bands = {
    capex: { pessimistic: 30_000_000, optimistic: 18_000_000 },
    output_price: { pessimistic: 1.4, optimistic: 2.6 },
    hours: { pessimistic: 6000, optimistic: 8000 },
    discount_rate_pct: { pessimistic: 12, optimistic: 8 },
    variable_prices: { h2: { pessimistic: 6, optimistic: 2 }, elec: { pessimistic: 0.14, optimistic: 0.07 }, co2: { pessimistic: 60, optimistic: 30 } },
  }
  const sp = computeScenarioPlanning(m, bands, { irr_hurdle_pct: 12 })
  console.log('\nScenarios:')
  for (const s of [sp.base, ...sp.scenarios]) console.log(`  ${s.label.padEnd(26)} levelised £${s.levelised_display}/t  NPV £${fmtM(s.npv_gbp)}M  clears=${s.clears_hurdle}`)
  console.log('\nTornado (by NPV swing):')
  for (const t of sp.tornado) console.log(`  ${t.label.padEnd(28)} Δ£${fmtM(t.delta_npv_abs)}M  [${t.pessimistic_value} … ${t.optimistic_value} ${t.unit}]`)
  console.log('\nGoal-seek (from NOAK, to NPV>=0):')
  for (const g of sp.goal_seek) console.log(`  ${g.label.padEnd(28)} ${g.feasible ? 'need ' + fmtVal(g.required_value ?? 0, g.unit) : 'INFEASIBLE (' + g.reason + ')'}`)
  console.log('\nHonest reading:')
  for (const p of sp.honest_reading.points) console.log('  •', p)
  if (!okLev || !okNpv) { console.error('\nSELF-TEST FAILED'); process.exit(1) }
  console.log('\nSELF-TEST PASSED')
}

if (process.argv[1] && process.argv[1].endsWith('scenario-planning.ts') && process.argv.includes('--selftest')) {
  selfTest()
}
