/**
 * scripts/lib/orchestrator/tools/coolprop-stub.ts
 *
 * Phase 2 stub — CoolProp refrigerant + fluid properties.
 *
 * Computes saturation temperatures, enthalpies, densities for refrigerants
 * and coolants used in BESS thermal management. Real CoolProp wrapper
 * (next) imports `CoolProp.CoolProp.PropsSI` from the Python `CoolProp`
 * package and returns identical fields.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'

export interface CoolPropInput {
  /** Refrigerant or coolant code: r290, r32, r410a, r513a, water_glycol_50 */
  fluid: string
  /** Operating temperature in degrees Celsius. */
  temperature_c: number
}

export interface CoolPropOutput {
  fluid: string
  saturation_temp_at_10bar_c: number
  saturation_pressure_at_temp_bar: number
  liquid_density_kg_m3: number
  vapour_density_kg_m3: number
  enthalpy_liquid_kj_kg: number
  enthalpy_vapour_kj_kg: number
  latent_heat_kj_kg: number
  cp_liquid_kj_kgk: number
  flammability_class: string
}

const REFRIGERANT_DATA: Record<string, CoolPropOutput> = {
  r290: { fluid: 'R290', saturation_temp_at_10bar_c: 27.7, saturation_pressure_at_temp_bar: 0, liquid_density_kg_m3: 500, vapour_density_kg_m3: 20.6, enthalpy_liquid_kj_kg: 260, enthalpy_vapour_kj_kg: 633, latent_heat_kj_kg: 373, cp_liquid_kj_kgk: 2.78, flammability_class: 'A3' },
  r32: { fluid: 'R32', saturation_temp_at_10bar_c: 6.9, saturation_pressure_at_temp_bar: 0, liquid_density_kg_m3: 962, vapour_density_kg_m3: 30.0, enthalpy_liquid_kj_kg: 220, enthalpy_vapour_kj_kg: 519, latent_heat_kj_kg: 299, cp_liquid_kj_kgk: 1.88, flammability_class: 'A2L' },
  r410a: { fluid: 'R410A', saturation_temp_at_10bar_c: 5.4, saturation_pressure_at_temp_bar: 0, liquid_density_kg_m3: 1080, vapour_density_kg_m3: 38.9, enthalpy_liquid_kj_kg: 226, enthalpy_vapour_kj_kg: 425, latent_heat_kj_kg: 199, cp_liquid_kj_kgk: 1.74, flammability_class: 'A1' },
  r513a: { fluid: 'R513A', saturation_temp_at_10bar_c: 33.2, saturation_pressure_at_temp_bar: 0, liquid_density_kg_m3: 1150, vapour_density_kg_m3: 48.3, enthalpy_liquid_kj_kg: 232, enthalpy_vapour_kj_kg: 393, latent_heat_kj_kg: 161, cp_liquid_kj_kgk: 1.49, flammability_class: 'A1' },
  water_glycol_50: { fluid: 'Water/Glycol 50%', saturation_temp_at_10bar_c: 145.0, saturation_pressure_at_temp_bar: 0, liquid_density_kg_m3: 1070, vapour_density_kg_m3: 0.6, enthalpy_liquid_kj_kg: 0, enthalpy_vapour_kj_kg: 0, latent_heat_kj_kg: 0, cp_liquid_kj_kgk: 3.4, flammability_class: 'A1' },
}

export const coolpropPropertiesStub: Tool<CoolPropInput, CoolPropOutput> = {
  id: 'coolprop:refrigerant-properties',
  name: 'CoolProp Refrigerant Properties',
  version: '6.4.3-stub',
  license: 'MIT',
  source_url: 'coolprop.org',
  domain: 'thermal',
  pinned_environment: { python: '3.11.4-stub', coolprop: '6.4.3-stub' },
  applicable_to(envelope) {
    return ['bess', 'heat_pump_residential', 'vertical_farm', 'auv'].includes(envelope.class)
  },
  async invoke(input): Promise<ToolResult<CoolPropOutput>> {
    const t0 = Date.now()
    const data = REFRIGERANT_DATA[input.fluid.toLowerCase()]
    if (!data) {
      return { ok: false, output: null, provenance: { source: 'tool:coolprop:refrigerant-properties', tool_id: 'coolprop:refrigerant-properties', tool_version: '6.4.3-stub' }, warnings: [], error: `unknown fluid: ${input.fluid}` }
    }
    // Mock temperature-dependent saturation pressure (Clausius-Clapeyron-ish)
    const out: CoolPropOutput = { ...data, saturation_pressure_at_temp_bar: Math.max(0.1, 0.5 * Math.exp((input.temperature_c + 40) / 60)) }
    return { ok: true, output: out, provenance: { source: 'tool:coolprop:refrigerant-properties', tool_id: 'coolprop:refrigerant-properties', tool_version: '6.4.3-stub', tool_license: 'MIT', tool_source_url: 'coolprop.org', invocation_input: input, pinned_versions: { python: '3.11.4-stub', coolprop: '6.4.3-stub' }, timestamp: new Date(0).toISOString(), duration_ms: Date.now() - t0 }, warnings: ['STUB: simplified lookup table; real CoolProp PropsSI not wired'] }
  },
}
registerTool(coolpropPropertiesStub)
