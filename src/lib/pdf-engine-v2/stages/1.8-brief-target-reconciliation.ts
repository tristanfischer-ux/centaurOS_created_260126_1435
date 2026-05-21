/**
 * @file stages/1.8-brief-target-reconciliation.ts — G0.5 Brief Target Reconciliation.
 *
 * Catches the catastrophic class of failure where the LLM Generator (Step 4)
 * emits a design whose headline capacity / mass / cost is materially different
 * from what the brief asked for. Discovered 2026-05-19 council review of
 * morning chain run 92cdda58 — brief asked for 8 kW heat pump, generator
 * produced a 1 kW micro-unit, all 28 universal gates passed (because they
 * check INTERNAL consistency, not brief-vs-design), £4341 installed-ASP got
 * marketed as £1142/kW (it's actually £4341/kW for a 1 kW unit).
 *
 * The 28 universal arithmetic + grammar gates check the design is internally
 * consistent (1 kW thermal / 3.5 COP = 286 W ≈ 263 W declared electrical →
 * passes). None of them compare the design's rated_thermal_kw against the
 * brief's target_performance.value. This gate fills that gap.
 *
 * Position in chain: post-R4 (Phase 1 complete) + post end-of-Phase-1
 * normalisation (dedup + prose pre-fill) + canonical product_class override,
 * BEFORE Phase 2 repair loop starts. Rationale: if the design is off-scale,
 * no amount of Phase 2 patching will fix the SCALE — Phase 2 patches modifier
 * conflicts + missing cross-links, not numeric magnitude. Catching at
 * post-R4 saves up to 18 iters of wasted repair LLM calls.
 *
 * Verdict semantics:
 *   PASS — every brief target either has a matching design field within
 *          [0.7×, 1.3×] OR is absent from design.derived_parameters (gate
 *          can't compare what isn't there; reported as 'unable_to_compare'
 *          in details).
 *   WARN — at least one target outside [0.7, 1.3] but inside [0.3, 3.0].
 *          Chain continues; result routed to design decisions for human
 *          review. Renderer surfaces a manual-review badge.
 *   HALT — at least one target outside [0.3, 3.0] (e.g. 8 kW brief vs 1 kW
 *          design = 0.125× ratio). Chain exits process with code 3 — no
 *          amount of Phase 2 can rescue this; founder must re-submit with
 *          a brief the Generator can correctly interpret OR we need to
 *          investigate why Generator misread the brief.
 *
 * Cost: ZERO LLM tokens. Pure deterministic comparison.
 *
 * Output shape:
 *   {
 *     verdict: 'PASS' | 'WARN' | 'HALT',
 *     mismatches: Array<{
 *       target_field: string,           // e.g. 'target_performance_value'
 *       target_value: number,
 *       target_unit: string | null,
 *       design_field: string,            // e.g. 'rated_thermal_kw'
 *       design_value: number,
 *       ratio: number,                   // design / target
 *       severity: 'warn' | 'halt',
 *       note: string,
 *     }>,
 *     comparisons_made: number,
 *     unable_to_compare: string[],       // target fields with no design match
 *     ts: string,
 *   }
 */

import type { ModuleSpec } from '../types/module-decomposition'

export type ReconciliationVerdict = 'PASS' | 'WARN' | 'HALT'

export interface ReconciliationMismatch {
  target_field: string
  target_value: number
  target_unit: string | null
  design_field: string
  design_value: number
  ratio: number
  severity: 'warn' | 'halt'
  note: string
}

export interface ReconciliationResult {
  verdict: ReconciliationVerdict
  mismatches: ReconciliationMismatch[]
  comparisons_made: number
  unable_to_compare: string[]
  ts: string
}

