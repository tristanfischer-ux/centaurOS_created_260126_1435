/**
 * scripts/lib/orchestrator/sizing-families/registry.ts
 *
 * SIZING-FAMILY PLUG-IN REGISTRY (ANVIL increment E2 — the wall-3 pivot).
 *
 * Replaces the single hard-wired BATTERY family in generic/sizing.ts with a
 * typed, composable plug-in layer:
 *
 *   1. REGISTRATION — one `registerSizingFamily()` call per family file
 *      (mirrors planner.ts `registerPlan`); no central switch to edit.
 *   2. SELECTION — every registered plugin scores `appliesTo(envelopeVector,
 *      classSlug)`; all plugins ≥ SIZING_FAMILY_APPLY_THRESHOLD run.
 *   3. ORDERING — Kahn topological sort over the declared `runs_after`
 *      edges (restricted to the applicable set); registration order breaks
 *      ties deterministically; a cycle is a structured DEPENDENCY_CYCLE error.
 *   4. SHARED QUANTITY NAMESPACE — plugin N sees the base contract PLUS the
 *      quantity writes of plugins 1..N-1 (read-only view; nothing is mutated
 *      until `applySizingDeltas`).
 *   5. CONFLICT RULE — a later writer touching a namespace key an earlier
 *      writer (or the base contract) already owns MUST declare it in
 *      `overrides` (exact key or 'family:<id>'), else a structured
 *      WRITE_CONFLICT error. Declared override = the later write wins.
 *   6. LOUD BOUNDARY (G6) — requiredQuantities are validated against the
 *      shared view BEFORE size() runs: missing → MISSING_REQUIRED_QUANTITY,
 *      unconvertible unit → UNIT_MISMATCH, outside valid_range →
 *      OUT_OF_RANGE. Never a silent default.
 *
 * PURITY: `runSizingFamilies` performs NO mutation — it returns deltas.
 * `applySizingDeltas` is the explicit caller-side merge (word modifiers via
 * the SAME `mergeMods` as the legacy path → BATTERY byte-identity).
 *
 * British spelling throughout.
 */

import type { ContractInProgress, TypedQuantity } from '../types'
import { convertToCanonical } from './units'
import { mergeMods } from '../generic/sizing'
import {
  SIZING_FAMILY_APPLY_THRESHOLD,
  SizingFamilyError,
  type EnvelopeVectorLike,
  type NoFitFinding,
  type SizableModule,
  type SizingDelta,
  type SizingFamilyPlugin,
  type TypedQuantityRef,
} from './types'

// ---------------------------------------------------------------------------
// REGISTRY
// ---------------------------------------------------------------------------

const _families: SizingFamilyPlugin[] = []

/** Register a sizing-family plugin (called from each family file at module
 *  load — see ./index.ts). Duplicate ids are a structured error. */
export function registerSizingFamily(plugin: SizingFamilyPlugin): void {
  if (_families.find((f) => f.family === plugin.family)) {
    throw new SizingFamilyError('DUPLICATE_FAMILY', plugin.family, `family '${plugin.family}' already registered`)
  }
  _families.push(plugin)
}

export function listSizingFamilies(): ReadonlyArray<SizingFamilyPlugin> {
  return _families
}

/** Test-only: clear the registry (mirrors planner._clearPlansForTests). */
export function _clearSizingFamiliesForTests(): void {
  _families.length = 0
}

// ---------------------------------------------------------------------------
// SELECTION + ORDERING
// ---------------------------------------------------------------------------

function applicablePlugins(
  envelopeVector: EnvelopeVectorLike | null | undefined,
  classSlug: string,
): { plugin: SizingFamilyPlugin; score: number }[] {
  const slug = String(classSlug ?? '').trim().toLowerCase()
  return _families
    .map((plugin) => ({ plugin, score: plugin.appliesTo(envelopeVector, slug) }))
    .filter((e) => e.score >= SIZING_FAMILY_APPLY_THRESHOLD)
}

