/**
 * scripts/lib/orchestrator/tools/absorption-column-htu-ntu.ts
 *
 * absorption:column-htu-ntu — first-principles sizing of a packed gas-liquid
 * absorber (or stripper): packed HEIGHT = HTU x NTU, and column DIAMETER from a
 * flooding/superficial-velocity criterion (Eckert generalised pressure-drop
 * correlation). NTU = the Colburn dilute-absorption equation.
 *
 * Grounds the CO2-mineralisation absorber (the brief's ~100 mm ID / 1.6-8.2 m at
 * 1 t/day CO2) + the stripper — the packed column IS the BoM line (was
 * LLM-guessed).
 *
 * Pattern mirrors reaction-stoichiometry-balance.ts / cantera-real.ts exactly:
 * spawn the repo .venv python on the paired impl, marshal JSON in/out, attach
 * tool provenance + the `worked[]` block.
 *
 * NTU = Colburn/Treybal Eq. 8.48; flooding = Eckert GPDC (Wankat fit). Packing
 * factor Fp supplied per packing (Mellapak 250Y ~ 66 1/m). No fabricated
 * constants.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface AbsorptionColumnInput {
  column_name?: string
  mode?: 'absorber' | 'stripper'
  gas_flow_kg_h: number
  gas_molar_mass_kg_kmol?: number
  gas_density_kg_m3: number
  y_in_mol_frac: number
  target_removal?: number
  x_in_mol_frac?: number
  liquid_flow_kg_h: number
  liquid_molar_mass_kg_kmol?: number
  liquid_density_kg_m3?: number
  liquid_viscosity_cp?: number
  equilibrium_slope_m?: number
  htu_m?: number
  packing_factor_fp_per_m?: number
  fraction_of_flooding?: number
  n_columns?: number
}

export interface AbsorptionColumnOutput {
  column_name: string
  mode: string
  n_columns: number
  y_in_mol_frac: number
  y_out_mol_frac: number
  target_removal: number
  absorption_factor: number
  ntu: number
  htu_m: number
  packed_height_m: number
  flooding_velocity_m_s: number
  design_velocity_m_s: number
  gas_volumetric_flow_m3_s: number
  column_area_m2: number
  column_diameter_m: number
  column_diameter_mm: number
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'absorption:column-htu-ntu'
const SCRIPT = resolve(__dirname, 'python', 'absorption_column_htu_ntu.py')
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

export const absorptionColumnHtuNtu: Tool<AbsorptionColumnInput, AbsorptionColumnOutput> = {
  id: TOOL_ID,
  name: 'Packed Absorption/Stripping Column (HTU-NTU + flooding)',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/process',
  domain: 'process',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    return APPLICABLE_CLASSES.has(envelope.class)
  },
  async invoke(input): Promise<ToolResult<AbsorptionColumnOutput>> {
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
      const output = JSON.parse(proc.stdout) as AbsorptionColumnOutput & { error?: string }
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
          pinned_versions: { python: '3.14.4' },
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

registerTool(absorptionColumnHtuNtu)