interface TargetSpec {
  /** Field path in parsedBrief.constraints. */
  brief_key: string
  /** Default unit string (used in note text when brief doesn't provide one). */
  unit: string
  /**
   * Unit family the spec applies to. When set, the gate ONLY runs the
   * comparison if the brief's declared unit belongs to this family. This
   * is what stops e.g. HAPS endurance ("90 days") being compared against
   * an engine's rated_power_kw ("0.1 kW") — third hit of the unit-family
   * bug pattern (BESS Physics Repair + briefConstraintPropagationGate
   * were the prior two). Omit for class-agnostic specs whose brief_key
   * uniquely encodes the family (max_mass_kg, unit_cost_ceiling_gbp).
   */
  brief_unit_family?: 'power' | 'energy' | 'mass' | 'time' | 'photon_flux_density' | 'area' | 'currency' | 'length'
  /** Candidate field names in design.modules[].derived_parameters (any match counts). */
  design_keys: string[]
  /** Whether to apply unit conversion. Default: identity. */
  scale_to_design?: number
}

// Targets the gate compares. New product classes add entries here.
// Note: each entry MUST have unambiguous units. The chain's brief parser
// usually emits `{value: number, unit: string}` shape under
// parsedBrief.constraints.target_performance / max_mass_kg / etc.
//
// 2026-05-21 (HAPS unit-family forensic): target_performance is polymorphic
// across product classes — heat pump = kW thermal, BESS = kWh energy,
// HAPS = days endurance, VF = μmol/m²/s PPFD, drone = minutes flight time.
// The pre-existing single-row spec hardcoded `unit: 'kW'` and false-matched
// HAPS endurance "90 days" against rated_power_kw "0.1 kW" → ratio 0.001
// → HALT, exiting the chain with exit code 3 before any PDF could render.
// Per-family rows + brief_unit_family gating fixes this; new classes add
// a row without touching the comparison loop.
const TARGET_RECONCILIATIONS: TargetSpec[] = [
  // Thermal/electrical power (heat pump, chiller, BESS PCS, bioreactor)
  {
    brief_key: 'target_performance',
    unit: 'kW',
    brief_unit_family: 'power',
    design_keys: ['rated_thermal_kw', 'thermal_capacity_kw', 'heat_output_kw', 'rated_power_kw', 'capacity_kw'],
  },
  // Energy capacity (BESS, EV battery, HAPS battery pack)
  {
    brief_key: 'target_performance',
    unit: 'kWh',
    brief_unit_family: 'energy',
    design_keys: ['capacity_kwh', 'usable_capacity_kwh', 'total_capacity_kwh', 'nameplate_capacity_kwh', 'capacity_kwh_total', 'capacity_kwh_gross'],
  },
  // Endurance / mission duration (HAPS, long-endurance UAV, autonomous underwater vehicle)
  {
    brief_key: 'target_performance',
    unit: 'days',
    brief_unit_family: 'time',
    design_keys: ['endurance_days', 'mission_duration_days', 'flight_endurance_days', 'station_keeping_days'],
  },
  // Photon-flux density (vertical farm, greenhouse, controlled-environment agriculture)
  {
    brief_key: 'target_performance',
    unit: 'umol/m2/s',
    brief_unit_family: 'photon_flux_density',
    design_keys: ['ppfd_umol_m2_s', 'target_ppfd_umol_m2_s', 'photon_flux_umol_per_m2_s'],
  },
  // Growing area (vertical farm canopy area)
  {
    brief_key: 'target_performance',
    unit: 'm2',
    brief_unit_family: 'area',
    design_keys: ['canopy_area_m2', 'growing_area_m2', 'target_canopy_area_m2'],
  },
  // Yield / throughput (vertical farm tonnes/year, bioreactor litres/day)
  // Skipped for now — yield is class-specific and rarely lands in derived_parameters
  // under a stable key. Revisit when bioreactor/VF physics ledgers stabilise.
  //
  // Capacity in kWh (legacy brief shape — explicit field, not via target_performance)
  {
    brief_key: 'capacity_kwh',
    unit: 'kWh',
    brief_unit_family: 'energy',
    design_keys: ['capacity_kwh_total', 'capacity_kwh_gross', 'capacity_kwh_nameplate', 'nameplate_capacity_kwh'],
  },
  // Mass budget — universal
  {
    brief_key: 'max_mass_kg',
    unit: 'kg',
    brief_unit_family: 'mass',
    design_keys: ['max_mass_kg', 'gross_mass_kg', 'mass_limit_kg', 'mass_kg', 'system_mass_kg'],
  },
  // Unit cost — universal
  {
    brief_key: 'unit_cost_ceiling_gbp',
    unit: 'GBP',
    brief_unit_family: 'currency',
    design_keys: ['unit_cost_ceiling_gbp', 'target_unit_cost_gbp', 'cost_ceiling_gbp', 'oem_cost_target_gbp'],
  },
  // Production volume — informational, no design counterpart but worth logging
  // Skipped from comparison since design doesn't carry production volume.
]

