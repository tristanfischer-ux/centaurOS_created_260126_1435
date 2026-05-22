/**
 * scripts/lib/orchestrator/tools/pandapower-stub.ts
 *
 * Phase 2 stub — PandaPower grid integration.
 *
 * Computes PCC fault level, transformer sizing, harmonic distortion
 * for grid-connected systems. Real PandaPower wrapper builds a
 * pandapower.network() with the connected MV/LV transformer + PCS +
 * harmonic source, runs `runpp` AC power flow + `pp.shortcircuit.calc_sc`.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'

export interface PandaPowerInput {
  rated_power_kw: number
  pcc_voltage_kv: number
  region: 'EU' | 'UK' | 'US' | 'ROW'
  grid_strength: 'strong' | 'medium' | 'weak'
}

export interface PandaPowerOutput {
  transformer_rating_kva: number
  transformer_impedance_pct: number
  transformer_mass_kg: number
  pcc_short_circuit_ka: number
  voltage_unbalance_pct: number
  harmonic_distortion_pct: number
  ena_g99_compliance: boolean
  ieee_519_compliance: boolean
}

export const pandapowerGridStub: Tool<PandaPowerInput, PandaPowerOutput> = {
  id: 'pandapower:grid-integration',
  name: 'PandaPower Grid Integration',
  version: '2.13-stub',
  license: 'BSD-3-Clause',
  source_url: 'github.com/e2nIEE/pandapower',
  domain: 'grid',
  pinned_environment: { python: '3.11.4-stub', pandapower: '2.13-stub' },
  applicable_to(envelope) {
    return ['bess', 'ev_charger'].includes(envelope.class) && envelope.voltage_tier !== 'extra_low'
  },
  async invoke(input): Promise<ToolResult<PandaPowerOutput>> {
    const t0 = Date.now()
    const transformerKva = input.rated_power_kw * 1.25
    const transformerMass = transformerKva * 3.0 + 500  // empirical: ~3 kg/kVA + base
    const fault = input.grid_strength === 'strong' ? 14.0 : input.grid_strength === 'medium' ? 8.0 : 3.5
    const out: PandaPowerOutput = {
      transformer_rating_kva: Math.ceil(transformerKva / 50) * 50,  // standard sizes
      transformer_impedance_pct: 6.0,
      transformer_mass_kg: transformerMass,
      pcc_short_circuit_ka: fault,
      voltage_unbalance_pct: 1.2,
      harmonic_distortion_pct: 4.0,
      ena_g99_compliance: input.region === 'UK',  // Only checked for UK grid
      ieee_519_compliance: true,
    }
    return { ok: true, output: out, provenance: { source: 'tool:pandapower:grid-integration', tool_id: 'pandapower:grid-integration', tool_version: '2.13-stub', tool_license: 'BSD-3-Clause', tool_source_url: 'github.com/e2nIEE/pandapower', invocation_input: input, pinned_versions: { python: '3.11.4-stub', pandapower: '2.13-stub' }, timestamp: new Date(0).toISOString(), duration_ms: Date.now() - t0 }, warnings: ['STUB: simplified transformer sizing; real PandaPower runpp not wired'] }
  },
}
registerTool(pandapowerGridStub)
