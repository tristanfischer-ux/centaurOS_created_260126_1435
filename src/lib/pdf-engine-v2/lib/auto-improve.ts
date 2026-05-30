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
