/**
 * design-to-target-run.ts — the design-to-target ORCHESTRATOR (ForgeOS Phase 1.5 / #47, 2026-06-24).
 *
 * The EXPENSIVE half of #47: it actually RE-RUNS the full chain at successive output scales to
 * converge a REAL design onto a cost goal (the automated RAS-£5M iteration). The cheap, pure
 * root-finder lives in ./lib/design-to-target (nextOutputForCostGoal); this drives it with real
 * chain runs. The runner is INJECTABLE so the loop control is testable with a synthetic plant
 * (the selftest) without burning a ~20-minute chain run per round.
 *
 * Each round multiplies the briefed output target via DESIGN_TARGET_SCALE (the chain applies it
 * after the brief settles), runs the chain, then measures the design's REAL (output, capex) from
 * its state.json. Root-finding is done in SCALE space (capex ∝ scale^n, a power law), so it is
 * unit-agnostic. Cost-driven objectives (cost_min → hit the ceiling; balanced → hit the sweet-spot
 * cost) loop; output_max / a ceiling-less brief build the target once (accept the cost).
 *
 * Cost: 1 + a few full chain runs PER COMMITTED DESIGN (not per option). Run it deliberately on the
 * design you commit to — consistent with Tristan's queue-not-auto-dispatch cost discipline.
 */