/**
 * Map a brief's declared unit string to a unit family. Used to gate
 * target_performance comparisons so e.g. HAPS endurance "days" doesn't
 * false-match against an engine kW spec. Returns null for unknown units —
 * caller should fall back to legacy non-family-aware behaviour (so legacy
 * briefs that omit the unit field still get compared).
 */
function classifyBriefUnitFamily(rawUnit: string | null | undefined): TargetSpec['brief_unit_family'] | null {
  if (!rawUnit) return null
  const u = String(rawUnit).toLowerCase().trim()
  if (['wh', 'kwh', 'mwh', 'gwh'].includes(u)) return 'energy'
  if (['w', 'kw', 'mw', 'gw'].includes(u)) return 'power'
  if (['g', 'kg', 't', 'tonne', 'tonnes'].includes(u)) return 'mass'
  if (['s', 'sec', 'second', 'seconds', 'min', 'minute', 'minutes', 'h', 'hr', 'hour', 'hours', 'day', 'days', 'wk', 'week', 'weeks', 'month', 'months', 'yr', 'year', 'years'].includes(u)) return 'time'
  if (['umol/m2/s', 'μmol/m²/s', 'umol/m^2/s'].includes(u) || u.includes('ppfd')) return 'photon_flux_density'
  if (['cm2', 'm2', 'ha', 'sqm', 'sqft'].includes(u) || u.includes('m²')) return 'area'
  if (['gbp', 'eur', 'usd', '£', '$', '€'].includes(u)) return 'currency'
  if (['mm', 'cm', 'm', 'km'].includes(u)) return 'length'
  return null
}

function readBriefValue(parsedBrief: any, key: string): { value: number; unit: string | null } | null {
  if (!parsedBrief || typeof parsedBrief !== 'object') return null
  const c = parsedBrief.constraints ?? parsedBrief ?? {}
  const field = c[key]
  if (!field) return null
  // Two emission shapes: {value, unit} or bare number.
  if (typeof field === 'object' && field !== null) {
    const v = Number(field.value ?? field.amount ?? field.target ?? NaN)
    const u = typeof field.unit === 'string' ? field.unit : null
    if (Number.isFinite(v) && v > 0) return { value: v, unit: u }
  } else if (typeof field === 'number' && Number.isFinite(field) && field > 0) {
    return { value: field, unit: null }
  } else if (typeof field === 'string') {
    // Try to parse leading number out of "8 kW" / "8kW" / "8".
    const m = field.match(/(\d[\d,]*\.?\d*)/)
    if (m) {
      const v = parseFloat(m[1].replace(/,/g, ''))
      if (Number.isFinite(v) && v > 0) {
        const unitMatch = field.match(/[a-zA-Z]+$/)
        return { value: v, unit: unitMatch ? unitMatch[0] : null }
      }
    }
  }
  return null
}

/** Find a numeric design field across all modules' derived_parameters. */
function findDesignValue(
  modules: ModuleSpec[],
  candidateKeys: string[],
): { value: number; module: string; key: string } | null {
  for (const m of modules ?? []) {
    const dp = m.derived_parameters as Record<string, number | string> | undefined
    if (!dp) continue
    for (const k of candidateKeys) {
      const v = dp[k]
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        return { value: v, module: m.module, key: k }
      }
      if (typeof v === 'string') {
        const m2 = v.match(/(\d[\d,]*\.?\d*)/)
        if (m2) {
          const n = parseFloat(m2[1].replace(/,/g, ''))
          if (Number.isFinite(n) && n > 0) {
            return { value: n, module: m.module, key: k }
          }
        }
      }
    }
  }
  return null
}