/** Kahn topo-sort over runs_after edges within the applicable set; ties broken
 *  by registration order (deterministic). Cycle → DEPENDENCY_CYCLE. */
function orderByDependencies(entries: { plugin: SizingFamilyPlugin; score: number }[]): SizingFamilyPlugin[] {
  const inSet = new Set(entries.map((e) => e.plugin.family))
  const indeg = new Map<string, number>()
  const dependants = new Map<string, string[]>()
  for (const { plugin } of entries) {
    indeg.set(plugin.family, 0)
  }
  for (const { plugin } of entries) {
    for (const dep of plugin.runs_after ?? []) {
      if (!inSet.has(dep)) continue // dependency not applicable to this class → no edge
      indeg.set(plugin.family, (indeg.get(plugin.family) ?? 0) + 1)
      dependants.set(dep, [...(dependants.get(dep) ?? []), plugin.family])
    }
  }
  const order: SizingFamilyPlugin[] = []
  // registration order = order in `entries` (which preserves _families order)
  const ready = entries.filter((e) => (indeg.get(e.plugin.family) ?? 0) === 0).map((e) => e.plugin)
  const byId = new Map(entries.map((e) => [e.plugin.family, e.plugin]))
  while (ready.length > 0) {
    const next = ready.shift() as SizingFamilyPlugin
    order.push(next)
    for (const d of dependants.get(next.family) ?? []) {
      const left = (indeg.get(d) ?? 0) - 1
      indeg.set(d, left)
      if (left === 0) {
        const p = byId.get(d)
        if (p) ready.push(p)
      }
    }
    // keep deterministic: re-sort ready by registration index
    ready.sort((a, b) => _families.indexOf(a) - _families.indexOf(b))
  }
  if (order.length !== entries.length) {
    const stuck = entries.filter((e) => !order.includes(e.plugin)).map((e) => e.plugin.family)
    throw new SizingFamilyError('DEPENDENCY_CYCLE', stuck.join('+'), `runs_after cycle among applicable families: ${stuck.join(' → ')}`)
  }
  return order
}

// ---------------------------------------------------------------------------
// G6 BOUNDARY — required-quantity validation (loud, structured).
// ---------------------------------------------------------------------------

/** Resolve + validate one required quantity against a quantities view.
 *  Returns the canonical-unit value. Throws structured errors. */
export function readRequiredQuantity(
  view: Record<string, TypedQuantity | undefined>,
  ref: TypedQuantityRef,
  family: string,
): { key: string; value: number } {
  const keys = [ref.name, ...(ref.aliases ?? [])]
  const key = keys.find((k) => view[k] !== undefined && typeof view[k]?.value === 'number' && Number.isFinite(view[k]!.value))
  if (!key) {
    throw new SizingFamilyError(
      'MISSING_REQUIRED_QUANTITY',
      family,
      `required quantity '${ref.name}' (aliases: ${keys.join(', ')}) absent from the contract — refusing to size on a silent default`,
      { quantity: ref.name, expected_unit: ref.unit },
    )
  }
  const q = view[key] as TypedQuantity
  // Unit conversion at the boundary (G6) — constraint-normaliser conversion
  // table (the orchestrator member of the targetPerformanceValueAs family).
  // An empty declared unit is treated as already-canonical (legacy contracts
  // carry '' on dimensionless/implicit-unit quantities).
  const declaredUnit = String(q.unit ?? '').trim() === '' ? ref.unit : String(q.unit)
  const canonical = convertToCanonical(q.value, declaredUnit, ref.family)
  if (canonical === null) {
    throw new SizingFamilyError(
      'UNIT_MISMATCH',
      family,
      `required quantity '${key}' declared unit '${declaredUnit}' is not convertible to '${ref.unit}'`,
      { quantity: key, expected_unit: ref.unit, actual_unit: declaredUnit },
    )
  }
  const [lo, hi] = ref.valid_range
  if (canonical < lo || canonical > hi) {
    throw new SizingFamilyError(
      'OUT_OF_RANGE',
      family,
      `required quantity '${key}' = ${canonical} ${ref.unit} outside plausible range [${lo}, ${hi}] ${ref.unit}`,
      { quantity: key, expected_unit: ref.unit, valid_range: ref.valid_range, value: canonical },
    )
  }
  return { key, value: canonical }
}

