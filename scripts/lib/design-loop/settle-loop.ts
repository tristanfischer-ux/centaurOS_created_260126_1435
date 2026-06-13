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
import { rmSync } from 'fs'
import { resolve } from 'path'
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
