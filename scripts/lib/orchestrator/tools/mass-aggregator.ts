/**
 * scripts/lib/orchestrator/tools/mass-aggregator.ts
 *
 * Build #18q — pure-TS mass aggregator. Sums tool-derived component
 * masses against the brief's max_mass_kg envelope; recommends a
 * container count if the breach exceeds 0%.
 *
 * Loop 22 physics critic flagged 'total system mass exceeds 28,000 kg
 * by 42%'. That was a HEAD-level violation: the LLM emission layer
 * picked a single-container layout even though the cells alone
 * (26.5t) consumed 95% of the budget. The orchestrator computed
 * cell_count + transformer_mass but never summed them.
 *
 * This tool runs LAST (no other tools depend on it). Its outputs are
 * total_system_mass_kg + mass_budget_breach_kg + recommended_container_count.
 * The narrator surfaces these to the reviewer LLM; the consistency
 * verifier can enforce `recommended_container_count <= 1` as a hard
 * gate.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'

export interface MassAggregatorInput {
  /** BESS-path cell mass. OPTIONAL for non-BESS classes (defaults to 0); a
   *  novel class with no battery cells simply omits it and feeds its own
   *  principal-equipment masses via the generic `*_mass_kg` inputs /
   *  `component_masses_kg[]` below. */
  total_cell_mass_kg?: number
  transformer_mass_kg?: number | null
  /** BESS rack count. OPTIONAL (defaults to 0 → no rack-mass contribution). */
  rack_count?: number
  max_mass_kg_envelope: number  // brief constraint
  /** Estimated PCS mass — Sungrow SC1000UD-MV ≈ 1800 kg for 1 MVA class.
   *  OPTIONAL (defaults to 0 for non-BESS classes). */
  pcs_mass_kg_estimate?: number
  /** 40-ft ISO container tare weight per ISO 668 — 3700-4200 kg empirical.
   *  OPTIONAL (defaults to 0 for non-containerised classes). */
  container_tare_kg_estimate?: number
  /** Steel battery rack typical 130-180 kg per rack (depends on cell qty).
   *  OPTIONAL (defaults to 0). */
  rack_mass_kg_each_estimate?: number
  /**
   * UNIVERSAL component-mass list (2026-06-14). Any class — registered or
   * bootstrapped on-the-fly — can sum its principal-equipment masses here
   * WITHOUT the BESS cell/rack/container schema. Each entry is a component mass
   * in kg; they are ADDED to the total. This is what lets the on-the-fly
   * tool-plan bootstrap wire each sizing tool's mass output (e.g. a tank shell
   * mass, a pump skid mass) straight into the whole-system mass producer.
   */
  component_masses_kg?: number[]
  /**
   * BESS L4 (2026-05-24): authoritative container count from the
   * engineering contract. When present (>0), the aggregator's split
   * recommendation is overridden in favour of the contract value AND the
   * "MUST split" warning is downgraded to an informational note explaining
   * the trade-off. Use when the brief envelope is genuinely over-constrained
   * and the contract has documented the deliberate shortfall via
   * brief_target_feasibility=0. Set to null/undefined to use the default
   * mass-budget heuristic.
   */
  container_count_authoritative?: number | null
  /** Brief-target feasibility (1=met, 0=accepted shortfall). Informational
   *  context for the warning text only — does not change container_count. */
  brief_target_feasibility?: number | null
  /**
   * FIELD-ERECTED PLANT (2026-06-05, e_fuel_synthesis / process-plant fix).
   * When true, the product is a FIXED INSTALLATION (a Power-to-Liquid SAF plant,
   * a CO₂ mineralisation / DAC / SMR / electrolyser plant) assembled on site, NOT
   * a containerised product. There is NO plant-wide gross-mass cap: the equipment
   * arrives as modular skids + field-erected columns, each within road-transport
   * limits. With this set, the aggregator:
   *   - reports total_system_mass_kg as INFORMATIONAL "site mass",
   *   - sets recommended_container_count = null (a plant is not containerised),
   *   - does NOT compute a containerised mass_budget_utilisation against the
   *     `max_mass_kg_envelope` cap (that cap is a per-skid road limit here, not a
   *     plant-wide cap), and
   *   - instead checks each SUPPLIED MASS BUCKET against the standard road-
   *     transport abnormal-load limit (~44,000 kg) and flags any single skid /
   *     bucket that would exceed it.
   */
  field_erected?: boolean
  /**
   * Standard road-transport abnormal-load gross-mass limit (kg) used for the
   * per-skid check when field_erected is true. Defaults to 44,000 kg (typical UK
   * STGO / abnormal-load articulated combination). Override per jurisdiction.
   */
  road_transport_limit_kg?: number
}

