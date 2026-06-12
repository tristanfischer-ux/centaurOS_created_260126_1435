/**
 * writeback-bridge — the CAD→engine feedback (Increment 1 of the universal design loop;
 * see UNIVERSAL-DESIGN-LOOP-DESIGN.md, Stage D).
 *
 * The Blender layout pass already produces convergence-report.json (the parasitic-load fixed
 * point: routed pipe friction → pump kW, cable I²R → cooling kW) and route-manifest.json (every
 * routed run's measured length + diameter). Today those are computed AFTER the engine's numbers
 * lock, so they are ignored — the loop is open. This module turns them into UPDATES to the
 * engine's quantities, so a SECOND physics pass can use them and the loop closes.
 *
 * PURE: the compute functions take parsed JSON and return plain data; IO is thin wrappers.
 * UNIVERSAL: the mapping is by quantity MEANING (electrical demand, cooling, interconnect length),
 * never per-class — there is no `if co2` here, and there must not be.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface QuantityUpdate {
  key: string            // engine quantity key (orchestratorContract.quantities[key])
  from: number | null    // prior value (null if the quantity did not exist yet)
  to: number             // converged value to write
  unit: string
  source: string         // which artifact drove it
  basis: string          // human-readable reason
  rel_change: number     // |to-from| / max(|from|, eps); 1 when `from` was null
}

export interface ConvergenceReport {
  base_demand_kw?: number
  parasitic_kw?: number
  iterations?: number
  converged?: boolean
  trajectory?: Array<{ total_demand_kw?: number; cooling_load_kw?: number; feeder_current_a?: number }>
}
export interface RouteManifest {
  count?: number
  lines?: Array<{ length_m?: number; mechanism?: string; outer_dia_mm?: number }>
}

const EPS = 1e-9
function rel(from: number | null, to: number): number {
  if (from == null) return 1
  return Math.abs(to - from) / Math.max(Math.abs(from), EPS)
}

/** Sum routed length (metres) over the runs whose mechanism matches `pred`. */
export function routedLengthM(rm: RouteManifest | null, pred: (mech: string) => boolean): number {
  const lines = Array.isArray(rm?.lines) ? rm!.lines! : []
  return lines.filter(l => pred(String(l.mechanism ?? ''))).reduce((s, l) => s + (Number(l.length_m) || 0), 0)
}

function curValue(quantities: Record<string, any>, key: string): number | null {
  const q = quantities?.[key]
  if (q == null) return null
  const v = (typeof q === 'object') ? q.value : q
  return (typeof v === 'number' && Number.isFinite(v)) ? v : null
}

/**
 * Compute the engine-quantity updates from a settled Blender pass. UNIVERSAL mapping — every
 * update is ADDITIVE (a new quantity), never an overwrite of a brief metric, so applying them
 * cannot conflict with the narrative or a compliance cap:
 *  - total_supply_demand_kw       ← converged demand (plant load + distribution parasitic)
 *  - system_cooling_load_kw       ← converged cooling load (only if the engine carries it)
 *  - interconnect_pipe_length_m / interconnect_cable_length_m ← measured routed totals
 * `quantities` is orchestratorContract.quantities (each value = {value, unit, ...} or a bare number).
 */
export function computeQuantityUpdates(
  conv: ConvergenceReport | null,
  rm: RouteManifest | null,
  quantities: Record<string, any>,
): QuantityUpdate[] {
  const updates: QuantityUpdate[] = []
  const q = quantities || {}
  const traj = Array.isArray(conv?.trajectory) ? conv!.trajectory! : []
  const last = traj[traj.length - 1] || {}

  // 1. supply demand (converged) — ADDITIVE new quantity, NOT a replacement for the brief's
  //    plant-load metric. The converged total = plant load + distribution parasitic (pump
  //    friction + cable I²R); it is the SUPPLY requirement that sizes the incomer / transformer /
  //    feeder, and is correctly slightly higher than the plant load. Writing it as a NEW key
  //    avoids (a) overwriting the brief metric (connected_electrical_load_kw, which the prose +
  //    compliance cap reference) and (b) a false cap breach — so the writeback is purely additive
  //    and safe to apply without reordering the narrative.
  const converged = Number(last.total_demand_kw)
  if (Number.isFinite(converged) && converged > 0) {
    const from = curValue(q, 'total_supply_demand_kw')
    updates.push({
      key: 'total_supply_demand_kw', from, to: converged, unit: 'kW',
      source: 'convergence-report',
      basis: 'as-routed supply demand = plant load + distribution parasitic (pump friction + cable I²R); sizes the incomer/transformer — does NOT replace the brief plant-load metric',
      rel_change: rel(from, converged),
    })
  }
  // 2. cooling load (converged) — only if the engine already carries the quantity
  const cool = Number(last.cooling_load_kw)
  if (Number.isFinite(cool) && cool > 0 && q.system_cooling_load_kw != null) {
    const from = curValue(q, 'system_cooling_load_kw')
    updates.push({
      key: 'system_cooling_load_kw', from, to: cool, unit: 'kW',
      source: 'convergence-report', basis: 'converged cooling load (cable I²R + process heat)',
      rel_change: rel(from, cool),
    })
  }
  // 3. interconnect lengths (measured) — universal; feed the bill of materials + Stage F
  const pipeM = Math.round(routedLengthM(rm, m => m === 'fluid_loop' || m === 'thermal') * 10) / 10
  const cableM = Math.round(routedLengthM(rm, m => m === 'electrical_bus') * 10) / 10
  if (pipeM > 0) {
    const from = curValue(q, 'interconnect_pipe_length_m')
    updates.push({
      key: 'interconnect_pipe_length_m', from, to: pipeM, unit: 'm',
      source: 'route-manifest', basis: 'measured routed fluid + thermal pipe length',
      rel_change: rel(from, pipeM),
    })
  }
  if (cableM > 0) {
    const from = curValue(q, 'interconnect_cable_length_m')
    updates.push({
      key: 'interconnect_cable_length_m', from, to: cableM, unit: 'm',
      source: 'route-manifest', basis: 'measured routed power-bus length',
      rel_change: rel(from, cableM),
    })
  }
  return updates
}

