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
  from_keys?: string[]   // TRACEABILITY SPINE: the upstream quantity keys this value was
                         // computed from (lineage.from), so the number is not born sourceless
  unverified_artefact?: boolean // RECONCILE BOUND (2026-07-02): the converged aggregate does
                         // NOT reconcile against the plant's connected load — it is recorded
                         // in the loop ledger as an UNVERIFIED-ARTEFACT but NEVER written as
                         // a design quantity (applyUpdates skips it; isSettled ignores it).
}

// An as-routed supply demand = plant load + distribution parasitic (pump friction + cable
// I²R). Distribution losses are a FRACTION of the plant load — a converged total more than
// this factor above the connected load is a phantom (v55: 132,599,650 kW on a 53 kW plant,
// ×2.5 million, from a corrupted 90 m³/s edge flow), never a design output that may feed
// cost / financial / drawings.
export const SUPPLY_RECONCILE_FACTOR = 3

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
  // RECONCILE BOUND (2026-07-02, the v55 total_supply_demand_kw = 1.326e8 fix): the
  // converged aggregate must reconcile against the plant's own connected electrical load
  // within SUPPLY_RECONCILE_FACTOR. v55's scrambled connection graph carried a 90 m³/s
  // phantom flow → 132.4 GW of "pump friction" → the writeback minted it as a quantity the
  // single-line / panel-schedule / Excel PREFER — shipping a 132.6 GW cover + a 201,464,029 A
  // busbar on a 53 kW plant. Beyond the bound the value is recorded in the loop ledger as
  // UNVERIFIED-ARTEFACT (durable, diagnosable) but never becomes a design quantity.
  const baseLoad = curValue(q, 'connected_electrical_load_kw')
    ?? curValue(q, 'total_electrical_demand_kw')
    ?? (Number(conv?.base_demand_kw) > 0 ? Number(conv!.base_demand_kw) : null)
  const reconciles = (v: number) => baseLoad == null || v <= baseLoad * SUPPLY_RECONCILE_FACTOR

  const converged = Number(last.total_demand_kw)
  if (Number.isFinite(converged) && converged > 0) {
    const from = curValue(q, 'total_supply_demand_kw')
    const ok = reconciles(converged)
    updates.push({
      key: 'total_supply_demand_kw', from, to: converged, unit: 'kW',
      source: 'convergence-report',
      basis: ok
        ? 'as-routed supply demand = plant load + distribution parasitic (pump friction + cable I²R); sizes the incomer/transformer — does NOT replace the brief plant-load metric'
        : `UNVERIFIED-ARTEFACT: converged ${converged} kW does not reconcile against the connected load ${baseLoad} kW (limit ×${SUPPLY_RECONCILE_FACTOR}) — a corrupted-flow phantom, NOT written as a design quantity`,
      rel_change: rel(from, converged),
      from_keys: ['connected_electrical_load_kw', 'total_electrical_demand_kw'],
      ...(ok ? {} : { unverified_artefact: true }),
    })
  }
  // 2. cooling load (converged) — only if the engine already carries the quantity; the same
  //    reconcile bound applies (v55's phantom minted 161,131 kW of "cooling" from cable I²R)
  const cool = Number(last.cooling_load_kw)
  if (Number.isFinite(cool) && cool > 0 && q.system_cooling_load_kw != null) {
    const from = curValue(q, 'system_cooling_load_kw')
    const ok = reconciles(cool)
    updates.push({
      key: 'system_cooling_load_kw', from, to: cool, unit: 'kW',
      source: 'convergence-report',
      basis: ok ? 'converged cooling load (cable I²R + process heat)'
        : `UNVERIFIED-ARTEFACT: converged cooling ${cool} kW does not reconcile against the connected load ${baseLoad} kW (limit ×${SUPPLY_RECONCILE_FACTOR}) — NOT written as a design quantity`,
      rel_change: rel(from, cool),
      ...(ok ? {} : { unverified_artefact: true }),
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

/** Settled when every APPLIED update's relative change is below tolerance. No updates ⇒ settled.
 *  An UNVERIFIED-ARTEFACT entry is never applied, so it cannot hold the loop open — it is a
 *  recorded diagnosis, not a moving quantity. */
export function isSettled(updates: QuantityUpdate[], tol = 0.005): boolean {
  return updates.filter(u => !u.unverified_artefact).every(u => u.rel_change <= tol)
}

/** Apply updates to a quantities object PURELY (returns a new object; preserves the {value,…} shape).
 *  An UNVERIFIED-ARTEFACT entry is SKIPPED — it lives in the loop ledger only, never as a
 *  design quantity that feeds cost / financial / drawings. */
export function applyUpdates(quantities: Record<string, any>, updates: QuantityUpdate[]): Record<string, any> {
  const next: Record<string, any> = { ...(quantities || {}) }
  for (const u of updates) {
    if (u.unverified_artefact) continue // recorded in the ledger, never written as a quantity
    const prev = next[u.key]
    // TRACEABILITY SPINE: carry the update's REAL source + reason + upstream inputs onto the
    // written quantity (previously hardcoded source:'design-loop' with no detail/lineage, so
    // these design-loop quantities were born sourceless). source_detail = the basis prose;
    // lineage.from = the upstream quantity keys it was computed from (when known).
    const meta = {
      source: u.source || 'design-loop',
      source_detail: u.basis,
      lineage: { from: (u.from_keys && u.from_keys.length ? u.from_keys : ['brief']), via: u.source || 'design-loop' },
    }
    if (prev != null && typeof prev === 'object') next[u.key] = { ...prev, value: u.to, ...meta }
    else next[u.key] = { value: u.to, unit: u.unit, family: 'derived', basis: u.basis, ...meta }
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