import { nextOutputForCostGoal, type DesignPoint } from './lib/design-to-target'
import { reconcile, type PrimaryObjective } from './lib/sweet-spot'
import { execFileSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export interface RoundMeasurement { scale: number; output: number; capex_gbp: number; out_dir: string }
export type ChainRunner = (scale: number, roundIdx: number) => Promise<RoundMeasurement>

export interface DesignToTargetOpts {
  briefPath: string
  baseOutDir: string
  objective: PrimaryObjective
  cost_ceiling_gbp: number | null
  output_floor_scale?: number | null
  max_rounds?: number          // default 4
  tolerance?: number           // default 0.05 (±5% on cost)
}

export interface DesignToTargetResult {
  converged: boolean
  objective: PrimaryObjective
  goal_cost_gbp: number | null
  rounds: RoundMeasurement[]
  best: RoundMeasurement | null
  trace: string[]
}

const _M = (v: number) => `£${(v / 1e6).toFixed(2)}M`

/** Drive the design-to-target loop. `runner` re-runs the chain (real) or simulates it (test).
 * `seedRound0` lets the caller pass an already-measured round 0 (so the smart entry-point doesn't
 * pay for it twice). Pure control. */
export async function runDesignToTarget(opts: DesignToTargetOpts, runner: ChainRunner, seedRound0?: RoundMeasurement): Promise<DesignToTargetResult> {
  const maxRounds = opts.max_rounds ?? 4
  const tol = opts.tolerance ?? 0.05
  const trace: string[] = []

  // round 0 — the briefed scale (1.0).
  const r0 = seedRound0 ?? await runner(1, 0)
  const rounds: RoundMeasurement[] = [r0]
  trace.push(`round 0: scale 1.000 → ${r0.output.toPrecision(4)} @ ${_M(r0.capex_gbp)}`)

  const ceiling = opts.cost_ceiling_gbp
  // output_max OR no ceiling → no cost loop: build the briefed output, accept the cost.
  if (opts.objective === 'output_max' || ceiling == null) {
    trace.push(`objective ${opts.objective}${ceiling == null ? ' / no cost ceiling' : ''} → no cost loop (build the target, accept the cost)`)
    return { converged: true, objective: opts.objective, goal_cost_gbp: null, rounds, best: r0, trace }
  }
  // COMPATIBLE — round 0 already fits the budget: build the briefed target, do NOT scale up to "spend
  // the ceiling" (a cost_min/balanced brief that is affordable should not over-build). No loop.
  if (r0.capex_gbp <= ceiling * (1 + tol)) {
    trace.push(`round 0 ${_M(r0.capex_gbp)} already within the ${_M(ceiling)} ceiling → build the briefed target (no rescale needed)`)
    return { converged: true, objective: opts.objective, goal_cost_gbp: ceiling, rounds, best: r0, trace }
  }

  // cost goal: cost_min → the ceiling; balanced → the sweet-spot capex (from round-0 real data).
  let goal: number
  if (opts.objective === 'cost_min') {
    goal = ceiling
  } else {
    const ss = reconcile({ objective: 'balanced', output_target: r0.output, output_floor: null,
      cost_ceiling_gbp: ceiling, ref_output: r0.output, ref_capex_gbp: r0.capex_gbp })
    goal = ss.recommended_capex_gbp
  }
  trace.push(`cost goal ${_M(goal)} (objective ${opts.objective})`)

  // root-find in SCALE space (capex ∝ scale^n).
  const pts: DesignPoint[] = rounds.map((r) => ({ output: r.scale, capex_gbp: r.capex_gbp }))
  let decision = nextOutputForCostGoal({ goal_cost_gbp: goal, points: pts, tolerance: tol, output_floor: opts.output_floor_scale ?? null })
  let round = 1
  while (!decision.converged && round <= maxRounds) {
    const nextScale = decision.next_output!
    trace.push(`→ ${decision.reason}`)
    const rk = await runner(nextScale, round)
    rounds.push(rk)
    pts.push({ output: rk.scale, capex_gbp: rk.capex_gbp })
    trace.push(`round ${round}: scale ${nextScale.toFixed(3)} → ${rk.output.toPrecision(4)} @ ${_M(rk.capex_gbp)}`)
    decision = nextOutputForCostGoal({ goal_cost_gbp: goal, points: pts, tolerance: tol, output_floor: opts.output_floor_scale ?? null })
    round++
  }
  const best = rounds.reduce((m, r) => (Math.abs(r.capex_gbp - goal) < Math.abs(m.capex_gbp - goal) ? r : m), rounds[0])
  trace.push(decision.converged
    ? `✦ CONVERGED: ${best.output.toPrecision(4)} @ ${_M(best.capex_gbp)} — within ${(tol * 100).toFixed(0)}% of the ${_M(goal)} goal in ${rounds.length} round(s)`
    : `stopped at max ${maxRounds} rounds; best ${best.output.toPrecision(4)} @ ${_M(best.capex_gbp)} (${((Math.abs(best.capex_gbp - goal) / goal) * 100).toFixed(1)}% off goal)`)
  return { converged: decision.converged, objective: opts.objective, goal_cost_gbp: goal, rounds, best, trace }
}

/** The REAL runner: re-runs the chain at `scale`, reads the resulting state.json, measures (output, capex). */
export function chainRunner(opts: DesignToTargetOpts): ChainRunner {
  // lazy so the test path (mock runner) never imports the heavy cost-sanity module.
  return async (scale, roundIdx) => {
    const { deriveOutputDenominator, readHeadlineCostGbp } = await import('../src/lib/pdf-engine-v2/lib/independent-cost-sanity-audit')
    const outDir = resolve(`${opts.baseOutDir}-r${roundIdx}`)
    try {
      execFileSync('npx', ['tsx', 'scripts/serial-design-chain-v2.tsx', opts.briefPath, outDir],
        { env: { ...process.env, DESIGN_TARGET_SCALE: String(scale) }, stdio: 'inherit', cwd: resolve(__dirname, '..') })
    } catch {
      // the chain exits non-zero on render-and-flag gates (20/21) but STILL writes state.json — read it.
    }
    const sp = resolve(outDir, 'state.json')
    if (!existsSync(sp)) throw new Error(`design-to-target round ${roundIdx}: chain produced no state.json in ${outDir}`)
    const state = JSON.parse(readFileSync(sp, 'utf8'))
    const out = deriveOutputDenominator(state)
    const cap = readHeadlineCostGbp(state)
    if (!out?.value || !cap?.gbp) throw new Error(`design-to-target round ${roundIdx}: could not measure output/capex from ${sp}`)
    return { scale, output: out.value, capex_gbp: cap.gbp, out_dir: outDir }
  }
}

// ── selftest — full loop against a SYNTHETIC plant (no real chain run) ───────────────────────────
async function _selftest(): Promise<void> {
  const trueN = 0.70, K = 8_000_000 / Math.pow(1000, trueN)   // true plant: 1000 units → £8M
  const mock: ChainRunner = async (scale) => {
    const output = 1000 * scale
    return { scale, output, capex_gbp: K * Math.pow(output, trueN), out_dir: `mock-r` }
  }

  // 1. cost_min, £5M ceiling, briefed 1000 @ £8M → loop DOWN to ~£5M.
  const a = await runDesignToTarget({ briefPath: 'x', baseOutDir: 'mock', objective: 'cost_min', cost_ceiling_gbp: 5_000_000 }, mock)
  if (!a.converged) throw new Error('1: cost_min must converge to £5M ceiling\n' + a.trace.join('\n'))
  if (Math.abs(a.best!.capex_gbp - 5_000_000) / 5e6 > 0.05) throw new Error(`1: best ${a.best!.capex_gbp} not within 5% of £5M`)
  if (a.best!.output >= 1000) throw new Error('1: cost_min must scale DOWN from 1000')
  if (a.rounds.length > 5) throw new Error(`1: ${a.rounds.length} rounds — too many`)

  // 2. output_max → ONE round, build the target, no cost loop.
  const b = await runDesignToTarget({ briefPath: 'x', baseOutDir: 'mock', objective: 'output_max', cost_ceiling_gbp: 5_000_000 }, mock)
  if (b.rounds.length !== 1 || !b.converged) throw new Error('2: output_max must be a one-shot build')
  if (b.goal_cost_gbp !== null) throw new Error('2: output_max has no cost goal')

  // 3. no ceiling → one-shot.
  const c = await runDesignToTarget({ briefPath: 'x', baseOutDir: 'mock', objective: 'balanced', cost_ceiling_gbp: null }, mock)
  if (c.rounds.length !== 1) throw new Error('3: no ceiling → one-shot')

  // 4. already compatible (briefed cost < ceiling) → converges immediately at round 0.
  const d = await runDesignToTarget({ briefPath: 'x', baseOutDir: 'mock', objective: 'cost_min', cost_ceiling_gbp: 8_400_000 }, mock)
  if (!d.converged) throw new Error('4: briefed £8M within £8.4M ceiling → converged at round 0')

  console.log(`design-to-target ORCHESTRATOR selftest: OK (cost_min converged to £5M in ${a.rounds.length} rounds → ${a.best!.output.toFixed(0)} units; output_max one-shot; no-ceiling one-shot; already-compatible)`)
}

/**
 * SMART ENTRY POINT (the auto-trigger): run a brief, and if the reconciliation shows cost↔output
 * TENSION (and the objective is cost-driven), AUTOMATICALLY converge a real design to the target —
 * else one-shot. The user runs ONE command; the loop fires only when it should. The objective +
 * ceiling are read from round 0's own state (no need to pass them). Round 0 is reused (not re-run).
 */
async function main(): Promise<void> {
  const briefPath = process.argv[2], baseOutDir = process.argv[3]
  if (!briefPath || !baseOutDir) {
    console.error('usage: design-to-target-run.ts <brief.md> <base-out-dir> [--max-rounds N] [--tol 0.05]')
    process.exit(1)
  }
  const maxArg = process.argv.indexOf('--max-rounds')
  const tolArg = process.argv.indexOf('--tol')
  const max_rounds = maxArg > 0 ? parseInt(process.argv[maxArg + 1], 10) : 4
  const tolerance = tolArg > 0 ? parseFloat(process.argv[tolArg + 1]) : 0.05

  const { readFileSync } = await import('fs')
  const { resolve } = await import('path')

  // round 0 (scale 1) — the briefed design.
  const seedOpts: DesignToTargetOpts = { briefPath, baseOutDir, objective: 'balanced', cost_ceiling_gbp: null, max_rounds, tolerance }
  console.error(`[design-to-target] round 0 — running the briefed design (scale 1.0) …`)
  const r0 = await chainRunner(seedOpts)(1, 0)

  // auto-read the objective + ceiling + hard floor from round 0's settled brief.
  const st = JSON.parse(readFileSync(resolve(r0.out_dir, 'state.json'), 'utf8'))
  const c = st?.parsedBrief?.constraints ?? {}
  const objective = (c.primary_objective?.value as PrimaryObjective) ?? 'balanced'
  const cost_ceiling_gbp = typeof c.unit_cost_ceiling?.value === 'number' ? c.unit_cost_ceiling.value : null
  const floorVal = typeof c.output_floor?.value === 'number' ? c.output_floor.value : null
  const targetVal = typeof c.target_performance?.value === 'number' ? c.target_performance.value : r0.output
  const output_floor_scale = floorVal && targetVal ? floorVal / targetVal : null
  const verdict = st?.sweetSpot?.verdict ?? '(none)'
  console.error(`[design-to-target] objective=${objective}  ceiling=${cost_ceiling_gbp ? _M(cost_ceiling_gbp) : 'none'}  sweet-spot verdict=${verdict}`)

  const result = await runDesignToTarget(
    { briefPath, baseOutDir, objective, cost_ceiling_gbp, output_floor_scale, max_rounds, tolerance },
    chainRunner({ briefPath, baseOutDir, objective, cost_ceiling_gbp, max_rounds, tolerance }),
    r0,   // reuse round 0 — don't pay for it twice
  )
  console.error('\n[design-to-target] ── convergence trace ──')
  for (const line of result.trace) console.error('  ' + line)
  console.error(`\n[design-to-target] ${result.converged ? '✦ DONE' : '⚠ stopped (max rounds)'} — committed design: ${result.best?.out_dir} (${result.best?.output.toPrecision(4)} @ ${_M(result.best?.capex_gbp ?? 0)})`)
}

if (require.main === module) {
  if (process.argv.includes('--selftest')) _selftest().catch((e) => { console.error(e); process.exit(1) })
  else main().catch((e) => { console.error('[design-to-target] FATAL:', e); process.exit(1) })
}
