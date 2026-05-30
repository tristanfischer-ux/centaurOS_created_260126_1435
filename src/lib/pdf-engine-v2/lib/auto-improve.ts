/**
 * src/lib/pdf-engine-v2/lib/auto-improve.ts
 *
 * AUTO-IMPROVE LOOP — Phase 1 (Tristan decision 2026-05-30: "also auto-improve
 * the design"). Spec: AUTO-IMPROVE-SPEC.md.
 *
 * Phase 1 is SAFE + deterministic: it does NOT mutate the design. It reads where
 * the design misses the brief (the gate-17 compliance FAIL set + the cost stack)
 * and computes the specific, quantified levers that would close each miss — the
 * structured "improvement plan" a later phase will actually apply + re-evaluate.
 * Strictly more than today's prose: every lever carries a magnitude + trade-off.
 *
 * The engine already DETECTS misses (closures / brief_target_feasibility / the
 * compliance rows); this turns "accepted shortfall" into "here is the fix and
 * what it costs". Phase 2 auto-applies the low-risk material-reprice lever (L1);
 * Phase 3 runs the downrate/scale convergence loop (council-gated).
 */

import { checkMacroMaterialRate, deriveMacroMaterialRateGbpPerKg } from './material-prices'

export interface ImprovementMiss {
  /** Canonical metric key (or 'unit_cost' / 'max_mass'). */
  key: string
  label: string
  brief: number
  achieved: number | null
  unit: string
  /** 'over' = design exceeds a ceiling (cost/mass); 'under' = below a floor (performance). */
  direction: 'over' | 'under'
  /** design/brief for ceilings (>1 = over); brief/achieved for floors (>1 = short). */
  ratio: number
  hard: boolean
}

export interface ImprovementLever {
  id: string                       // 'L1_reprice' | 'L2_downrate' | 'L4_scale_up'
  targets: string                  // miss key it addresses
  action: string                   // "Downrate rated power to 2.3 MW"
  trade_off: string                // "loses ~62% rated power vs the 6 MW target"
  risk: 'low' | 'med'
}

export interface ImprovementPlan {
  misses: ImprovementMiss[]
  levers: ImprovementLever[]
  verdict: 'within_brief' | 'improvable' | 'infeasible_at_envelope'
  summary: string
}

export interface ImprovementInput {
  /** Design ex-works (OEM transfer) cost — the figure the brief's unit cost ceiling compares against. */
  exWorksCostGbp: number | null
  /** Brief unit_cost_ceiling.value (ex-works). */
  costCeilingGbp: number | null
  /** Design gross mass (kg) + brief max_mass_kg, if the brief caps mass. */
  designMassKg?: number | null
  massCapKg?: number | null
  /** The size-driving (category='scale') brief metric, e.g. rated_power 6 MW. The
   *  cost/performance levers scale THIS. */
  scaleMetric?: { key: string; label: string; value: number; unit: string } | null
  /** Performance floors the design fell short of (achieved < brief). */
  performanceMisses?: Array<{ key: string; label: string; brief: number; achieved: number; unit: string }>
  /** Whether any BoM macro is priced ABOVE its grounded commodity band (L1 has headroom). */
  hasOverpricedMaterialMacro?: boolean
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1000) return n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
  if (abs >= 100) return n.toFixed(0)
  if (abs >= 10) return n.toFixed(1)
  return n.toFixed(2)
}

