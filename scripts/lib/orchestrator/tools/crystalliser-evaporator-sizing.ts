/**
 * scripts/lib/orchestrator/tools/crystalliser-evaporator-sizing.ts
 *
 * crystalliser:evaporator-sizing — first-principles DUTY + heat-transfer area +
 * vessel size for an evaporative crystalliser. From the solute mass rate, the
 * feed concentration, the target recovery and the solubility at operating
 * temperature it computes the water that must boil off to drive the liquor to
 * saturation, the evaporation DUTY (via the latent heat of water from CoolProp),
 * the steam-side heat-transfer AREA (Q = U x A x dT) and a magma-residence vessel.
 *
 * Grounds the CO2-mineralisation k2so4_recovery sub-module — a NOVEL sub-module
 * with no catalogue part, where the crystalliser DUTY + area + vessel ARE the
 * BoM line (was LLM-guessed).
 *
 * Pattern mirrors reaction-stoichiometry-balance.ts / cantera-real.ts exactly:
 * spawn the repo .venv python on the paired impl, marshal JSON in/out, attach
 * tool provenance + the `worked[]` block.
 *
 * Latent heat + boiling point: CoolProp (water IAPWS-IF97). Area Q = U A dT +
 * U ranges: Perry's 8th ed. ch.11. No fabricated constants.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface CrystalliserSizingInput {
  crystalliser_name?: string
  solute_name?: string
  solute_mass_rate_kg_h: number
  feed_solute_concentration_g_l: number
  feed_density_kg_m3?: number
  target_recovery?: number
  solubility_g_per_100g_water: number
  operating_pressure_kpa?: number
  feed_temp_c?: number
  overall_htc_w_m2k?: number
  steam_temp_c?: number
  magma_residence_time_h?: number
  magma_density_kg_m3?: number
  length_to_diameter?: number
  n_units?: number
}

export interface CrystalliserSizingOutput {
  crystalliser_name: string
  solute_name: string
  n_units: number
  water_evaporated_kg_h: number
  boiling_point_c: number
  latent_heat_kj_kg: number
  duty_evaporation_kw: number
  duty_sensible_kw: number
  duty_total_kw: number
  heat_transfer_area_m2: number
  steam_consumption_kg_h: number
  vessel_volume_m3: number
  vessel_diameter_m: number
  vessel_height_m: number
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'crystalliser:evaporator-sizing'
const SCRIPT = resolve(__dirname, 'python', 'crystalliser_evaporator_sizing.py')
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

export const crystalliserEvaporatorSizing: Tool<CrystalliserSizingInput, CrystalliserSizingOutput> = {
  id: TOOL_ID,
  name: 'Evaporative Crystalliser Duty + Area Sizing',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/process',
  domain: 'process',
  pinned_environment: { python: '3.14.4', CoolProp: '7.2.0' },
  applicable_to(envelope) {
    return APPLICABLE_CLASSES.has(envelope.class)
  },
  async invoke(input): Promise<ToolResult<CrystalliserSizingOutput>> {
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
      const output = JSON.parse(proc.stdout) as CrystalliserSizingOutput & { error?: string }
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
          pinned_versions: { python: '3.14.4', CoolProp: '7.2.0' },
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

registerTool(crystalliserEvaporatorSizing)
