/**
 * settle-loop.ts — the multi-pass physics<->Blender settle loop (Tristan 2026-06-13:
 * "the model should do 4 loops as a minimum"). Iterates
 *   { re-lay-out + re-measure (generate_drawing_set) -> feed the converged loads +
 *     measured run-lengths back into the engine state (runWritebackPass) }
 * until the fed-back quantities settle, with a HARD MINIMUM of 4 passes and a cap.
 *
 * Cache discipline: generate_drawing_set reuses the routed-CAD artifacts when present
 * (generate_drawing_set.py _CAD_ARTIFACTS). We delete those ONLY when the previous pass
 * actually changed the state, so a genuine change forces a fresh re-layout while a settled
 * design reuses artifacts for free — no wasted Blender renders.
 *
 * Cost: each genuine pass is one LOCAL, DETERMINISTIC Blender render (~75 s, no LLM, £0
 * API). On today's SPARSE topology the design settles in ~1-2 passes (drawer: "design-loop
 * closure is correct-but-immaterial until topology is dense"), so passes 3-4 typically reuse
 * for free; the loop's numeric value scales with topology density (the long pole), but the
 * mechanism runs >=4 and records the settle ledger regardless. UNIVERSAL — no class logic.
 */
import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { runWritebackPass } from './writeback-bridge'

// The routed-CAD artifacts generate_drawing_set reuses-if-present (mirror of its
// _CAD_ARTIFACTS). Deleting them forces a genuine re-layout against the changed state.
const CAD_ARTIFACTS = ['connection-schedule.json', 'route-manifest.json', 'parts-manifest.json']

export interface SettlePass { pass: number; applied: number; settled: boolean; busted: boolean }
export interface SettleResult { passes: SettlePass[]; settledAt: number | null; totalPasses: number; forcedRenders: number }

/** Minimum settle passes from UNIVERSAL_SETTLE_PASSES (default 4, Tristan's floor). */
export function settlePassesFromEnv(envVal: string | undefined, fallback = 4): number {
  const n = parseInt(String(envVal ?? ''), 10)
  return Number.isFinite(n) && n >= 1 ? n : fallback
}

// ── Pure loop-control decisions (unit-tested via `prove-settle-loop.tsx --selftest`) ──
// Extracted so the bust-signal bug (busting on `applied>0` — which is true even for a settled
// design whose writeback re-writes unchanged quantities — instead of on `!settled`) is guarded
// by a fast, Blender-free assertion.

/** Re-render (bust the reuse cache) only AFTER a non-settled pass — a settled design reuses for
 *  free. Pass 1 never busts (it is the initial layout). */
export function settleStepShouldBust(pass: number, prevSettled: boolean): boolean {
  return pass > 1 && !prevSettled
}

/** Stop once the minimum passes are done AND the design is settled (the cap is handled by the loop). */
export function settleShouldStop(pass: number, settled: boolean, minPasses: number): boolean {
  return pass >= minPasses && settled
}

/**
 * Run the settle loop. Calls generate_drawing_set + runWritebackPass up to maxPasses,
 * honouring a minimum of minPasses, breaking once the design is settled past the minimum.
 * NON-FATAL per pass: a render miss leaves prior artifacts and the writeback safely no-ops.
 */
