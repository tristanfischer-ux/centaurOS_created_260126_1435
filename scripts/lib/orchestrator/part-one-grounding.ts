/**
 * scripts/lib/orchestrator/part-one-grounding.ts
 *
 * PHASE 1 of the universal-engineering build (2026-06-10) — GROUND the auto-planner.
 *
 * Turns "a composed-plan tool was SELECTED" into "its real physics is IN the
 * contract" for UNREGISTERED / novel classes, so Part 1 stops being hollow (the
 * compute_heat "9 breadcrumb flags, 0 real quantities" failure → gate 36 HOLLOW).
 *
 * The auto-planner (auto-plan-fallback.ts) historically wrote ONLY a breadcrumb
 * flag per composed tool — deliberately, because "the per-tool output mapping
 * lives in the hand-written class-plans and is only ~30% recoverable from the
 * static manifest" and a blind map risks "a mis-mapped engineering number
 * entering the contract". This module closes that gap SAFELY:
 *
 *   - It grounds ONLY the tool's DECLARED output_keys (from tool-io-manifest.json)
 *     that the tool actually produced as a FINITE NUMBER. Never an invented key,
 *     never a non-number, never a value the tool did not return.
 *   - Tool output is a FLAT object (confirmed from the hand-plan contract_updates,
 *     e.g. class-plans/ev-charger.ts:51 `output.peak_power_kw`). We read
 *     `output[output_key]` (with a `{value}` wrapper tolerance).
 *   - unit + family are inferred from the key-name SUFFIX, and ONLY for
 *     UNAMBIGUOUS suffixes (kWh, kW, kg, GBP, kV, m², …). An ambiguous/unknown
 *     suffix grounds the VALUE with NO unit claim ({unit:'', family:'dimensionless'})
 *     — a real number with an honest "unitless" tag beats a WRONG unit.
 *
 * The CALLER gates this behind UNIVERSAL_AUTO_PLAN_GROUND (default OFF) so the
 * first wire is fully reversible; flip on after a validation run. Pure (no I/O,
 * no LLM) and exhaustively unit-tested.
 */

export interface GroundedQuantityMeta {
  unit: string
  family: string
}

/**
 * Ordered most-specific-suffix FIRST so `_kwh` beats `_kw` beats `_w`, and
 * `_m_s` / `_m2` / `_m3` beat `_m`. ONLY suffixes whose unit is UNAMBIGUOUS from
 * the name are mapped — deliberately conservative. Notably ABSENT (ambiguous, so
 * they fall through to unitless rather than risk a wrong claim): bare `_m`
 * (metre vs other), `_a` (amp vs ends-in-a), `_v` (volt vs ends-in-v), `_k`
 * (kelvin vs thousands), `_s` (second vs ends-in-s), `_t` (tonne vs ends-in-t),
 * `_ms` (m/s vs millisecond).
 */
const SUFFIX_META: ReadonlyArray<readonly [RegExp, GroundedQuantityMeta]> = [
  [/_gwh$/i, { unit: 'GWh', family: 'energy_storage' }],
  [/_mwh$/i, { unit: 'MWh', family: 'energy_storage' }],
  [/_kwh$/i, { unit: 'kWh', family: 'energy_storage' }],
  [/_mw$/i, { unit: 'MW', family: 'power' }],
  [/_kw$/i, { unit: 'kW', family: 'power' }],
  [/_kva$/i, { unit: 'kVA', family: 'power' }],
  [/_kg$/i, { unit: 'kg', family: 'mass' }],
  [/_gbp$/i, { unit: '£', family: 'cost' }],
  [/_usd$/i, { unit: '$', family: 'cost' }],
  [/_eur$/i, { unit: '€', family: 'cost' }],
  [/_kv$/i, { unit: 'kV', family: 'voltage' }],
  [/_(m_s|m_per_s|mps)$/i, { unit: 'm/s', family: 'velocity' }],
  [/_(m2|m_2|sqm)$/i, { unit: 'm²', family: 'area' }],
  [/_(m3|m_3)$/i, { unit: 'm³', family: 'volume' }],
  [/_km$/i, { unit: 'km', family: 'length' }],
  [/_mm$/i, { unit: 'mm', family: 'length' }],
  [/_ghz$/i, { unit: 'GHz', family: 'frequency' }],
  [/_mhz$/i, { unit: 'MHz', family: 'frequency' }],
  [/_khz$/i, { unit: 'kHz', family: 'frequency' }],
  [/_hz$/i, { unit: 'Hz', family: 'frequency' }],
  [/_(degc|deg_c|celsius)$/i, { unit: '°C', family: 'temperature' }],
  [/_(pct|percent)$/i, { unit: '%', family: 'dimensionless' }],
  [/_(count|number)$/i, { unit: '', family: 'dimensionless' }],
]

/** Infer {unit, family} from a quantity key's suffix. Unambiguous suffixes only;
 *  anything else → {unit:'', family:'dimensionless'} (ground the value, claim no unit). */
export function inferQuantityMeta(key: string): GroundedQuantityMeta {
  for (const [rx, meta] of SUFFIX_META) {
    if (rx.test(key)) return meta
  }
  return { unit: '', family: 'dimensionless' }
}

/** Read a finite number for `key` from a tool's flat output. Tolerates a
 *  `{value:number}` wrapper. Returns null when absent / not a finite number. */
export function readFiniteNumber(output: unknown, key: string): number | null {
  if (output == null || typeof output !== 'object') return null
  const v = (output as Record<string, unknown>)[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v != null && typeof v === 'object') {
    const wrapped = (v as { value?: unknown }).value
    if (typeof wrapped === 'number' && Number.isFinite(wrapped)) return wrapped
  }
  return null
}

/**
 * Build typed contract quantities from a composed-plan tool's FLAT output, for
 * its DECLARED output_keys only, grounding ONLY finite numbers. Returns {} when
 * the tool produced no groundable outputs. The returned objects match the
 * contract Quantity shape (typed loosely as `any` so the dynamic `family` does
 * not need to satisfy the contract's family union at this seam).
 */
export function groundToolOutputs(
  toolId: string,
  declaredOutputKeys: readonly string[],
  output: unknown,
): Record<string, any> {
  const grounded: Record<string, any> = {}
  for (const key of declaredOutputKeys) {
    const value = readFiniteNumber(output, key)
    if (value == null) continue
    const meta = inferQuantityMeta(key)
    grounded[key] = {
      value,
      unit: meta.unit,
      family: meta.family,
      basis: 'typical',
      scope: 'system',
      uncertainty_pct: 25, // auto-grounded from a composed-plan tool — wide band by design
      temporal_resolution_s: null,
      condition: 'auto-grounded from composed-plan tool output (unregistered class)',
      provenance: { source: `tool:${toolId}`, tool_id: toolId, invocation_output_field: key },
    }
  }
  return grounded
}
