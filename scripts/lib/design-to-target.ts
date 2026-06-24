/**
 * design-to-target.ts — the DESIGN-TO-TARGET root-finder (ForgeOS Phase 1.5 / #47, 2026-06-24).
 *
 * Tristan's correction to the sweet-spot estimate: the six-tenths law only PICKS a target cheaply;
 * it is NOT accurate, because at a different scale the DESIGN is genuinely different. The accurate
 * answer is to RE-RUN the full design at the chosen scale, measure what it ACTUALLY costs, and LOOP
 * — adjusting the scale on REAL measured data — until the real design hits the cost goal. This is
 * the automated version of the manual RAS-£5M iteration (nudge productivity/scale until it lands
 * on £5M).
 *
 * THIS MODULE is the pure, deterministic, fully-testable CORE: the root-finder. Given the cost
 * GOAL and the (output, capex) points measured from REAL chain runs so far, it returns the next
 * output to try and whether we have converged. The expensive ORCHESTRATOR (which actually re-runs
 * the chain per round) calls this between runs — kept separate so the maths is testable without
 * burning a 20-minute chain run.
 *
 * The maths: plant capex vs output is ~a power law (Capex = K·Q^n). So in LOG-LOG space it is a
 * straight line. With ONE real point we extrapolate along an assumed exponent; with TWO+ real
 * points we fit the line through the latest two (the REAL local exponent, not the 0.65 assumption)
 * and solve for the output where capex = goal. Secant root-finding on real data → converges in a
 * few rounds. Step is damped (clamped to [1/3×, 3×] of the latest output) so a noisy run can't send
 * the next round wild.
 */

export interface DesignPoint { output: number; capex_gbp: number }   // one MEASURED real design round

export interface ConvergeInput {
  goal_cost_gbp: number              // the cost the design must hit (ceiling for cost_min, sweet-spot capex for balanced)
  points: DesignPoint[]              // measured rounds so far, in order (>=1)
  tolerance?: number                 // fractional convergence band on cost (default 0.05 = ±5%)
  scaling_exponent?: number          // assumed exponent for the FIRST step (one point only); default 0.65
  max_step_factor?: number           // damping: next output within [1/f, f]× the latest (default 3)
  output_floor?: number | null       // never recommend below a stated hard floor
}

export interface ConvergeResult {
  converged: boolean
  next_output: number | null         // null when converged (best_point is the answer)
  best_point: DesignPoint            // the measured round closest to the goal so far
  cost_error_frac: number            // |best capex − goal| / goal
  local_exponent: number | null      // the REAL measured exponent (≥2 points), else null
  reason: string
}

const DEFAULT_N = 0.65

/** Output where a power law through the two points hits goalCost, via log-log linear solve. */
function secantOutput(a: DesignPoint, b: DesignPoint, goalCost: number): { out: number; n: number } | null {
  if (a.output <= 0 || b.output <= 0 || a.capex_gbp <= 0 || b.capex_gbp <= 0) return null
  if (Math.abs(Math.log(b.output) - Math.log(a.output)) < 1e-9) return null
  // log(capex) = log(K) + n·log(output)  → n from the two points
  const n = (Math.log(b.capex_gbp) - Math.log(a.capex_gbp)) / (Math.log(b.output) - Math.log(a.output))
  if (!isFinite(n) || Math.abs(n) < 1e-6) return null
  const logK = Math.log(b.capex_gbp) - n * Math.log(b.output)
  // solve log(goal) = logK + n·log(out)
  const out = Math.exp((Math.log(goalCost) - logK) / n)
  return isFinite(out) && out > 0 ? { out, n } : null
}

/**
 * Decide the next output to design at (or declare convergence) from the real rounds so far. Pure.
 */