export function runSettleLoop(
  statePath: string,
  outDir: string,
  opts: { pyBin: string; drawScript: string; cwd: string; minPasses?: number; maxPasses?: number; tol?: number },
): SettleResult {
  const minPasses = Math.max(1, opts.minPasses ?? 4)
  const maxPasses = Math.max(minPasses, opts.maxPasses ?? 8)
  const passes: SettlePass[] = []
  let prevSettled = true   // nothing to re-bust before the first pass
  let settledAt: number | null = null
  let forcedRenders = 0
  for (let pass = 1; pass <= maxPasses; pass++) {
    // Bust the reuse cache ONLY when the previous pass was NOT settled → a genuine change to
    // feed back, so force a fresh re-layout against the new quantities. The writeback re-writes
    // its quantities every pass (so `applied` is not the change signal — `settled` is); a settled
    // design keeps its artifacts and reuses them for free, so the confirming passes cost ~nothing.
    const busted = settleStepShouldBust(pass, prevSettled)
    if (busted) {
      for (const a of CAD_ARTIFACTS) {
        try { rmSync(resolve(outDir, a), { force: true }) } catch { /* ignore */ }
      }
      forcedRenders++
    }
    try {
      execFileSync(opts.pyBin, [opts.drawScript, statePath, outDir], { stdio: 'inherit', cwd: opts.cwd, env: { ...process.env } })
    } catch { /* non-fatal: leave prior artifacts; the writeback no-ops safely on absence */ }
    const wb = runWritebackPass(statePath, outDir, { pass, tol: opts.tol })
    passes.push({ pass, applied: wb.applied, settled: wb.settled, busted })
    if (wb.settled && settledAt == null) settledAt = pass
    prevSettled = wb.settled
    if (settleShouldStop(pass, wb.settled, minPasses)) break   // honour the floor, then stop once settled
  }
  return { passes, settledAt, totalPasses: passes.length, forcedRenders }
}

// ════════════════════════════════════════════════════════════════════════════════════════
// EARLY design-loop closure (Increment 2 + 3) — the C→D→E round trip, BEFORE the cost stack.
// ════════════════════════════════════════════════════════════════════════════════════════
// Distinct from runSettleLoop (which is the LATE drawing-generation loop) in two ways:
//  1. It drives generate_drawing_set in CAD_ARTIFACTS_ONLY mode — only the routed artifacts +
//     convergence-report (fast), NOT the heavy drawings (those are produced once, late).
//  2. After the writeback settles, it runs the E PASS (re-size): re-derive the incomer /
//     distribution transformer kVA from the CONVERGED supply demand and write it into the
//     contract, so the BoM line + the single-line drawing reflect the as-routed demand.
// The loop body B→C→D is runSettleLoop; the E pass is applied once on the settled state.

const IEC_KVA_LADDER = [
  25, 50, 100, 160, 200, 250, 315, 400, 500, 630, 800,
  1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
]

/** Smallest IEC-60076 standard kVA ≥ s_req (mirrors electrical_transformer_sizing._next_standard_kva:
 *  above the top of the ladder, round UP to the next 100 kVA — never under-size). */
export function nextStandardKva(sReqKva: number): number {
  for (const r of IEC_KVA_LADDER) if (r >= sReqKva - 1e-9) return r
  return Math.ceil(sReqKva / 100) * 100
}

/**
 * E PASS (pure): re-size the incomer transformer from the CONVERGED supply demand. Reads
 * quantities.total_supply_demand_kw (written by the writeback); returns the updated quantities
 * with an ADDITIVE total_supply_demand_kva (S = P/pf × (1+headroom) → next IEC standard) so the
 * BoM + drawings reflect the as-routed demand. Returns null (no change) when there is no converged
 * demand to size from. Never touches the brief plant-load metric. UNIVERSAL — no class logic.
 */
export function resizeFromConvergedDemand(
  quantities: Record<string, any>,
  opts: { powerFactor?: number; headroom?: number } = {},
): { quantities: Record<string, any>; kva: number; kw: number } | null {
  const q = quantities || {}
  const sup = q.total_supply_demand_kw
  const kw = (sup && typeof sup === 'object') ? Number(sup.value) : Number(sup)
  if (!Number.isFinite(kw) || kw <= 0) return null
  const pf = opts.powerFactor ?? 0.9
  const headroom = opts.headroom ?? 0.25
  const sReq = (kw / pf) * (1 + headroom)
  const kva = nextStandardKva(sReq)
  const next = { ...q }
  const prev = next.total_supply_demand_kva
  if (prev != null && typeof prev === 'object') next.total_supply_demand_kva = { ...prev, value: kva }
  else next.total_supply_demand_kva = {
    value: kva, unit: 'kVA', family: 'power',
    basis: `incomer re-sized from the as-routed supply demand ${kw} kW (S=P/pf×(1+headroom), pf ${pf}, ${Math.round(headroom * 100)}% headroom → next IEC-60076 standard); converged-loop E pass`,
    source: 'design-loop',
  }
  return { quantities: next, kva, kw }
}