// ---------------------------------------------------------------------------
// SHARED NAMESPACE + CONFLICT ACCOUNTING
// ---------------------------------------------------------------------------

function namespaceKeysOf(delta: SizingDelta): string[] {
  const keys: string[] = []
  for (const w of delta.modifier_writes) {
    for (const m of w.modifiers) keys.push(`mod:${w.path.module}.${w.path.sub_module}.${w.path.word}:${m.kind}`)
  }
  for (const qw of delta.quantity_writes) keys.push(`q:${qw.key}`)
  for (const dp of delta.derived_parameter_writes) keys.push(`dp:${dp.module}:${dp.key}`)
  return keys
}

function overrideAllows(plugin: SizingFamilyPlugin, nsKey: string, priorWriter: string): boolean {
  const decls = plugin.overrides ?? []
  return decls.includes(nsKey) || decls.includes(`family:${priorWriter}`)
}

// ---------------------------------------------------------------------------
// RUN (pure — returns deltas) + APPLY (the caller-side merge)
// ---------------------------------------------------------------------------

export interface RunSizingResult {
  /** Families that ran, in execution order. */
  applied: string[]
  /** appliesTo scores for every family that cleared the threshold. */
  scores: Record<string, number>
  deltas: SizingDelta[]
}

/**
 * Score → order → validate-boundary → size, over a shared quantity namespace.
 * PURE: neither `modules` nor `contract` is mutated. Throws SizingFamilyError
 * (structured, loud) on any boundary or composition violation.
 */
export function runSizingFamilies(
  modules: ReadonlyArray<SizableModule>,
  contract: ContractInProgress,
  brief: unknown,
  classSlug: string,
  envelopeVector?: EnvelopeVectorLike | null,
): RunSizingResult {
  const entries = applicablePlugins(envelopeVector, classSlug)
  if (entries.length === 0) return { applied: [], scores: {}, deltas: [] }
  const ordered = orderByDependencies(entries)
  const scores = Object.fromEntries(entries.map((e) => [e.plugin.family, e.score]))

  // owner of each namespace key: 'contract' for pre-existing quantity keys,
  // else the family that wrote it first in this run.
  const owner = new Map<string, string>()
  for (const k of Object.keys(contract?.quantities ?? {})) owner.set(`q:${k}`, 'contract')

  const deltas: SizingDelta[] = []
  // shared quantity view = base + accumulated plugin quantity writes
  let viewQuantities: Record<string, TypedQuantity | undefined> = { ...(contract?.quantities ?? {}) }

  for (const plugin of ordered) {
    // (a) loud boundary validation against the SHARED view (G6)
    for (const ref of plugin.requiredQuantities) {
      readRequiredQuantity(viewQuantities, ref, plugin.family)
    }
    // (b) size() over a read-only contract view carrying the shared namespace
    const contractView: ContractInProgress = { ...contract, quantities: viewQuantities as Record<string, TypedQuantity> }
    const delta = plugin.size(modules, contractView, brief)
    // (c) conflict accounting BEFORE accepting the delta
    for (const nsKey of namespaceKeysOf(delta)) {
      const prior = owner.get(nsKey)
      if (prior !== undefined && prior !== plugin.family && !overrideAllows(plugin, nsKey, prior)) {
        throw new SizingFamilyError(
          'WRITE_CONFLICT',
          plugin.family,
          `writes '${nsKey}' already owned by '${prior}' without declaring the override ` +
            `(declare '${nsKey}' or 'family:${prior}' in overrides[])`,
          { conflict_key: nsKey, prior_writer: prior },
        )
      }
      owner.set(nsKey, plugin.family)
    }
    deltas.push(delta)
    // (d) extend the shared namespace with this plugin's quantity writes
    if (delta.quantity_writes.length > 0) {
      viewQuantities = { ...viewQuantities }
      for (const qw of delta.quantity_writes) viewQuantities[qw.key] = qw.quantity
    }
  }

  return { applied: ordered.map((p) => p.family), scores, deltas }
}

