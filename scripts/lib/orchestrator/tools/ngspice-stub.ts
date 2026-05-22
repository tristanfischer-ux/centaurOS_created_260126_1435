/**
 * scripts/lib/orchestrator/tools/ngspice-stub.ts
 *
 * Phase 2 stub — ngspice power-electronics simulation.
 *
 * Computes PCS (power conditioning system) dissipation, DC-link ripple,
 * switching losses for utility-scale inverters. Real ngspice wrapper
 * builds a netlist + runs `.tran` simulation; returns identical fields.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'

export interface NgspiceInput {
  rated_power_kw: number
  dc_bus_voltage_v: number
  ac_output_voltage_v: number
  topology: 'two_level_igbt' | 'three_level_igbt' | 'sic_two_level' | 'modular_multilevel'
}

export interface NgspiceOutput {
  inverter_efficiency_pct: number
  dissipated_power_kw: number
  dc_link_ripple_pct: number
  switching_losses_kw: number
  conduction_losses_kw: number
  ac_thd_pct: number
  filter_inductor_min_uh: number
  filter_capacitor_min_uf: number
  dc_continuous_current_a: number
  ac_continuous_current_a: number
}

export const ngspicePcsStub: Tool<NgspiceInput, NgspiceOutput> = {
  id: 'ngspice:pcs-simulation',
  name: 'ngspice PCS Simulation',
  version: '41-stub',
  license: 'GPL-3.0',
  source_url: 'ngspice.sourceforge.io',
  domain: 'power_electronics',
  pinned_environment: { ngspice: '41-stub' },
  applicable_to(envelope) {
    return ['bess', 'ev_charger'].includes(envelope.class)
  },
  async invoke(input): Promise<ToolResult<NgspiceOutput>> {
    const t0 = Date.now()
    const efficiencyMap = { two_level_igbt: 0.965, three_level_igbt: 0.975, sic_two_level: 0.985, modular_multilevel: 0.99 }
    const eff = efficiencyMap[input.topology] ?? 0.97
    const dissipated = input.rated_power_kw * (1 - eff)
    const switching = dissipated * 0.6   // empirical split
    const conduction = dissipated * 0.4
    const dcCurrent = (input.rated_power_kw * 1000) / input.dc_bus_voltage_v
    const acCurrent = (input.rated_power_kw * 1000) / (Math.sqrt(3) * input.ac_output_voltage_v)
    const out: NgspiceOutput = {
      inverter_efficiency_pct: eff * 100,
      dissipated_power_kw: dissipated,
      dc_link_ripple_pct: input.topology === 'modular_multilevel' ? 0.5 : 2.5,
      switching_losses_kw: switching,
      conduction_losses_kw: conduction,
      ac_thd_pct: input.topology === 'modular_multilevel' ? 1.5 : 3.5,
      filter_inductor_min_uh: 50 + Math.log2(input.rated_power_kw) * 10,
      filter_capacitor_min_uf: 200 + input.rated_power_kw * 0.5,
      dc_continuous_current_a: dcCurrent,
      ac_continuous_current_a: acCurrent,
    }
    return { ok: true, output: out, provenance: { source: 'tool:ngspice:pcs-simulation', tool_id: 'ngspice:pcs-simulation', tool_version: '41-stub', tool_license: 'GPL-3.0', tool_source_url: 'ngspice.sourceforge.io', invocation_input: input, pinned_versions: { ngspice: '41-stub' }, timestamp: new Date(0).toISOString(), duration_ms: Date.now() - t0 }, warnings: ['STUB: empirical efficiency map; real ngspice .tran simulation not wired'] }
  },
}
registerTool(ngspicePcsStub)