export function nextOutputForCostGoal(input: ConvergeInput): ConvergeResult {
  const tol = input.tolerance ?? 0.05
  const stepF = input.max_step_factor ?? 3
  const goal = input.goal_cost_gbp
  const pts = input.points.filter((p) => p && p.output > 0 && p.capex_gbp > 0)
  if (pts.length === 0) {
    return { converged: false, next_output: null, best_point: { output: 0, capex_gbp: 0 }, cost_error_frac: Infinity, local_exponent: null, reason: 'no measured points yet' }
  }
  // best = the measured round closest to the goal cost
  const best = pts.reduce((m, p) => (Math.abs(p.capex_gbp - goal) < Math.abs(m.capex_gbp - goal) ? p : m), pts[0])
  const bestErr = Math.abs(best.capex_gbp - goal) / goal
  const latest = pts[pts.length - 1]

  // converged?
  if (bestErr <= tol) {
    return { converged: true, next_output: null, best_point: best, cost_error_frac: bestErr, local_exponent: null, reason: `converged: best round £${Math.round(best.capex_gbp).toLocaleString()} within ${(tol * 100).toFixed(0)}% of goal £${Math.round(goal).toLocaleString()}` }
  }

  // estimate the next output
  let next: number
  let localN: number | null = null
  let how: string
  if (pts.length >= 2) {
    // secant on the REAL local exponent through the last two distinct-output points
    let a = pts[pts.length - 2], b = latest
    if (Math.abs(Math.log(b.output) - Math.log(a.output)) < 1e-9) {
      // last two share an output (noise) — fall back to the most distinct earlier pair
      const distinct = [...pts].reverse().find((p) => Math.abs(Math.log(p.output) - Math.log(latest.output)) > 1e-6)
      if (distinct) a = distinct
    }
    const sol = secantOutput(a, b, goal)
    if (sol) { next = sol.out; localN = sol.n; how = `secant on real exponent n=${sol.n.toFixed(2)}` }
    else { next = latest.output * Math.pow(goal / latest.capex_gbp, 1 / (input.scaling_exponent ?? DEFAULT_N)); how = 'power-law fallback (degenerate pair)' }
  } else {
    // one point → extrapolate along the assumed exponent
    const n = input.scaling_exponent ?? DEFAULT_N
    next = latest.output * Math.pow(goal / latest.capex_gbp, 1 / n)
    how = `power-law from 1 point (assumed n=${n})`
  }

  // damp the step so a noisy round can't fling the next output wild
  const lo = latest.output / stepF, hi = latest.output * stepF
  const clamped = Math.min(hi, Math.max(lo, next))
  let nextOut = clamped
  // respect a stated hard floor
  if (input.output_floor != null && nextOut < input.output_floor) nextOut = input.output_floor

  return {
    converged: false, next_output: nextOut, best_point: best, cost_error_frac: bestErr, local_exponent: localN,
    reason: `${how} → next output ${nextOut.toPrecision(4)} (was ${latest.output.toPrecision(4)} @ £${Math.round(latest.capex_gbp).toLocaleString()}; goal £${Math.round(goal).toLocaleString()})${clamped !== next ? ' [step damped]' : ''}`,
  }
}

// ── selftest — simulate a REAL power-law plant and prove the loop converges on real data ─────────
function _selftest(): void {
  // a synthetic "true" plant the orchestrator would measure: Capex = K·Q^0.72 (NOT the assumed 0.65,
  // so the loop must LEARN the real exponent from measured points). K chosen so Q=1000 → £8M.
  const trueN = 0.72, K = 8_000_000 / Math.pow(1000, trueN)
  const truePlant = (Q: number) => K * Math.pow(Q, trueN)
  const goal = 5_000_000   // the RAS-£5M case: find the output that costs exactly £5M.

  // drive the loop with REAL measured points, starting from the briefed 1000 (which costs £8M).
  const pts: DesignPoint[] = [{ output: 1000, capex_gbp: truePlant(1000) }]
  let rounds = 0, conv = false, last: ConvergeResult | null = null
  while (rounds < 6) {
    last = nextOutputForCostGoal({ goal_cost_gbp: goal, points: pts })
    if (last.converged) { conv = true; break }
    const Q = last.next_output!
    pts.push({ output: Q, capex_gbp: truePlant(Q) })   // "re-run the chain" → measure the real cost
    rounds++
  }
  if (!conv) throw new Error(`did not converge in ${rounds} rounds; best err ${last?.cost_error_frac}`)
  if (rounds > 4) throw new Error(`took ${rounds} rounds (>4) — too slow`)
  const ans = last!.best_point
  if (Math.abs(ans.capex_gbp - goal) / goal > 0.05) throw new Error(`final cost £${Math.round(ans.capex_gbp)} not within 5% of £5M`)
  // the analytically-correct output for £5M on the TRUE plant:
  const trueAns = Math.pow(goal / K, 1 / trueN)
  // a 5% COST band maps to a ~(0.05/n)=6.9% OUTPUT band on this power law (dQ/Q=(1/n)·dC/C) —
  // the loop converges on COST (the goal), so the output is correct to that derived tolerance.
  if (Math.abs(ans.output - trueAns) / trueAns > 0.05 / trueN + 0.01) throw new Error(`output ${ans.output.toFixed(0)} ≠ true ${trueAns.toFixed(0)} (beyond the cost-band-implied output tolerance)`)

  // learns the real exponent (≥2 points): the reported local_exponent ≈ 0.72, not the 0.65 assumption.
  const twoPts = nextOutputForCostGoal({ goal_cost_gbp: goal, points: [{ output: 1000, capex_gbp: truePlant(1000) }, { output: 600, capex_gbp: truePlant(600) }] })
  if (twoPts.local_exponent == null || Math.abs(twoPts.local_exponent - trueN) > 0.02) throw new Error(`should learn n≈0.72, got ${twoPts.local_exponent}`)

  // damping: a wildly-cheap noisy round can't fling the next output beyond 3×.
  const damped = nextOutputForCostGoal({ goal_cost_gbp: 1e12, points: [{ output: 100, capex_gbp: 1 }] })
  if (damped.next_output! > 100 * 3 + 1e-6) throw new Error('step must be damped to <=3x')

  // hard floor respected.
  const floored = nextOutputForCostGoal({ goal_cost_gbp: 1, points: [{ output: 1000, capex_gbp: 8e6 }], output_floor: 500 })
  if (floored.next_output! < 500) throw new Error('must not recommend below the hard floor')

  console.log(`design-to-target selftest: OK (converged £5M in ${rounds} round(s) → ${ans.output.toFixed(0)} units @ £${(ans.capex_gbp / 1e6).toFixed(2)}M; learns real exponent; damped; floor)`)
}

if (require.main === module && process.argv.includes('--selftest')) _selftest()
