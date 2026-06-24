/**
 * sweet-spot.ts — brief-objective RECONCILIATION + cost/output sweet-spot finder (ForgeOS
 * Phase 1, 2026-06-24). Tristan: a brief is a WISH-LIST, not a fixed spec. It can ask for
 * mutually-incompatible things (a million tonnes a year for £1). The engine must reconcile:
 * decide whether the higher priority is COST or OUTPUT, or find the balanced SWEET SPOT — the
 * design that is as cheap as possible to meet the price point and as productive as possible to
 * meet the output point. When the two genuinely conflict, the engine cannot invent the answer;
 * it surfaces the trade-off and follows the brief's stated PRIMARY OBJECTIVE.
 *
 * The engineering insight that makes this CHEAP (no N full re-runs): plant capex follows a
 * well-known capacity-scaling law — Capex(Q) ≈ Capex_ref · (Q/Q_ref)^n with n≈0.6-0.7 (the
 * "six-tenths rule"; CEPCI/capacity-factoring already underpins the cost basis). So the entire
 * cost-vs-output frontier is computed ANALYTICALLY from ONE reference design. £/unit therefore
 * FALLS monotonically with scale (economies of scale, n<1) — meaning there is no intrinsic
 * curve "knee": the sweet spot is set by the CONSTRAINTS (the output floor + the cost ceiling)
 * and the stated objective. This module is pure + deterministic + fully testable.
 */

export type PrimaryObjective = 'cost_min' | 'output_max' | 'balanced'
export type SweetSpotVerdict = 'compatible' | 'incompatible' | 'unconstrained'

export interface SweetSpotInput {
  objective: PrimaryObjective
  output_target: number              // the brief's wanted output (in output units, e.g. t/yr, kW)
  output_floor: number | null        // HARD minimum acceptable output (default: the target)
  cost_ceiling_gbp: number | null    // HARD total-capex ceiling (null = no cost constraint)
  ref_output: number                 // the reference design's output (usually = output_target)
  ref_capex_gbp: number              // the reference design's total capex at ref_output
  scaling_exponent?: number          // six-tenths law exponent (default 0.65)
  output_unit_label?: string         // for the human statement (e.g. 't/yr')
}

export interface FrontierPoint { output: number; capex_gbp: number; cost_per_unit: number }

export interface SweetSpotResult {
  verdict: SweetSpotVerdict
  objective: PrimaryObjective
  recommended_output: number
  recommended_capex_gbp: number
  recommended_cost_per_unit: number
  rescale_factor: number             // recommended_output / output_target (1.0 = build as briefed)
  meets_output_floor: boolean
  within_cost_ceiling: boolean
  trade_off_statement: string        // human-readable reconciliation
  frontier: FrontierPoint[]          // cost-vs-output curve for the dossier chart
  notes: string[]
}

const DEFAULT_N = 0.65

/** Capex at output Q from the reference point via the six-tenths capacity law. */
export function capexAt(Q: number, refOutput: number, refCapex: number, n: number): number {
  if (refOutput <= 0 || Q <= 0) return refCapex
  return refCapex * Math.pow(Q / refOutput, n)
}

/** The largest output whose capex still fits the ceiling (inverse of the scaling law). */
function maxOutputWithinBudget(ceiling: number, refOutput: number, refCapex: number, n: number): number {
  if (refCapex <= 0) return refOutput
  return refOutput * Math.pow(ceiling / refCapex, 1 / n)
}