/** Settled when every update's relative change is below tolerance. No updates ⇒ settled. */
export function isSettled(updates: QuantityUpdate[], tol = 0.005): boolean {
  return updates.every(u => u.rel_change <= tol)
}

/** Apply updates to a quantities object PURELY (returns a new object; preserves the {value,…} shape). */
export function applyUpdates(quantities: Record<string, any>, updates: QuantityUpdate[]): Record<string, any> {
  const next: Record<string, any> = { ...(quantities || {}) }
  for (const u of updates) {
    const prev = next[u.key]
    if (prev != null && typeof prev === 'object') next[u.key] = { ...prev, value: u.to }
    else next[u.key] = { value: u.to, unit: u.unit, family: 'derived', basis: u.basis, source: 'design-loop' }
  }
  return next
}

// ── the loop ledger (the honesty backbone: "settled in N passes" is READ from here) ──
export interface LoopLedgerEntry {
  pass: number
  settled: boolean
  blender_iterations?: number
  updates: QuantityUpdate[]
}
export function appendLedger(outDir: string, entry: LoopLedgerEntry): void {
  const path = join(outDir, 'design-loop-ledger.json')
  let led: { schema: string; passes: LoopLedgerEntry[] } = { schema: 'design-loop-ledger/v1', passes: [] }
  if (existsSync(path)) { try { led = JSON.parse(readFileSync(path, 'utf-8')) } catch { /* start fresh */ } }
  led.passes.push(entry)
  writeFileSync(path, JSON.stringify(led, null, 1))
}

// ── thin IO ──
export function loadJson<T>(outDir: string, name: string): T | null {
  const p = join(outDir, name)
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf-8')) as T } catch { return null }
}

/**
 * Chain-callable orchestration of ONE writeback pass: read the settled Blender artifacts from
 * `outDir`, compute the engine-quantity updates against state.orchestratorContract.quantities,
 * apply them to the state on disk, and append the loop ledger. Returns the updates + settle flag.
 * Pure-IO: no LLM. Safe no-op (returns settled:true, no updates) when artifacts are absent.
 */
export function runWritebackPass(
  statePath: string, outDir: string, opts: { pass?: number; tol?: number } = {},
): { updates: QuantityUpdate[]; settled: boolean; applied: number } {
  const conv = loadJson<ConvergenceReport>(outDir, 'convergence-report.json')
  const rm = loadJson<RouteManifest>(outDir, 'route-manifest.json')
  if (!conv && !rm) return { updates: [], settled: true, applied: 0 }   // nothing to feed back
  if (!existsSync(statePath)) return { updates: [], settled: true, applied: 0 }
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const oc = state.orchestratorContract || (state.orchestratorContract = {})
  const quantities = oc.quantities || (oc.quantities = {})
  const updates = computeQuantityUpdates(conv, rm, quantities)
  if (updates.length > 0) {
    oc.quantities = applyUpdates(quantities, updates)
    writeFileSync(statePath, JSON.stringify(state))
  }
  const settled = isSettled(updates, opts.tol ?? 0.005)
  appendLedger(outDir, { pass: opts.pass ?? 1, settled, blender_iterations: conv?.iterations, updates })
  return { updates, settled, applied: updates.length }
}