export interface MassAggregatorOutput {
  total_system_mass_kg: number
  cell_mass_kg: number
  transformer_mass_kg: number
  pcs_mass_kg: number
  rack_total_mass_kg: number
  container_tare_kg: number
  /** Difference from max envelope; positive = breach. 0 for a field-erected plant
   *  (no plant-wide cap to breach). */
  mass_budget_breach_kg: number
  /** Ratio used (0.0..1.0+). 0.95 = good; >1.0 = over. 0 for a field-erected
   *  plant (no containerised utilisation is computed). */
  mass_budget_utilisation_pct: number
  /** Round-up of total mass / max envelope. 1 = single container OK; ≥2 = MUST
   *  split. NULL for a field-erected plant — a fixed installation is not
   *  containerised, so a container count is meaningless. */
  recommended_container_count: number | null
  /** Per-container mass if split into the recommended count. 0 for a
   *  field-erected plant (no container split). */
  per_container_mass_kg: number
  /** FIELD-ERECTED ONLY: total plant mass surfaced as informational "site mass"
   *  (kg). Equal to total_system_mass_kg; named separately so a consumer can show
   *  it as site mass rather than a containerised budget. undefined when the
   *  product is containerised. */
  site_mass_kg?: number
  /** FIELD-ERECTED ONLY: true when no single supplied mass bucket exceeds the
   *  road-transport abnormal-load limit (every skid is road-transportable).
   *  undefined when the product is containerised. */
  all_skids_road_transportable?: boolean
}

/** Coerce a possibly-undefined/null/NaN numeric input to a finite number (0
 *  otherwise). Lets the BESS-path buckets default to 0 for non-BESS classes
 *  without producing NaN. */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

// Input keys ALREADY summed on the BESS path (do NOT double-count them in the
// generic sweep). rack_count + rack_mass_kg_each_estimate combine into the rack
// total, so both are excluded here.
const BESS_PATH_MASS_KEYS = new Set<string>([
  'total_cell_mass_kg',
  'transformer_mass_kg',
  'pcs_mass_kg_estimate',
  'container_tare_kg_estimate',
  'rack_mass_kg_each_estimate',
])

// Mass-NAMED keys that are NOT components to add — they are envelopes/caps or
// pre-summed TOTALS. Adding any of these would double-count or corrupt the sum.
// (e.g. a class plan that passes `total_mass_kg`/`system_mass_with_external_kg`
// as an already-aggregated figure, or `max_mass_kg`/`brief_mass_cap_kg` caps.)
const NON_COMPONENT_MASS_KEYS = new Set<string>([
  'max_mass_kg_envelope',
  'max_mass_kg',
  'brief_mass_cap_kg',
  'road_transport_limit_kg',
  'total_mass_kg',
  'total_system_mass_kg',
  'total_estimated_mass_kg',
  'system_mass_with_external_kg',
  'in_container_mass_kg',
])

/** True when `key` is a per-COMPONENT mass input that is neither a BESS-path
 *  bucket nor a total/envelope. Recognised suffixes: `_mass_kg`, `_mass_g`, and
 *  `biomass_kg` (e.g. standing_biomass_kg — the live fish, the dominant mass in
 *  a RAS farm). `_weight_kg` is deliberately NOT recognised: it usually denotes
 *  a per-UNIT weight (e.g. harvest_weight_kg = 3.4 kg/fish), not a system mass. */
