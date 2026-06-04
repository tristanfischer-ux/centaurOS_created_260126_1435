/**
 * scripts/lib/orchestrator/tools/dryer-thermal-sizing.ts
 *
 * dryer:thermal-sizing — first-principles sizing of a convective (hot-air) dryer:
 * the evaporative water load (solids moisture balance), the drying-AIR mass flow
 * (from the humidity pick-up, m_air = water / (W_out - W_in)) and the heater DUTY
 * (from the air-enthalpy rise). Air states from psychrolib (ASHRAE 2017).
 *
 * Grounds the CO2-mineralisation CaCO3 dryer + K2SO4 dryer — the dryer (air flow
 * + heater duty) IS the BoM line (was LLM-guessed).
 *
 * Pattern mirrors reaction-stoichiometry-balance.ts / cantera-real.ts exactly:
 * spawn the repo .venv python on the paired impl, marshal JSON in/out, attach
 * tool provenance + the `worked[]` block.
 *
 * Psychrometric states (humidity ratio, enthalpy, specific volume) from
 * psychrolib; mass + enthalpy balance from Coulson & Richardson Vol 2 ch.16. No
 * fabricated constants.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface DryerSizingInput {
  dryer_name?: string
  wet_solids_kg_h: number
  moisture_in_pct: number
  moisture_out_pct: number
  moisture_basis?: 'wet' | 'dry'
  ambient_air_temp_c?: number
  ambient_air_rh_pct?: number
  inlet_air_temp_c?: number
  outlet_air_temp_c?: number
  outlet_air_rh_pct?: number
  pressure_pa?: number
  heater_efficiency?: number
  n_units?: number
}

export interface DryerSizingOutput {
  dryer_name: string
  n_units: number
  bone_dry_solids_kg_h: number
  product_kg_h: number
  water_evaporated_kg_h: number
  inlet_humidity_ratio_kg_kg: number
  outlet_humidity_ratio_kg_kg: number
  humidity_pickup_kg_kg: number
  drying_air_mass_flow_kg_h: number
  air_enthalpy_rise_kj_kg: number
  heater_duty_kw: number
  heater_duty_kw_per_unit: number
  humid_air_volumetric_flow_m3_h: number
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'dryer:thermal-sizing'
const SCRIPT = resolve(__dirname, 'python', 'dryer_thermal_sizing.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

const APPLICABLE_CLASSES = new Set<string>([
  'co2_mineralisation',
  'dac',
  'fluid_processing',
  'water_treatment',
  'electrolyser',
  'bioreactor',
  'chemical_process',
  'process_plant',
  'bespoke_plant',
  'bespoke',
])

export const dryerThermalSizing: Tool<DryerSizingInput, DryerSizingOutput> = {
  id: TOOL_ID,
  name: 'Convective Dryer Air-Flow + Heat-Duty Sizing',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/process',
  domain: 'process',
  pinned_environment: { python: '3.14.4', psychrolib: '2.5.0' },
  applicable_to(envelope) {
    return APPLICABLE_CLASSES.has(envelope.class)
  },
  async invoke(input): Promise<ToolResult<DryerSizingOutput>> {
    const t0 = Date.now()
    const proc = spawnSync(VENV_PY, [SCRIPT], { input: JSON.stringify(input), encoding: 'utf-8', timeout: 30_000 })
    const duration_ms = Date.now() - t0
    if (proc.status !== 0) {
      return {
        ok: false, output: null,
        provenance: { source: `tool:${TOOL_ID}`, tool_id: TOOL_ID, tool_version: '1.0.0' },
        warnings: [],
        error: `Python exit ${proc.status}: ${proc.stderr?.slice(0, 400)}`,
      }
    }
    try {
      const output = JSON.parse(proc.stdout) as DryerSizingOutput & { error?: string }
      if (output.error) {
        return {
          ok: false, output: null,
          provenance: { source: `tool:${TOOL_ID}`, tool_id: TOOL_ID, tool_version: '1.0.0' },
          warnings: [], error: output.error,
        }
      }
      return {
        ok: true, output,
        provenance: {
          source: `tool:${TOOL_ID}`, tool_id: TOOL_ID, tool_version: '1.0.0',
          tool_license: 'free-proprietary', tool_source_url: 'internal://forgeos/process',
          invocation_input: input, invocation_output_field: '(multiple)',
          pinned_versions: { python: '3.14.4', psychrolib: '2.5.0' },
          timestamp: new Date().toISOString(), duration_ms,
        },
        warnings: [],
      }
    } catch (err) {
      return {
        ok: false, output: null,
        provenance: { source: `tool:${TOOL_ID}`, tool_id: TOOL_ID, tool_version: '1.0.0' },
        warnings: [], error: `JSON parse: ${(err as Error).message}`,
      }
    }
  },
}

registerTool(dryerThermalSizing)