/**
 * Main entrypoint. Synchronous, deterministic, zero-LLM.
 *
 * @param parsedBrief — output of runBriefParsing (typically state.brief.parsed_revised or parsed_original)
 * @param design — the design object after Phase 1 + canonical product_class override + normalisation
 */
export function runBriefTargetReconciliation(
  parsedBrief: any,
  design: { modules?: ModuleSpec[] } | any,
): ReconciliationResult {
  const ts = new Date().toISOString()
  const mismatches: ReconciliationMismatch[] = []
  const unableToCompare: string[] = []
  let comparisonsMade = 0

  const modules: ModuleSpec[] = Array.isArray(design?.modules) ? design.modules : []

  for (const spec of TARGET_RECONCILIATIONS) {
    const briefVal = readBriefValue(parsedBrief, spec.brief_key)
    if (!briefVal) {
      // Brief didn't specify this target — not a comparison opportunity.
      continue
    }
    // Unit-family gate (2026-05-21 HAPS forensic): if the spec declares a
    // brief_unit_family and the brief's declared unit belongs to a
    // different family, skip this spec — it's a polymorphic brief_key
    // (e.g. target_performance) and this spec row doesn't apply to this
    // brief's class. Without this check, a "90 days" endurance brief was
    // false-matched against a kW power spec and the chain halted.
    if (spec.brief_unit_family && briefVal.unit) {
      const briefFamily = classifyBriefUnitFamily(briefVal.unit)
      if (briefFamily && briefFamily !== spec.brief_unit_family) {
        // Brief unit is in a known family that doesn't match this spec.
        // Silently skip — another spec row will pick it up.
        continue
      }
    }
    const designVal = findDesignValue(modules, spec.design_keys)
    if (!designVal) {
      unableToCompare.push(`${spec.brief_key} (${briefVal.value} ${briefVal.unit ?? spec.unit}) — no matching design field in ${spec.design_keys.join('/')}`)
      continue
    }
    comparisonsMade += 1

    const tv = briefVal.value
    const dv = designVal.value
    const ratio = dv / tv

    // Tolerance bands:
    //   [0.7, 1.3]   PASS — within ±30%
    //   [0.3, 3.0]   WARN — within 3.3× either direction
    //   outside      HALT — material scale mismatch (e.g. 8× off → ratio 0.125 or 8)
    let severity: 'warn' | 'halt' | null = null
    if (ratio < 0.3 || ratio > 3.0) {
      severity = 'halt'
    } else if (ratio < 0.7 || ratio > 1.3) {
      severity = 'warn'
    }

    if (severity) {
      const direction = ratio < 1 ? 'UNDER' : 'OVER'
      const pctOff = Math.abs((ratio - 1) * 100)
      mismatches.push({
        target_field: spec.brief_key,
        target_value: tv,
        target_unit: briefVal.unit ?? spec.unit,
        design_field: `${designVal.module}.${designVal.key}`,
        design_value: dv,
        ratio: Math.round(ratio * 1000) / 1000,
        severity,
        note: `Brief target ${tv} ${briefVal.unit ?? spec.unit} vs design ${dv} ${spec.unit} (${direction} by ${pctOff.toFixed(0)}%, ratio ${ratio.toFixed(3)}). ${severity === 'halt' ? 'HALT — Phase 2 cannot fix scale mismatches; design re-emit required.' : 'WARN — surfaces as design decision; Phase 2 may converge.'}`,
      })
    }
  }

  let verdict: ReconciliationVerdict = 'PASS'
  if (mismatches.some(m => m.severity === 'halt')) verdict = 'HALT'
  else if (mismatches.length > 0) verdict = 'WARN'

  return {
    verdict,
    mismatches,
    comparisons_made: comparisonsMade,
    unable_to_compare: unableToCompare,
    ts,
  }
}