function isGenericComponentMassKey(key: string): boolean {
  if (BESS_PATH_MASS_KEYS.has(key) || NON_COMPONENT_MASS_KEYS.has(key)) return false
  return key.endsWith('_mass_kg') || key.endsWith('_mass_g') || key.endsWith('biomass_kg')
}

/** The generic component buckets {label,kg} a class (esp. an on-the-fly
 *  bootstrapped plan) wired as component-mass inputs, PLUS each entry of the
 *  explicit `component_masses_kg[]` array. Only a `_mass_g` suffix is grams. */
function genericComponentBuckets(input: MassAggregatorInput): Array<{ label: string; kg: number }> {
  const buckets: Array<{ label: string; kg: number }> = []
  for (const [key, value] of Object.entries(input as unknown as Record<string, unknown>)) {
    if (!isGenericComponentMassKey(key)) continue
    const kg = key.endsWith('_mass_g') ? num(value) / 1000 : num(value)
    if (kg > 0) buckets.push({ label: key.replace(/_mass_(kg|g)$|biomass_kg$/, '').replace(/_/g, ' ') || key, kg })
  }
  const list = Array.isArray(input.component_masses_kg) ? input.component_masses_kg : []
  list.forEach((m, i) => { const kg = num(m); if (kg > 0) buckets.push({ label: `component ${i + 1}`, kg }) })
  return buckets
}

/** Sum of every generic component mass (the universal path). 0 for a BESS plan
 *  (it passes only the named BESS-path fields), so the registered path is
 *  byte-identical to the pre-2026-06-14 behaviour. */
function sumGenericComponentMasses(input: MassAggregatorInput): number {
  return genericComponentBuckets(input).reduce((acc, b) => acc + b.kg, 0)
}

