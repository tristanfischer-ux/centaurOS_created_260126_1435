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
  total_cell_mass_kg: number
  transformer_mass_kg: number | null
  rack_count: number
  max_mass_kg_envelope: number  // brief constraint
  /** Estimated PCS mass — Sungrow SC1000UD-MV ≈ 1800 kg for 1 MVA class. */
  pcs_mass_kg_estimate: number
  /** 40-ft ISO container tare weight per ISO 668 — 3700-4200 kg empirical. */
  container_tare_kg_estimate: number
  /** Steel battery rack typical 130-180 kg per rack (depends on cell qty). */
  rack_mass_kg_each_estimate: number
}

export interface MassAggregatorOutput {
  total_system_mass_kg: number
  cell_mass_kg: number
  transformer_mass_kg: number
  pcs_mass_kg: number
  rack_total_mass_kg: number
  container_tare_kg: number
  /** Difference from max envelope; positive = breach. */
  mass_budget_breach_kg: number
  /** Ratio used (0.0..1.0+). 0.95 = good; >1.0 = over. */
  mass_budget_utilisation_pct: number
  /** Round-up of total mass / max envelope. 1 = single container OK; ≥2 = MUST split. */
  recommended_container_count: number
  /** Per-container mass if split into the recommended count. */
  per_container_mass_kg: number
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
    const transformer_mass_kg = input.transformer_mass_kg ?? 0
    const rack_total_mass_kg = input.rack_count * input.rack_mass_kg_each_estimate
    const total_system_mass_kg = (
      input.total_cell_mass_kg
      + transformer_mass_kg
      + input.pcs_mass_kg_estimate
      + rack_total_mass_kg
      + input.container_tare_kg_estimate
    )
    const mass_budget_breach_kg = total_system_mass_kg - input.max_mass_kg_envelope
    const mass_budget_utilisation_pct = (total_system_mass_kg / Math.max(1, input.max_mass_kg_envelope)) * 100
    const recommended_container_count = Math.max(1, Math.ceil(total_system_mass_kg / Math.max(1, input.max_mass_kg_envelope)))
    const per_container_mass_kg = total_system_mass_kg / recommended_container_count

    const warnings: string[] = []
    if (mass_budget_breach_kg > 0) {
      warnings.push(`Mass budget breach: total ${Math.round(total_system_mass_kg)} kg > envelope ${input.max_mass_kg_envelope} kg by ${Math.round(mass_budget_breach_kg)} kg. Design MUST split into ${recommended_container_count} road-transportable containers (per_container ≈ ${Math.round(per_container_mass_kg)} kg each).`)
    } else if (mass_budget_utilisation_pct > 90) {
      warnings.push(`Mass budget tight: ${mass_budget_utilisation_pct.toFixed(1)}% utilised. Consider splitting into 2 containers for transport-stress and balance.`)
    }

    const out: MassAggregatorOutput = {
      total_system_mass_kg: Math.round(total_system_mass_kg * 10) / 10,
      cell_mass_kg: Math.round(input.total_cell_mass_kg * 10) / 10,
      transformer_mass_kg: Math.round(transformer_mass_kg * 10) / 10,
      pcs_mass_kg: Math.round(input.pcs_mass_kg_estimate * 10) / 10,
      rack_total_mass_kg: Math.round(rack_total_mass_kg * 10) / 10,
      container_tare_kg: Math.round(input.container_tare_kg_estimate * 10) / 10,
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