function _fmtGbp(v: number): string {
  if (v >= 1e6) return `£${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `£${(v / 1e3).toFixed(0)}k`
  return `£${Math.round(v)}`
}
function _fmtQ(v: number, unit?: string): string {
  const s = v >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toPrecision(3)
  return unit ? `${s} ${unit}` : s
}

/**
 * Reconcile the brief's objective against the cost/output reality and return the recommended
 * operating point + the trade-off statement + the frontier. Pure.
 */
export function reconcile(input: SweetSpotInput): SweetSpotResult {
  const n = input.scaling_exponent ?? DEFAULT_N
  const unit = input.output_unit_label
  const target = input.output_target
  const hardFloor = input.output_floor              // HARD minimum (null = none; the target is only a wish)
  const ceiling = input.cost_ceiling_gbp
  const refO = input.ref_output
  const refC = input.ref_capex_gbp
  const notes: string[] = []

  const cap = (Q: number) => capexAt(Q, refO, refC, n)
  const cpu = (Q: number) => (Q > 0 ? cap(Q) / Q : Infinity)
  // balanced/cost_min may trade output DOWN to this lower bound (a hard floor if one is
  // stated, else 20% of the target — below which the plant stops being worth building).
  const loEx = hardFloor ?? 0.2 * target

  // ── frontier sample (for the dossier chart): 0.25×..4× the target, log-spaced ──
  const frontier: FrontierPoint[] = []
  for (let i = 0; i <= 12; i++) {
    const Q = target * Math.pow(4 / 0.25, i / 12) * 0.25
    frontier.push({ output: Q, capex_gbp: Math.round(cap(Q)), cost_per_unit: cpu(Q) })
  }

  // ── feasibility / tension ──
  const targetCapex = cap(target)
  const qMaxBudget = ceiling != null ? maxOutputWithinBudget(ceiling, refO, refC, n) : Infinity
  const unconstrained = ceiling == null
  // TENSION (verdict 'incompatible') = the briefed TARGET cannot be met within the ceiling.
  const tension = ceiling != null && targetCapex > ceiling + 1e-6
  // a stated HARD FLOOR that can't be afforded is the genuinely-impossible case (flagged).
  const hardFloorInfeasible = ceiling != null && hardFloor != null && cap(hardFloor) > ceiling + 1e-6
  const floorCapex = hardFloor != null ? cap(hardFloor) : targetCapex

  let verdict: SweetSpotVerdict = unconstrained ? 'unconstrained' : (tension ? 'incompatible' : 'compatible')

  // ── recommended operating point per objective ──
  let recO: number
  if (tension) {
    // target unaffordable — reconcile by the stated PRIORITY:
    if (input.objective === 'output_max') {
      recO = target             // hit the briefed output, accept going over budget
    } else if (input.objective === 'cost_min') {
      // hold the budget, accept the output shortfall — but never below a stated hard floor
      recO = hardFloor != null ? Math.max(hardFloor, qMaxBudget) : qMaxBudget
    } else {
      // balanced: the frontier point CLOSEST (normalised) to the ideal corner
      // (output_target, cost_ceiling) — the genuine compromise. Explores [loEx, target].
      recO = closestToIdeal(target, ceiling!, refO, refC, n, loEx)
    }
  } else if (unconstrained) {
    // no cost constraint → build what's asked (don't grow infinitely on output_max with no budget).
    recO = input.objective === 'cost_min' ? floor : target
  } else {
    // compatible: the floor fits the budget. Objective shapes WHERE in the feasible band we sit.
    if (input.objective === 'cost_min') {
      recO = floor                                   // cheapest design that still meets the need
    } else if (input.objective === 'output_max') {
      recO = Math.max(target, qMaxBudget)            // spend the budget, maximise output
    } else {
      recO = Math.min(target, qMaxBudget)            // balanced: build the target (it fits the budget)
    }
  }

  const recCapex = cap(recO)
  const recCpu = cpu(recO)
  const meetsFloor = hardFloor == null || recO >= hardFloor - 1e-6
  const withinCeiling = ceiling == null || recCapex <= ceiling + 1e-6
  const rescale = target > 0 ? recO / target : 1

  // ── human trade-off statement ──
  const objLabel = { cost_min: 'COST (spend the least to meet the output)',
                     output_max: 'OUTPUT (deliver the most within budget)',
                     balanced: 'BALANCED (the best cost/output compromise)' }[input.objective]
  let stmt: string
  if (unconstrained) {
    stmt = `No cost ceiling stated, so no cost/output tension. Building the briefed ${_fmtQ(target, unit)} at ${_fmtGbp(targetCapex)} (${_fmtGbp(targetCapex / target)}/${unit ?? 'unit'}).`
  } else if (!tension) {
    stmt = `The brief is internally consistent: ${_fmtQ(target, unit)} fits within the ${_fmtGbp(ceiling!)} ceiling. ` +
      `Recommended operating point: ${_fmtQ(recO, unit)} at ${_fmtGbp(recCapex)} (${_fmtGbp(recCpu)}/${unit ?? 'unit'}). Objective: ${objLabel}.`
  } else {
    // TENSION: the briefed target costs more than the ceiling. State the conflict + the reconciliation.
    const lead = `⚠ The brief asks for ${_fmtQ(target, unit)} AND a ${_fmtGbp(ceiling!)} ceiling — these CANNOT both be met: ${_fmtQ(target, unit)} costs ${_fmtGbp(targetCapex)} (${(targetCapex / ceiling!).toFixed(1)}× the ceiling).`
    const hardNote = hardFloorInfeasible
      ? ` Even your hard minimum ${_fmtQ(hardFloor!, unit)} (${_fmtGbp(floorCapex)}) exceeds the budget — this brief is genuinely infeasible.`
      : ''
    stmt = `${lead}${hardNote} Reconciled to your stated priority — ${objLabel}: ` +
      (input.objective === 'output_max'
        ? `deliver ${_fmtQ(recO, unit)} and accept ${_fmtGbp(recCapex)} (${(recCapex / ceiling!).toFixed(1)}× over budget).`
        : input.objective === 'cost_min'
          ? `hold ${_fmtGbp(ceiling!)} and accept the lower ${_fmtQ(recO, unit)} (a ${((1 - recO / target) * 100).toFixed(0)}% output shortfall).`
          : `the sweet spot is ${_fmtQ(recO, unit)} at ${_fmtGbp(recCapex)} (${_fmtGbp(recCpu)}/${unit ?? 'unit'}) — the best compromise between the two, closest to your ideal of full output at full budget.`)
  }
  if (Math.abs(rescale - 1) > 0.01) notes.push(`recommended scale is ${rescale.toFixed(2)}× the briefed output — regenerate the dossier at this scale to realise it`)
  if (tension) notes.push('briefed target exceeds the cost ceiling — resolved by the stated primary_objective')
  if (hardFloorInfeasible) notes.push('a stated HARD output floor cannot be met within the ceiling — brief is genuinely infeasible')

  return {
    verdict, objective: input.objective,
    recommended_output: recO, recommended_capex_gbp: Math.round(recCapex),
    recommended_cost_per_unit: recCpu, rescale_factor: rescale,
    meets_output_floor: meetsFloor, within_cost_ceiling: withinCeiling,
    trade_off_statement: stmt, frontier, notes,
  }
}

/** balanced sweet spot: the output in [lowerBound, target] minimising normalised distance to
 *  the ideal corner (full output `target`, full budget `ceiling`). The genuine compromise. */
function closestToIdeal(target: number, ceiling: number, refO: number, refC: number, n: number, lowerBound: number): number {
  let best = lowerBound, bestD = Infinity
  for (let i = 0; i <= 400; i++) {
    const Q = lowerBound + (target - lowerBound) * (i / 400)
    if (Q <= 0) continue
    const c = capexAt(Q, refO, refC, n)
    const d = Math.hypot(Q / target - 1, c / ceiling - 1)   // normalised distance to (target, ceiling)
    if (d < bestD) { bestD = d; best = Q }
  }
  return best
}

// ── selftest ────────────────────────────────────────────────────────────────────────────
function _selftest(): void {
  const ref = { ref_output: 1000, ref_capex_gbp: 5_000_000, scaling_exponent: 0.65, output_unit_label: 't/yr' }
  const approx = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))

  // 1. COMPATIBLE — target fits the ceiling → build the target.
  const c1 = reconcile({ objective: 'balanced', output_target: 1000, output_floor: null, cost_ceiling_gbp: 6_000_000, ...ref })
  if (c1.verdict !== 'compatible') throw new Error('1: should be compatible')
  if (!approx(c1.recommended_output, 1000)) throw new Error(`1: should build target, got ${c1.recommended_output}`)

  // 2. TENSION — want 1000 t/yr but only £1 (the million-tonnes-for-£1 case), HARD floor 1000.
  const c2 = reconcile({ objective: 'balanced', output_target: 1000, output_floor: 1000, cost_ceiling_gbp: 1, ...ref })
  if (c2.verdict !== 'incompatible') throw new Error('2: should be incompatible')
  if (!c2.trade_off_statement.includes('CANNOT both be met')) throw new Error('2: must state the conflict')
  if (!c2.trade_off_statement.includes('genuinely infeasible')) throw new Error('2: hard-floor-infeasible must be called out')

  // 3. TENSION + cost_min, NO hard floor → drop to the largest output within budget (holds ceiling).
  const c3 = reconcile({ objective: 'cost_min', output_target: 1000, output_floor: null, cost_ceiling_gbp: 1_000_000, ...ref })
  if (c3.verdict !== 'incompatible') throw new Error('3: target 1000 costs 5M > 1M → tension')
  if (c3.recommended_output >= 1000) throw new Error('3: cost_min must accept an output shortfall')
  if (c3.recommended_capex_gbp > 1_000_000 + 1) throw new Error(`3: cost_min must hold the ceiling, got ${c3.recommended_capex_gbp}`)

  // 4. TENSION + output_max → hit the target output, go over budget.
  const c4 = reconcile({ objective: 'output_max', output_target: 1000, output_floor: null, cost_ceiling_gbp: 1_000_000, ...ref })
  if (c4.recommended_output < 1000) throw new Error('4: output_max must deliver the target output')
  if (c4.within_cost_ceiling) throw new Error('4: output_max here must be over budget (honest)')

  // 4b. TENSION + balanced (NO hard floor) → a GENUINE middle: strictly between the cost-min and
  //     output-max answers (trades some output for some budget).
  const c4b = reconcile({ objective: 'balanced', output_target: 1000, output_floor: null, cost_ceiling_gbp: 2_000_000, ...ref })
  const qBudget = 1000 * Math.pow(2_000_000 / 5_000_000, 1 / 0.65)   // cost_min answer
  if (!(c4b.recommended_output > qBudget && c4b.recommended_output < 1000))
    throw new Error(`4b: balanced must be a middle point in (${qBudget.toFixed(0)}, 1000), got ${c4b.recommended_output.toFixed(0)}`)
  if (!c4b.trade_off_statement.includes('sweet spot')) throw new Error('4b: balanced must name the sweet spot')

  // 5. economies of scale: £/unit FALLS as output rises (n<1).
  if (!(c1.frontier[0].cost_per_unit > c1.frontier[c1.frontier.length - 1].cost_per_unit))
    throw new Error('5: £/unit must fall with scale')

  // 6. UNCONSTRAINED — no ceiling → build target, no tension.
  const c6 = reconcile({ objective: 'balanced', output_target: 1000, output_floor: null, cost_ceiling_gbp: null, ...ref })
  if (c6.verdict !== 'unconstrained') throw new Error('6: no ceiling → unconstrained')
  if (!approx(c6.recommended_output, 1000)) throw new Error('6: build the target')

  // 7. compatible + output_max with budget headroom → scale UP to spend the budget.
  const c7 = reconcile({ objective: 'output_max', output_target: 1000, output_floor: null, cost_ceiling_gbp: 10_000_000, ...ref })
  if (!(c7.recommended_output > 1000)) throw new Error('7: output_max with headroom must scale up')
  if (c7.recommended_capex_gbp > 10_000_000 + 1) throw new Error('7: must stay within the ceiling')

  console.log('sweet-spot selftest: OK (compatible / incompatible×3-objectives / scale-economies / unconstrained / output-max-headroom)')
}

if (require.main === module && process.argv.includes('--selftest')) _selftest()