export const massAggregator: Tool<MassAggregatorInput, MassAggregatorOutput> = {
  id: 'mass-aggregator:envelope-check',
  name: 'Mass Budget Aggregator',
  version: '1.0.0',
  license: 'free-proprietary',  // ForgeOS internal tool, no external dependency
  source_url: 'internal://forgeos/orchestrator',
  domain: 'mechanical',  // mass + envelope check is a mechanical-domain concern
  pinned_environment: { algorithm: 'iso-668-container-tare-2024' },
  applicable_to() {
    return true  // every class benefits from a mass-budget check
  },
  async invoke(input: MassAggregatorInput): Promise<ToolResult<MassAggregatorOutput>> {
    const t0 = Date.now()
    // BESS-path buckets — DEFAULTING TO 0 so a non-BESS class can omit them.
    // For a registered BESS plan every one is supplied (cells/rack/PCS/tare),
    // so the sum below is byte-identical to the pre-2026-06-14 behaviour; the
    // `?? 0` only changes the result for classes that never passed these fields
    // (which previously produced NaN — undefined + number).
    const total_cell_mass_kg = num(input.total_cell_mass_kg)
    const transformer_mass_kg = num(input.transformer_mass_kg)
    const pcs_mass_kg_estimate = num(input.pcs_mass_kg_estimate)
    const container_tare_kg_estimate = num(input.container_tare_kg_estimate)
    const rack_total_mass_kg = num(input.rack_count) * num(input.rack_mass_kg_each_estimate)
    // UNIVERSAL generic component-mass sum (2026-06-14): any OTHER `*_mass_kg` /
    // `*_mass_g` input key NOT already counted on the BESS path, plus the
    // explicit `component_masses_kg[]` list. This makes the tool produce a real
    // `total_system_mass_kg` for ANY class — the bootstrap wires each sizing
    // tool's mass output into one of these buckets. For a BESS plan this is 0
    // (it passes only the named BESS-path fields), so the registered path is
    // unaffected.
    const extra_component_mass_kg = sumGenericComponentMasses(input)
    const total_system_mass_kg = (
      total_cell_mass_kg
      + transformer_mass_kg
      + pcs_mass_kg_estimate
      + rack_total_mass_kg
      + container_tare_kg_estimate
      + extra_component_mass_kg
    )

    // FIELD-ERECTED PLANT (2026-06-05): a fixed installation, not a containerised
    // product. There is NO plant-wide gross-mass cap to breach — report the total
    // as informational SITE MASS, set the container count to null, skip the
    // containerised utilisation, and instead check each supplied mass bucket
    // against the road-transport abnormal-load limit so a genuine "won't fit on a
    // truck" skid is still flagged.
    if (input.field_erected) {
      const roadLimit = (typeof input.road_transport_limit_kg === 'number' && input.road_transport_limit_kg > 0)
        ? input.road_transport_limit_kg
        : 44000 // UK STGO / abnormal-load articulated combination, kg
      // Treat each supplied bucket as a candidate skid / single field-erected
      // item. rack_total_mass_kg is the supports/saddles aggregate; the largest
      // single shell mass is approximated by rack_mass_kg_each (per-vessel saddle
      // + shell). We check the buckets that represent transportable single items.
      const skidBuckets: Array<{ label: string; kg: number }> = [
        { label: 'process equipment skid', kg: total_cell_mass_kg },
        { label: 'compressors / pumps / drives skid', kg: pcs_mass_kg_estimate },
        { label: 'transformer', kg: transformer_mass_kg },
        { label: 'skid frame + bunding', kg: container_tare_kg_estimate },
        { label: 'largest vessel + saddle', kg: num(input.rack_mass_kg_each_estimate) },
        // UNIVERSAL: each generically-wired principal-equipment mass is also a
        // candidate single field-erected item to road-transport-check.
        ...genericComponentBuckets(input),
      ]
      const overweight = skidBuckets.filter((b) => b.kg > roadLimit)
      const all_skids_road_transportable = overweight.length === 0

      const warnings: string[] = []
      if (!all_skids_road_transportable) {
        for (const b of overweight) {
          warnings.push(`Field-erected plant: the ${b.label} (${Math.round(b.kg)} kg) exceeds the ${roadLimit} kg road-transport abnormal-load limit — split it into sub-skids or ship as field-erected segments.`)
        }
      } else {
        warnings.push(`Field-erected plant: site mass ${Math.round(total_system_mass_kg)} kg is informational (a fixed installation, not a containerised product — no plant-wide gross-mass cap applies). Every modular skid / vessel is within the ${roadLimit} kg road-transport limit.`)
      }

      const out: MassAggregatorOutput = {
        total_system_mass_kg: Math.round(total_system_mass_kg * 10) / 10,
        cell_mass_kg: Math.round(total_cell_mass_kg * 10) / 10,
        transformer_mass_kg: Math.round(transformer_mass_kg * 10) / 10,
        pcs_mass_kg: Math.round(pcs_mass_kg_estimate * 10) / 10,
        rack_total_mass_kg: Math.round(rack_total_mass_kg * 10) / 10,
        container_tare_kg: Math.round(container_tare_kg_estimate * 10) / 10,
        mass_budget_breach_kg: 0,
        mass_budget_utilisation_pct: 0,
        recommended_container_count: null,
        per_container_mass_kg: 0,
        site_mass_kg: Math.round(total_system_mass_kg * 10) / 10,
        all_skids_road_transportable,
      }
      return {
        ok: true,
        output: out,
        provenance: {
          source: 'tool:mass-aggregator:envelope-check',
          tool_id: 'mass-aggregator:envelope-check',
          tool_version: '1.0.0',
          tool_license: 'free-proprietary',
          tool_source_url: 'internal://forgeos/orchestrator',
          invocation_input: input,
          pinned_versions: { algorithm: 'iso-668-container-tare-2024' },
          timestamp: new Date(0).toISOString(),
          duration_ms: Date.now() - t0,
        },
        warnings,
      }
    }

    const mass_budget_breach_kg = total_system_mass_kg - input.max_mass_kg_envelope
    const mass_budget_utilisation_pct = (total_system_mass_kg / Math.max(1, input.max_mass_kg_envelope)) * 100
    const heuristic_container_count = Math.max(1, Math.ceil(total_system_mass_kg / Math.max(1, input.max_mass_kg_envelope)))
    // BESS L4 (2026-05-24): authoritative container count from contract wins
    // when present and > 0. Closes physics-critic L3 issue #4 where the
    // mass-aggregator's "MUST split" recommendation was triggering the
    // Generator/emitter chain to produce 2-container designs even after the
    // engineering contract had explicitly chosen single-container (with
    // brief_target_feasibility=0 documenting the accepted shortfall). The
    // heuristic remains visible in the warning text for diagnostic transparency.
    const contract_container_count = (input.container_count_authoritative ?? 0) > 0
      ? Math.max(1, Math.floor(input.container_count_authoritative as number))
      : null
    const recommended_container_count = contract_container_count ?? heuristic_container_count
    const per_container_mass_kg = total_system_mass_kg / recommended_container_count

    const warnings: string[] = []
    if (contract_container_count !== null && mass_budget_breach_kg > 0) {
      // Contract overrode the heuristic — describe the trade-off rather than
      // demanding a split that violates the brief's single-container envelope.
      const feasibilityNote = input.brief_target_feasibility === 0
        ? '; brief_target_feasibility=0 (capacity shortfall documented in contract closure)'
        : ''
      warnings.push(`Mass-aggregator heuristic suggested ${heuristic_container_count} containers (total ${Math.round(total_system_mass_kg)} kg > envelope ${input.max_mass_kg_envelope} kg by ${Math.round(mass_budget_breach_kg)} kg) but engineering contract has authoritatively chosen ${recommended_container_count} container(s) per the brief's single-container envelope${feasibilityNote}. Honour contract.`)
    } else if (mass_budget_breach_kg > 0) {
      warnings.push(`Mass budget breach: total ${Math.round(total_system_mass_kg)} kg > envelope ${input.max_mass_kg_envelope} kg by ${Math.round(mass_budget_breach_kg)} kg. Design MUST split into ${recommended_container_count} road-transportable containers (per_container ≈ ${Math.round(per_container_mass_kg)} kg each).`)
    } else if (mass_budget_utilisation_pct > 90) {
      warnings.push(`Mass budget tight: ${mass_budget_utilisation_pct.toFixed(1)}% utilised. Consider splitting into 2 containers for transport-stress and balance.`)
    }

    const out: MassAggregatorOutput = {
      total_system_mass_kg: Math.round(total_system_mass_kg * 10) / 10,
      cell_mass_kg: Math.round(total_cell_mass_kg * 10) / 10,
      transformer_mass_kg: Math.round(transformer_mass_kg * 10) / 10,
      pcs_mass_kg: Math.round(pcs_mass_kg_estimate * 10) / 10,
      rack_total_mass_kg: Math.round(rack_total_mass_kg * 10) / 10,
      container_tare_kg: Math.round(container_tare_kg_estimate * 10) / 10,
      mass_budget_breach_kg: Math.round(mass_budget_breach_kg * 10) / 10,
      mass_budget_utilisation_pct: Math.round(mass_budget_utilisation_pct * 10) / 10,
      recommended_container_count,
      per_container_mass_kg: Math.round(per_container_mass_kg * 10) / 10,
    }
    return {
      ok: true,
      output: out,
      provenance: {
        source: 'tool:mass-aggregator:envelope-check',
        tool_id: 'mass-aggregator:envelope-check',
        tool_version: '1.0.0',
        tool_license: 'free-proprietary',
        tool_source_url: 'internal://forgeos/orchestrator',
        invocation_input: input,
        pinned_versions: { algorithm: 'iso-668-container-tare-2024' },
        timestamp: new Date(0).toISOString(),
        duration_ms: Date.now() - t0,
      },
      warnings,
    }
  },
}
registerTool(massAggregator)