function fmtGbp(n: number): string {
  if (n >= 1e6) return `£${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `£${(n / 1e3).toFixed(0)}k`
  return `£${n.toFixed(0)}`
}

/**
 * Compute the (non-mutating) improvement plan for a design vs its brief.
 * Deterministic: same inputs → same plan.
 */
export function computeImprovementPlan(input: ImprovementInput): ImprovementPlan {
  const misses: ImprovementMiss[] = []
  const levers: ImprovementLever[] = []

  // ── Cost ceiling (HARD) ────────────────────────────────────────────────────
  let costRatio = 1
  if (
    typeof input.exWorksCostGbp === 'number' && input.exWorksCostGbp > 0 &&
    typeof input.costCeilingGbp === 'number' && input.costCeilingGbp > 0
  ) {
    costRatio = input.exWorksCostGbp / input.costCeilingGbp
    if (costRatio > 1.10) {
      misses.push({
        key: 'unit_cost', label: 'Unit cost (ex-works)', brief: input.costCeilingGbp,
        achieved: input.exWorksCostGbp, unit: 'GBP', direction: 'over', ratio: costRatio, hard: true,
      })
      // L1 — reprice over-priced material macros to grounded commodity rates (no design change).
      if (input.hasOverpricedMaterialMacro) {
        levers.push({
          id: 'L1_reprice', targets: 'unit_cost',
          action: 'Re-price material-dominated parts to grounded commodity rates (steel/copper/aluminium DB)',
          trade_off: 'no design change — only corrects parts priced above market; closes part of the gap',
          risk: 'low',
        })
      }
      // L2 — downrate the size-driving metric to fit the ceiling.
      if (input.scaleMetric && input.scaleMetric.value > 0) {
        const factor = 1 / costRatio
        const downrated = input.scaleMetric.value * factor
        levers.push({
          id: 'L2_downrate', targets: 'unit_cost',
          action: `Downrate ${input.scaleMetric.label.toLowerCase()} to ~${fmtNum(downrated)} ${input.scaleMetric.unit} to meet the ${fmtGbp(input.costCeilingGbp)} ceiling`,
          trade_off: `loses ~${Math.round((1 - factor) * 100)}% ${input.scaleMetric.label.toLowerCase()} vs the ${fmtNum(input.scaleMetric.value)} ${input.scaleMetric.unit} target`,
          risk: 'med',
        })
      }
    }
  }

  // ── Mass cap (HARD) ─────────────────────────────────────────────────────────
  if (
    typeof input.designMassKg === 'number' && input.designMassKg > 0 &&
    typeof input.massCapKg === 'number' && input.massCapKg > 0 &&
    input.designMassKg > input.massCapKg * 1.05
  ) {
    misses.push({
      key: 'max_mass', label: 'Gross mass', brief: input.massCapKg, achieved: input.designMassKg,
      unit: 'kg', direction: 'over', ratio: input.designMassKg / input.massCapKg, hard: true,
    })
    levers.push({
      id: 'L3_lighten', targets: 'max_mass',
      action: 'Substitute lighter-density materials in the load-bearing modules (aluminium for steel) or split across units',
      trade_off: 'raises cost or footprint; trades mass for CAPEX',
      risk: 'med',
    })
  }

  // ── Performance floors (achieved < brief) ───────────────────────────────────
  for (const pm of input.performanceMisses ?? []) {
    if (!(pm.brief > 0) || !(pm.achieved >= 0) || pm.achieved >= pm.brief * 0.95) continue
    const ratio = pm.brief / Math.max(pm.achieved, 1e-9)
    misses.push({
      key: pm.key, label: pm.label, brief: pm.brief, achieved: pm.achieved,
      unit: pm.unit, direction: 'under', ratio, hard: false,
    })
    // L4 — scale up the size-driving metric (tension with L2 downrate).
    if (input.scaleMetric && input.scaleMetric.value > 0) {
      levers.push({
        id: 'L4_scale_up', targets: pm.key,
        action: `Increase ${input.scaleMetric.label.toLowerCase()} (or upgrade the converting subsystem) to lift ${pm.label.toLowerCase()} from ${fmtNum(pm.achieved)} to ${fmtNum(pm.brief)} ${pm.unit}`,
        trade_off: `raises cost — pulls against the cost ceiling; the loop balances downrate vs scale-up`,
        risk: 'med',
      })
    }
  }

  // ── Verdict ─────────────────────────────────────────────────────────────────
  let verdict: ImprovementPlan['verdict']
  if (misses.length === 0) verdict = 'within_brief'
  else if (costRatio > 2.0 && (input.performanceMisses ?? []).length > 0) verdict = 'infeasible_at_envelope'
  else verdict = 'improvable'

  const summary =
    verdict === 'within_brief'
      ? 'The design meets every hard brief constraint; no adjustment required.'
      : verdict === 'infeasible_at_envelope'
        ? `The brief is over-constrained at this envelope: cost is ${costRatio.toFixed(1)}× the ceiling AND performance falls short — meeting one worsens the other. The design sits at the closest feasible Pareto point; closing the gap needs a brief relaxation (cost ceiling, target, or envelope).`
        : `${misses.length} brief constraint(s) missed. ${levers.length} lever(s) identified; the lowest-risk is ${levers[0]?.id === 'L1_reprice' ? 'grounding over-priced parts in commodity rates (no design change)' : 'a measured downrate to fit the cost ceiling'}.`

  return { misses, levers, verdict, summary }
}

// ─── Phase 2 — lever L1: material re-price (the first MUTATION lever) ─────────
export interface MacroLike {
  word_name?: string
  unit_price_gbp?: number
  dimension_basis?: string
  dimension_value?: number
  total_gbp?: number
  source_detail?: string
  material?: string
}

export interface RepriceChange {
  word_name: string
  material: string
  from_gbp_per_kg: number
  to_gbp_per_kg: number
  saving_gbp: number
}

export interface RepriceResult {
  macros: MacroLike[]            // re-priced COPY (input is never mutated)
  changes: RepriceChange[]
  total_saving_gbp: number
}

/**
 * AUTO-IMPROVE lever L1 (Phase 2) — re-price every material-dominated macro priced
 * ABOVE its grounded commodity band down to the grounded mid rate
 * (deriveMacroMaterialRateGbpPerKg). PURE: returns a re-priced copy + the changes;
 * never mutates the input. Lowest-risk lever — it only corrects parts priced above
 * market, so it can only make the BoM more honest (never raises a price, never
 * touches an integrated assembly). total_gbp is rescaled by the same factor so the
 * macro's line total stays consistent. Deterministic.
 */
export function applyMaterialRepriceLever(macros: MacroLike[]): RepriceResult {
  const changes: RepriceChange[] = []
  let totalSaving = 0
  const out: MacroLike[] = (macros ?? []).map((m) => {
    const verdict = checkMacroMaterialRate({
      word_name: m?.word_name, unit_price_gbp: m?.unit_price_gbp,
      dimension_basis: m?.dimension_basis, source_detail: m?.source_detail, material: m?.material,
    })
    if (!verdict || verdict.direction !== 'over') return { ...m }
    const grounded = deriveMacroMaterialRateGbpPerKg(String(m?.word_name ?? ''), m?.source_detail)
    if (!grounded || !(grounded.rate_gbp_per_kg > 0)) return { ...m }
    const from = Number(m?.unit_price_gbp)
    const to = grounded.rate_gbp_per_kg
    if (!(to < from)) return { ...m } // only ever reduce
    const factor = to / from
    const oldTotal = Number(m?.total_gbp)
    const newTotal = Number.isFinite(oldTotal) ? oldTotal * factor : oldTotal
    const saving = Number.isFinite(oldTotal) ? oldTotal - newTotal : 0
    totalSaving += saving
    changes.push({ word_name: String(m?.word_name ?? ''), material: grounded.material, from_gbp_per_kg: from, to_gbp_per_kg: to, saving_gbp: saving })
    return { ...m, unit_price_gbp: to, total_gbp: Number.isFinite(oldTotal) ? newTotal : m?.total_gbp }
  })
  return { macros: out, changes, total_saving_gbp: totalSaving }
}

export interface AutoImproveOutcome {
  applied: string[]                 // lever ids actually applied
  reprice: RepriceResult | null
  cost_saving_gbp: number
  notes: string[]                   // human-readable record of each change (the "design evolution")
}

/**
 * Apply the SAFE auto-improve levers (Phase 2) to a design state. Currently L1
 * only — the material re-price, the lowest-risk lever that can only make the BoM
 * more honest. MUTATES state.engineeringContract.macro_assembly_prices to the
 * re-priced macros and records state.autoImproveLog (the transparent "design
 * evolution"). Phase 3 (downrate/scale) is NOT applied here — it changes the
 * design and needs council validation. Idempotent: re-running finds nothing left
 * over-priced, so it no-ops. Returns the outcome.
 */
export function applyAutoImproveToState(state: any): AutoImproveOutcome {
  const ec = state?.engineeringContract
  const macros: MacroLike[] = Array.isArray(ec?.macro_assembly_prices) ? ec.macro_assembly_prices : []
  const applied: string[] = []
  const notes: string[] = []
  let reprice: RepriceResult | null = null
  if (macros.length > 0) {
    reprice = applyMaterialRepriceLever(macros)
    if (reprice.changes.length > 0) {
      ec.macro_assembly_prices = reprice.macros
      applied.push('L1_reprice')
      for (const c of reprice.changes) {
        notes.push(
          `L1: re-priced ${c.word_name} £${c.from_gbp_per_kg.toFixed(0)}/kg -> £${c.to_gbp_per_kg.toFixed(1)}/kg ` +
          `(${c.material} commodity rate), saving £${Math.round(c.saving_gbp).toLocaleString('en-GB')}`,
        )
      }
    }
  }
  const outcome: AutoImproveOutcome = { applied, reprice, cost_saving_gbp: reprice?.total_saving_gbp ?? 0, notes }
  if (state && typeof state === 'object') state.autoImproveLog = outcome
  return outcome
}

// ─── Phase 3 — convergence point (the design-changing loop's TARGET) ─────────
export interface ConvergedPoint {
  feasible: boolean
  size_metric_key: string | null
  size_metric_label: string | null
  current_size: number | null
  unit: string
  cost_feasible_size: number | null        // largest size within the cost ceiling
  performance_feasible_size: number | null // smallest size that clears every perf floor
  converged_size: number | null            // the size to adopt (null when infeasible)
  verdict: string
  assumption: string
}

/**
 * AUTO-IMPROVE Phase 3 — compute the single CONVERGED size that meets BOTH the
 * cost ceiling AND every performance floor (or prove no such size exists). The
 * size-driving metric (rated power / capacity / canopy area) scales cost up and
 * performance up together; the feasible window is [size that hits the worst perf
 * floor, size the cost ceiling allows]. If that window is non-empty → converge to
 * its lower edge (smallest size that clears performance, within budget). If empty
 * → infeasible: report the Pareto gap.
 *
 * ASSUMPTION (deliberately conservative + flagged): cost and the binding
 * performance metric scale ~LINEARLY with the size metric. True for energy /
 * capacity / yield / throughput classes (BESS, VF). NOT true for inverse
 * couplings (wind capacity factor falls as specific power rises, so downrating
 * helps BOTH) — for those the linear model still reaches the correct
 * INFEASIBLE/feasible verdict here, but the convergence loop must NOT apply a
 * naive scale; defer to the class physics. Pure + deterministic. Phase 3 APPLY
 * (re-run the physics at converged_size) is the council-gated integration.
 */
export function computeConvergedDesignPoint(input: ImprovementInput): ConvergedPoint {
  const sm = input.scaleMetric
  const assumption =
    'Assumes cost + performance scale ~linearly with the size metric (true for energy/capacity/yield classes; ' +
    'inverse couplings like wind capacity-factor-vs-specific-power need class physics — the verdict holds, the naive scale does not).'
  if (!sm || !(sm.value > 0)) {
    return { feasible: false, size_metric_key: null, size_metric_label: null, current_size: null, unit: '', cost_feasible_size: null, performance_feasible_size: null, converged_size: null, verdict: 'No size-driving metric — cannot compute a convergence point.', assumption }
  }
  const current = sm.value
  let costFeasible = current
  if (input.exWorksCostGbp && input.exWorksCostGbp > 0 && input.costCeilingGbp && input.costCeilingGbp > 0) {
    costFeasible = current * (input.costCeilingGbp / input.exWorksCostGbp)
  }
  let perfFeasible = current
  for (const pm of input.performanceMisses ?? []) {
    if (pm.brief > 0 && pm.achieved > 0 && pm.achieved < pm.brief) {
      perfFeasible = Math.max(perfFeasible, current * (pm.brief / pm.achieved))
    }
  }
  const feasible = costFeasible >= perfFeasible * 0.99
  const converged = feasible ? perfFeasible : null
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
  const verdict = feasible
    ? `Feasible: at ~${fmt(converged as number)} ${sm.unit} ${sm.label.toLowerCase()} the design clears every performance floor AND stays within the cost ceiling.`
    : `Infeasible at this envelope: the cost ceiling allows at most ~${fmt(costFeasible)} ${sm.unit} ${sm.label.toLowerCase()}, but performance needs at least ~${fmt(perfFeasible)} ${sm.unit} — a ${(perfFeasible / Math.max(costFeasible, 1e-9)).toFixed(1)}x gap. Closing it requires relaxing the cost ceiling or the performance target.`
  return {
    feasible, size_metric_key: sm.key, size_metric_label: sm.label, current_size: current, unit: sm.unit,
    cost_feasible_size: costFeasible, performance_feasible_size: perfFeasible, converged_size: converged, verdict, assumption,
  }
}
