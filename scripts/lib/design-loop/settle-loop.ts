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
import { execFileSync, spawnSync } from 'child_process'
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

// The preferred distribution-transformer / incomer rating ladder. IEC 60076 series
// EXTENDED with the 75 kVA step (the UK dry-type / packaged-substation trade ladder —
// 50/75/100/160/250 — carries it; without it a 53 kW plant's 66.25 kVA requirement
// jumped a whole size class to 100 kVA, and a rounding-edge shape could even quote a
// raw 66 that FAILS the ≥ load × 1.25 adequacy invariant).
const IEC_KVA_LADDER = [
  25, 50, 75, 100, 160, 200, 250, 315, 400, 500, 630, 800,
  1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
]

/** Smallest standard kVA rating ≥ s_req over IEC_KVA_LADDER (above the top of the
 *  ladder, round UP to the next 100 kVA — never under-size). An exactly-on-a-step
 *  requirement returns that step (the ≥ is inclusive: 40 kW × 1.25 = 50 → 50 kVA). */
export function nextStandardKva(sReqKva: number): number {
  for (const r of IEC_KVA_LADDER) if (r >= sReqKva - 1e-9) return r
  return Math.ceil(sReqKva / 100) * 100
}

// The incomer sizing margin: kVA ≥ load kW × 1.25. Because kVA ≥ kW for ANY power
// factor, load × 1.25 is the assumption-free adequacy requirement — the SAME basis the
// deterministic adequacy check ('Main incomer kVA >= connected load x 1.25') verifies,
// so the mint and the check can never disagree on the rule.
export const INCOMER_KVA_MARGIN = 1.25

// ── ONE MINT, ONE OWNER: the incomer-kVA ALIAS FAMILY (2026-07-03, Codema v62) ──────────
// The plant supply/incomer/distribution-transformer nameplate has ONE owner — the design
// loop's total_supply_demand_kva mint (this file, resizeFromConvergedDemand). Any contract
// quantity that is an ALIAS of that rating (minted earlier, e.g. by the bootstrap
// tool:electrical:transformer-sizing running BEFORE the load converged) must RECONCILE to
// the design-loop value, or the dossier carries the same transformer at two ratings (v62:
// contract transformer_kva=100 from the bootstrap vs design-loop total_supply_demand_kva=75
// vs a third pf-divided 66 on the single-line → Electrical 'single-line ↔ schedule ·
// transformer kVA' FAIL). The alias keys mirror the deterministic adequacy check's incomer
// preference list (deterministic_checks_lib._checks A2) minus total_supply_demand_kva itself.
// `transformer_rating_kva` is EXCLUDED deliberately: it is the grid-tie STEP-UP/export
// transformer's rating (BESS carries 3150 kVA against a 1600 kVA supply-demand mint,
// legitimately) — not a supply-demand alias.
export const INCOMER_KVA_ALIAS_KEYS = [
  'transformer_kva', 'main_transformer_kva', 'main_incomer_kva',
  'supply_transformer_kva', 'main_supply_kva',
] as const

// A stale alias diverges from the re-mint by the CONVERGENCE delta on the same load —
// bounded by a couple of preferred-rating steps. A rating ≥ 3 ladder steps away is a
// genuinely DIFFERENT transformer (a dedicated process/step-up unit): it STANDS, and the
// adequacy/benchmark checks judge it — the reconcile never silently rewrites it.
export const KVA_ALIAS_MAX_LADDER_STEPS = 2

/** Rank of a kVA value on the preferred-rating ladder: the number of standard steps ≤ it
 *  (off-ladder values rank between their neighbours; above the ladder top, bespoke 100 kVA
 *  steps extend the rank — mirroring nextStandardKva's never-under-size rule). */
export function kvaLadderRank(v: number): number {
  let r = 0
  for (const s of IEC_KVA_LADDER) if (s <= v + 1e-9) r++
  const top = IEC_KVA_LADDER[IEC_KVA_LADDER.length - 1]
  if (v > top) r += Math.ceil((v - top) / 100)
  return r
}

export interface ReconciledAlias { key: string; from: number; to: number; steps: number }