/**
 * The caller-side merge. Applies deltas IN ORDER:
 *   - word modifiers via the legacy `mergeMods` (replace same-kind, append) —
 *     a later (override-declared) writer therefore wins per modifier kind;
 *   - quantity writes into contract.quantities;
 *   - derived-parameter writes onto modules[i].derived_parameters.
 *
 * @returns sized = number of DISTINCT words that received modifiers (matches
 *          the legacy applyFamilySizing count when a single family runs).
 */
export function applySizingDeltas(
  modules: SizableModule[],
  contract: ContractInProgress,
  deltas: ReadonlyArray<SizingDelta>,
): { sized: number } {
  const sizedPaths = new Set<string>()
  for (const delta of deltas) {
    for (const w of delta.modifier_writes) {
      const m = modules?.[w.path.module]
      const sm = m?.sub_modules?.[w.path.sub_module]
      const word = sm?.words?.[w.path.word]
      if (!word) continue // structurally absent — delta computed against a different tree
      mergeMods(word, w.modifiers)
      sizedPaths.add(`${w.path.module}.${w.path.sub_module}.${w.path.word}`)
    }
    for (const qw of delta.quantity_writes) {
      if (contract && contract.quantities) contract.quantities[qw.key] = qw.quantity
    }
    for (const dp of delta.derived_parameter_writes) {
      const m = modules?.[dp.module]
      if (!m) continue
      if (!m.derived_parameters || typeof m.derived_parameters !== 'object') m.derived_parameters = {}
      ;(m.derived_parameters as Record<string, unknown>)[dp.key] = dp.value
    }
  }
  return { sized: sizedPaths.size }
}

/**
 * Convenience wrapper used by generic-emitter.ts: run + merge in one call.
 * Returns the families applied + words sized for the emitter rationale,
 * plus the raw deltas (provenance ledger) for downstream recording.
 */
export function applySizingFamilies(
  modules: SizableModule[],
  contract: ContractInProgress,
  brief: unknown,
  classSlug: string,
  envelopeVector?: EnvelopeVectorLike | null,
): { families: string[]; sized: number; deltas: SizingDelta[] } {
  const run = runSizingFamilies(modules, contract, brief, classSlug, envelopeVector)
  const { sized } = applySizingDeltas(modules, contract, run.deltas)
  return { families: run.applied, sized, deltas: run.deltas }
}

/**
 * Sizing↔grounding seam (E2 item 5 — surface only, NOT wired this increment).
 * Given the grounder's no-fit findings, ask every previously-applied family
 * that implements resize() for a corrective delta. The future loop is
 * size → ground → verify → resize, capped at ≤2 rounds by the caller; after
 * that, honest-gap per G3 (never a silent mis-pin).
 */
export function resizeSizingFamilies(
  noFitFindings: ReadonlyArray<NoFitFinding>,
  modules: ReadonlyArray<SizableModule>,
  contract: ContractInProgress,
  brief: unknown,
  appliedFamilies: ReadonlyArray<string>,
): SizingDelta[] {
  const out: SizingDelta[] = []
  for (const id of appliedFamilies) {
    const plugin = _families.find((f) => f.family === id)
    if (!plugin || typeof plugin.resize !== 'function') continue
    out.push(plugin.resize(noFitFindings, modules, contract, brief))
  }
  return out
}
