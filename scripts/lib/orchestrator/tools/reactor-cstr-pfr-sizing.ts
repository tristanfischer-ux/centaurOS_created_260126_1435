/**
 * scripts/lib/orchestrator/tools/reactor-cstr-pfr-sizing.ts
 *
 * reactor:cstr-pfr-sizing — first-principles sizing of a stirred-tank (CSTR) or
 * plug-flow (PFR) reactor: working VOLUME (V = Q x tau), residence time (given,
 * or derived from conversion + first-order kinetics), a real vessel size
 * (diameter x height from an L/D aspect ratio) and the shell thickness/mass
 * (the SAME hoop-stress wall calc the pressure-vessel tool uses).
 *
 * Grounds the CO2-mineralisation gypsum_carbonation reactor + the K2SO4 reactor
 * — NOVEL sub-modules with no catalogue part, where a SIZED reactor (volume +
 * vessel + shell mass) IS the BoM line item (was LLM-guessed).
 *
 * Pattern mirrors reaction-stoichiometry-balance.ts / cantera-real.ts exactly:
 * spawn the repo .venv python on the paired impl, marshal JSON in/out, attach
 * tool provenance. The Python returns a `worked[]` array (built from its live
 * values via _worked.py) which the executor stows in
 * contract.worked_calculations[tool_id] and the attribution appendix renders so
 * a reviewer can hand-check the maths.
 *
 * Design correlations cited inline in the Python (Levenspiel reactor equations;
 * Coulson & Richardson / Sinnott vessel L/D + wall thickness; ASME VIII Div.1
 * UG-27 / BS EN 13445 hoop stress). No fabricated constants.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface ReactorSizingInput {
  reactor_name?: string
  reactor_type?: 'cstr' | 'pfr'
  /** Throughput as a volumetric rate, OR supply mass_flow_kg_h + density_kg_m3. */
  volumetric_flow_m3_h?: number
  mass_flow_kg_h?: number
  density_kg_m3?: number
  /** Residence-time basis: a direct time, OR (target_conversion + rate_constant_per_h). */
  residence_time_h?: number
  target_conversion?: number
  rate_constant_per_h?: number
  /** Geometry + mechanical. */
  length_to_diameter?: number
  fill_fraction?: number
  design_pressure_barg?: number
  material?: string
  allowable_stress_mpa?: number | null
  corrosion_allowance_mm?: number
  weld_joint_efficiency?: number
  n_reactors?: number
}

export interface ReactorSizingOutput {
  reactor_name: string
  reactor_type: string
  n_reactors: number
  volumetric_flow_m3_h: number
  residence_time_h: number
  residence_time_basis: string
  target_conversion: number | null
  working_volume_total_m3: number
  working_volume_per_reactor_m3: number
  vessel_gross_volume_m3: number
  vessel_diameter_m: number
  vessel_height_m: number
  shell_thickness_mm: number
  shell_mass_kg_per_reactor: number
  shell_mass_kg_total: number
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'reactor:cstr-pfr-sizing'
const SCRIPT = resolve(__dirname, 'python', 'reactor_cstr_pfr_sizing.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

// Chemical-process classes this tool serves (CO2 mineralisation + the broader
// process-plant family: DAC, fluid processing, electrolysis, water treatment,
// bioreactor, plus the bespoke-plant fallback classes).
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

export const reactorCstrPfrSizing: Tool<ReactorSizingInput, ReactorSizingOutput> = {
  id: TOOL_ID,
  name: 'Reactor (CSTR/PFR) Volume + Vessel Sizing',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/process',
  domain: 'process',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    return APPLICABLE_CLASSES.has(envelope.class)
  },
  async invoke(input): Promise<ToolResult<ReactorSizingOutput>> {
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
      const output = JSON.parse(proc.stdout) as ReactorSizingOutput & { error?: string }
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

registerTool(reactorCstrPfrSizing)