/**
 * E PASS (pure): size the incomer/transformer kVA from the reconciled supply demand.
 * THE RULE (v56c convergence round): incomer kVA = next STANDARD rating ≥ load × 1.25
 * (ladder incl. 75; kVA ≥ kW for any power factor, so this is assumption-free and
 * matches the deterministic adequacy check exactly). Reads quantities.total_supply_demand_kw
 * (the connected-load alias the writeback reconciles); writes ONE additive
 * total_supply_demand_kva — the single mint the checks, the Excel and the single-line all
 * read. Returns null (no change) when there is no demand to size from. Never touches the
 * brief plant-load metric. UNIVERSAL — no class logic.
 */
export function resizeFromConvergedDemand(
  quantities: Record<string, any>,
  opts: { margin?: number } = {},
): { quantities: Record<string, any>; kva: number; kw: number; reconciled: ReconciledAlias[] } | null {
  const q = quantities || {}
  const sup = q.total_supply_demand_kw
  const kw = (sup && typeof sup === 'object') ? Number(sup.value) : Number(sup)
  if (!Number.isFinite(kw) || kw <= 0) return null
  const margin = opts.margin ?? INCOMER_KVA_MARGIN
  const sReq = Math.round(kw * margin * 1000) / 1000
  const kva = nextStandardKva(sReq)
  const next = { ...q }
  const prev = next.total_supply_demand_kva
  // TRACEABILITY SPINE: this incomer kVA is computed FROM total_supply_demand_kw — record that
  // lineage + a formula-bearing source_detail so it is not born sourceless and the
  // Calculations surface can show the working (the '=' makes calc-coverage count it SHOWN).
  const detail =
    `incomer kVA = next standard rating ≥ load × ${margin}: ${kw} kW × ${margin} = ${sReq} kVA → ` +
    `${kva} kVA (standard ladder 50/75/100/160/250…; kVA ≥ kW for any power factor — the ` +
    `assumption-free adequacy basis the deterministic check verifies)`
  const meta = {
    source: 'design-loop',
    source_detail: detail,
    lineage: {
      from: ['total_supply_demand_kw'], via: 'design-loop:incomer-sizing',
      formula: `NEXT_STANDARD_KVA(total_supply_demand_kw*${margin})`,
    },
  }
  if (prev != null && typeof prev === 'object') next.total_supply_demand_kva = { ...prev, value: kva, ...meta }
  else next.total_supply_demand_kva = {
    value: kva, unit: 'kVA', family: 'power',
    basis: `incomer sized from the supply demand ${kw} kW: next standard rating ≥ ${kw} × ${margin} = ${sReq} kVA → ${kva} kVA; converged-loop E pass`,
    ...meta,
  }

  // ── ALIAS RECONCILE (2026-07-03, the v62 three-way kVA divergence) ────────────────────
  // ONE MINT, ONE OWNER: any incomer-kVA alias minted BEFORE the design loop converged
  // (bootstrap tool:electrical:transformer-sizing ran at its own earlier input → v62
  // carried transformer_kva=100 against this pass's 75) is RECONCILED to the design-loop
  // mint — the reconciliation lives HERE, at the mint, because the tool runs first (the
  // same choke-point pattern as the total_supply_demand_kw alias reconcile in
  // writeback-bridge: adopt the anchor, keep the superseded figure in the basis, never
  // patch downstream consumers). Within the ladder-step tolerance the stale value is an
  // ALIAS (same rating family, pre-convergence input) and adopts the mint; beyond it the
  // rating is a genuinely different transformer and STANDS (the adequacy/benchmark checks
  // judge it — silent rewrites of a real divergence would hide a fault, not fix one).
  const reconciled: ReconciledAlias[] = []
  for (const key of INCOMER_KVA_ALIAS_KEYS) {
    const cur = next[key]
    if (cur == null) continue
    const val = (typeof cur === 'object') ? Number(cur.value) : Number(cur)
    if (!Number.isFinite(val) || val <= 0 || val === kva) continue
    const steps = Math.abs(kvaLadderRank(val) - kvaLadderRank(kva))
    if (steps > KVA_ALIAS_MAX_LADDER_STEPS) continue           // genuinely different rating — stands
    const recBasis =
      `reconciled to the design-loop incomer mint (one mint, one owner): total_supply_demand_kva = ` +
      `${kva} kVA from the converged supply demand ${kw} kW × ${margin}; as-computed ${val} kVA ` +
      `(pre-convergence input, ${steps} ladder step${steps === 1 ? '' : 's'} off) superseded — kept here for the ledger`
    const recMeta = {
      source: 'design-loop',
      source_detail: recBasis,
      as_computed_kva: val,
      lineage: { from: ['total_supply_demand_kva'], via: 'design-loop:incomer-alias-reconcile',
                 formula: 'ADOPT(total_supply_demand_kva)' },
    }
    next[key] = (typeof cur === 'object')
      ? { ...cur, value: kva, basis: recBasis, ...recMeta }
      : { value: kva, unit: 'kVA', family: 'power', basis: recBasis, ...recMeta }
    reconciled.push({ key, from: val, to: kva, steps })

    // The tool's PAIRED line currents are functions of the nameplate at fixed voltage
    // (I = S·1000 / (√3·U)) — scale them with the reconciled rating so the contract stays
    // internally coherent. (When the E pass re-runs the tool, the exact re-computed values
    // overwrite these scaled ones — see applyEPassResize.)
    if (key === 'transformer_kva') {
      for (const ck of ['transformer_primary_current_a', 'transformer_secondary_current_a']) {
        const cq = next[ck]
        if (cq == null) continue
        const cv = (typeof cq === 'object') ? Number(cq.value) : Number(cq)
        if (!Number.isFinite(cv) || cv <= 0) continue
        const scaled = Math.round(cv * (kva / val) * 100) / 100
        const cBasis = `re-based on the reconciled nameplate ${kva} kVA (linear in S at fixed voltage: ` +
          `${cv} A × ${kva}/${val}); as-computed ${cv} A superseded`
        next[ck] = (typeof cq === 'object')
          ? { ...cq, value: scaled, basis: cBasis, source: 'design-loop', source_detail: cBasis,
              lineage: { from: ['transformer_kva'], via: 'design-loop:incomer-alias-reconcile' } }
          : { value: scaled, unit: 'A', family: 'current', basis: cBasis, source: 'design-loop' }
        reconciled.push({ key: ck, from: cv, to: scaled, steps })
      }
    }
  }
  return { quantities: next, kva, kw, reconciled }
}