export interface EarlyLoopResult extends SettleResult {
  basePreLoopKw: number | null
  converged: number | null
  parasiticKw: number | null
  resizedTransformerKva: number | null
}

/**
 * Run the EARLY design loop: B→C→D to a settled fixed point (runSettleLoop in CAD_ARTIFACTS_ONLY
 * mode, against `loopDir`), then the E pass (resize) applied to the shared state. Reads the
 * convergence-report the loop produced to report the pre-loop → converged demand for the ledger
 * (honest BEFORE→AFTER). When `resizeOutDir` is given, ALSO copies the routed artifacts the late
 * drawing pass reuses into it, so the late pass reuses (no second Blender scene-build).
 */
export function runEarlyDesignLoop(
  statePath: string,
  loopDir: string,
  opts: {
    pyBin: string; drawScript: string; cwd: string
    minPasses?: number; maxPasses?: number; tol?: number; resizeOutDir?: string
  },
): EarlyLoopResult {
  // C+D: settle the writeback. CAD_ARTIFACTS_ONLY ⇒ only the routed artifacts + convergence-report
  // (fast: the heavy drawings are produced once, LATE, just before render). runSettleLoop spreads
  // process.env into the Blender child, so we set the flag on process.env for the loop's duration
  // and restore it after (so we never leak the fast-path flag into the late full drawing pass).
  const prevFlag = process.env.CAD_ARTIFACTS_ONLY
  process.env.CAD_ARTIFACTS_ONLY = '1'
  let settle: SettleResult
  try {
    settle = runSettleLoop(statePath, loopDir, {
      pyBin: opts.pyBin, drawScript: opts.drawScript, cwd: opts.cwd,
      minPasses: opts.minPasses, maxPasses: opts.maxPasses, tol: opts.tol,
    })
  } finally {
    if (prevFlag === undefined) delete process.env.CAD_ARTIFACTS_ONLY
    else process.env.CAD_ARTIFACTS_ONLY = prevFlag
  }

  // Pull the BEFORE→AFTER demand from the convergence the loop just wrote (honest ledger figures).
  let basePreLoopKw: number | null = null
  let converged: number | null = null
  let parasiticKw: number | null = null
  try {
    const cr = join(loopDir, 'convergence-report.json')
    if (existsSync(cr)) {
      const rep = JSON.parse(readFileSync(cr, 'utf-8'))
      basePreLoopKw = Number.isFinite(Number(rep.base_demand_kw)) ? Number(rep.base_demand_kw) : null
      parasiticKw = Number.isFinite(Number(rep.parasitic_kw)) ? Number(rep.parasitic_kw) : null
      const traj = Array.isArray(rep.trajectory) ? rep.trajectory : []
      const last = traj[traj.length - 1]
      if (last && Number.isFinite(Number(last.total_demand_kw))) converged = Number(last.total_demand_kw)
    }
  } catch { /* honest null on any miss */ }

  // E PASS: re-size the incomer from the converged supply demand the writeback wrote into state.
  let resizedTransformerKva: number | null = null
  try {
    if (existsSync(statePath)) {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'))
      const oc = state.orchestratorContract || {}
      const resized = resizeFromConvergedDemand(oc.quantities || {})
      if (resized) {
        oc.quantities = resized.quantities
        state.orchestratorContract = oc
        writeFileSync(statePath, JSON.stringify(state))
        resizedTransformerKva = resized.kva
      }
    }
  } catch { /* non-fatal: E pass is additive */ }

  // Hand the routed artifacts to the late drawing pass so it REUSES them (no 2nd scene-build).
  if (opts.resizeOutDir) {
    for (const a of ['connection-schedule.json', 'route-manifest.json', 'parts-manifest.json', 'convergence-report.json',
                     'inspect-hero.png', 'inspect-iso.png', 'inspect-top.png', 'inspect-front.png', 'inspect-side.png']) {
      try {
        const src = join(loopDir, a)
        if (existsSync(src)) writeFileSync(join(opts.resizeOutDir, a), readFileSync(src))
      } catch { /* ignore — late pass rebuilds if absent */ }
    }
  }

  return { ...settle, basePreLoopKw, converged, parasiticKw, resizedTransformerKva }
}