export interface EarlyLoopResult extends SettleResult {
  basePreLoopKw: number | null
  converged: number | null
  parasiticKw: number | null
  resizedTransformerKva: number | null
}

// ── E-PASS TOOL RE-MINT (2026-07-03): keep the tool PROVENANCE true after the reconcile ──
// Reconciling contract transformer_kva to the design-loop mint would leave the bootstrap
// tool's CLAIM (4-orchestrator-tools-used.json + state.toolsUsedPage + the contract's
// worked_calculations) at the superseded value — the deterministic 'Tool output used:
// transformer_kva' provenance check would then honestly FAIL as STALE. The tool is a pure,
// deterministic, stdlib-only script implementing the SAME one-mint rule, so the E pass
// RE-RUNS it at the converged supply demand (recovering pf + voltages from the recorded
// worked inputs) and updates the claims + worked[] with the GENUINE re-computation —
// provenance stays true because the tool really did compute the reconciled numbers.
const TRANSFORMER_TOOL_ID = 'electrical:transformer-sizing'
const TRANSFORMER_TOOL_SCRIPT = resolve(
  __dirname, '..', 'orchestrator', 'tools', 'python', 'electrical_transformer_sizing.py')

/** Pull a numeric input (by worked-calc label + symbol) out of a tools-used entry's worked[]. */
function workedInput(worked: any[], labelRe: RegExp, symbol: string): number | null {
  for (const w of Array.isArray(worked) ? worked : []) {
    if (!labelRe.test(String(w?.label || ''))) continue
    const inp = (Array.isArray(w?.inputs) ? w.inputs : []).find((i: any) => String(i?.symbol) === symbol)
    const n = Number(inp?.value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

/** Apply the fresh tool output onto ONE tools-used entry (claims values + worked[]), in place. */
function applyFreshToolOutputToEntry(entry: any, fresh: Record<string, any>, kw: number): void {
  for (const c of Array.isArray(entry?.claims) ? entry.claims : []) {
    const fv = fresh[String(c?.field)]
    if (typeof fv !== 'number' || !Number.isFinite(fv) || fv === c.value) continue
    const old = c.value
    c.value = fv
    c.input_summary =
      `re-minted by the design-loop E pass at the converged supply demand ${kw} kW ` +
      `(one-mint rule; superseded pre-convergence value: ${old}${c.unit ? ' ' + c.unit : ''})`
  }
  if (Array.isArray(fresh.worked) && fresh.worked.length) entry.worked = fresh.worked
  entry.re_minted = { by: 'design-loop-e-pass', converged_supply_demand_kw: kw }
}

/**
 * Re-run the deterministic transformer-sizing tool at the converged load and propagate the
 * genuine re-computation to every surface that carries the tool's numbers:
 *   4-orchestrator-tools-used.json (deterministic provenance checks read the FILE),
 *   state.toolsUsedPage (Excel reads the STATE copy),
 *   orchestratorContract.worked_calculations[tool] (the Calculations sheet),
 *   the contract's transformer_* current quantities (exact values over the scaled fallback).
 * Returns true only when the re-run agreed with the design-loop mint and was applied.
 * NEVER throws — on any miss the pure reconcile stands and the provenance check will
 * honestly report the claim as STALE (true: the tool ran at a pre-convergence input).
 */
export function reMintTransformerToolClaims(
  state: any, runDir: string, pyBin: string,
  resized: { kva: number; kw: number },
): boolean {
  try {
    const toolsUsedPath = join(runDir, '4-orchestrator-tools-used.json')
    if (!existsSync(toolsUsedPath) || !existsSync(TRANSFORMER_TOOL_SCRIPT)) return false
    const doc = JSON.parse(readFileSync(toolsUsedPath, 'utf-8'))
    const entry = (Array.isArray(doc?.tools) ? doc.tools : []).find(
      (t: any) => String(t?.tool_id) === TRANSFORMER_TOOL_ID)
    if (!entry) return false

    // Recover the run's electrical basis from the recorded worked inputs (fall back to the
    // tool defaults). pf cannot change the mint (pf-free rule) — it only re-labels the
    // informational apparent-power line; the voltages set the line currents.
    const pf = workedInput(entry.worked, /apparent power/i, 'pf') ?? 0.9
    const vPri = workedInput(entry.worked, /primary line current/i, 'U_LL')
      ?? workedInput(entry.worked, /primary line current/i, 'U') ?? 11000
    const vSec = workedInput(entry.worked, /secondary line current/i, 'U_LL')
      ?? workedInput(entry.worked, /secondary line current/i, 'U') ?? 400
    const proc = spawnSync(pyBin, [TRANSFORMER_TOOL_SCRIPT], {
      input: JSON.stringify({
        plant_load_kw: resized.kw, power_factor: pf,
        primary_voltage_v: vPri, secondary_voltage_v: vSec,
      }),
      encoding: 'utf-8', timeout: 30_000,
    })
    if (proc.status !== 0 || !proc.stdout) return false
    const fresh = JSON.parse(proc.stdout)
    // The tool and the E pass implement ONE rule — a disagreement means the re-run inputs
    // are not this plant's (recovery failed): keep the reconcile, do NOT rewrite claims.
    if (fresh?.error || Number(fresh?.transformer_kva) !== resized.kva) return false

    applyFreshToolOutputToEntry(entry, fresh, resized.kw)
    writeFileSync(toolsUsedPath, JSON.stringify(doc, null, 2))

    const stateEntry = (state?.toolsUsedPage?.tools || []).find(
      (t: any) => String(t?.tool_id) === TRANSFORMER_TOOL_ID)
    if (stateEntry) applyFreshToolOutputToEntry(stateEntry, fresh, resized.kw)

    const oc = state.orchestratorContract || {}
    if (oc.worked_calculations && oc.worked_calculations[TRANSFORMER_TOOL_ID]
        && Array.isArray(fresh.worked) && fresh.worked.length) {
      oc.worked_calculations[TRANSFORMER_TOOL_ID] = fresh.worked
    }
    // Exact re-computed currents over the linear-scaled fallback (same numbers modulo the
    // tool's own rounding; the claims and the contract must be identical for provenance).
    const q = oc.quantities || {}
    for (const fld of ['transformer_primary_current_a', 'transformer_secondary_current_a']) {
      const fv = fresh[fld]
      const cur = q[fld]
      if (typeof fv !== 'number' || !Number.isFinite(fv) || cur == null) continue
      const basis = `re-computed by ${TRANSFORMER_TOOL_ID} re-run at the converged supply demand ` +
        `${resized.kw} kW (design-loop E pass; I = S·1000/(√3·U) at the reconciled nameplate ${resized.kva} kVA)`
      q[fld] = (typeof cur === 'object')
        ? { ...cur, value: fv, basis, source: `tool:${TRANSFORMER_TOOL_ID}`, source_detail: basis,
            lineage: { from: ['transformer_kva'], via: 'design-loop:e-pass-tool-re-run' } }
        : { value: fv, unit: 'A', family: 'current', basis, source: `tool:${TRANSFORMER_TOOL_ID}` }
    }
    return true
  } catch { return false }
}

/**
 * The E PASS as one callable unit (extracted so it can be run/verified standalone, without
 * Blender): read the state, re-size the incomer from the converged demand, reconcile the
 * stale incomer-kVA aliases, re-mint the transformer tool's claims (when runDir given), and
 * write the state back. Returns null when there is no converged demand to size from.
 */
export function applyEPassResize(
  statePath: string,
  opts: { runDir?: string; pyBin?: string } = {},
): { kva: number; kw: number; reconciled: ReconciledAlias[]; reMinted: boolean } | null {
  if (!existsSync(statePath)) return null
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const oc = state.orchestratorContract || {}
  const resized = resizeFromConvergedDemand(oc.quantities || {})
  if (!resized) return null
  oc.quantities = resized.quantities
  state.orchestratorContract = oc
  let reMinted = false
  const txReconciled = resized.reconciled.some(r => r.key === 'transformer_kva')
  if (txReconciled && opts.runDir) {
    reMinted = reMintTransformerToolClaims(state, opts.runDir, opts.pyBin || 'python3', resized)
  }
  writeFileSync(statePath, JSON.stringify(state))
  return { kva: resized.kva, kw: resized.kw, reconciled: resized.reconciled, reMinted }
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

  // E PASS: re-size the incomer from the converged supply demand the writeback wrote into
  // state — and reconcile the stale incomer-kVA aliases + re-mint the transformer tool's
  // claims at the same choke point (applyEPassResize; runDir = the run dir carrying
  // 4-orchestrator-tools-used.json, handed in as resizeOutDir).
  let resizedTransformerKva: number | null = null
  try {
    const eRes = applyEPassResize(statePath, { runDir: opts.resizeOutDir, pyBin: opts.pyBin })
    if (eRes) {
      resizedTransformerKva = eRes.kva
      if (eRes.reconciled.length) {
        console.error(
          `[design-loop] E pass alias reconcile: ` +
          eRes.reconciled.map(r => `${r.key} ${r.from} → ${r.to}`).join(', ') +
          `${eRes.reMinted ? ' (tool claims re-minted at the converged load)' : ''}`)
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
    // INTENT: settled parts-manifest is the GA/data placement truth. Pre-settle
    // Phase-5 bg renders (00-hero / 01-top) MUST NOT survive — generate_drawing_set
    // used to skip "00-hero.png already present" and ship a Blender plan from a
    // different generation than the GA (Codema 2026-07-14: GA≠01-top).
    // FLOW: settle copies manifest → wipe stale production views → late pass
    // re-renders hero OR promotes inspect-top as the plan (same placement as GA).
    const STALE_PRODUCTION_RENDERS = [
      '00-hero.png', '01-top.png', '02-corner-FR.png', '03-corner-BL.png',
      'blender-cover.png', 'hero-embed.png',
    ]
    for (const r of STALE_PRODUCTION_RENDERS) {
      try { rmSync(join(opts.resizeOutDir, r), { force: true }) } catch { /* absent is fine */ }
    }
  }

  return { ...settle, basePreLoopKw, converged, parasiticKw, resizedTransformerKva }
}
