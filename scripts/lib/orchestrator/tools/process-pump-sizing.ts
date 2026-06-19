/**
 * scripts/lib/orchestrator/tools/process-pump-sizing.ts
 *
 * process:pump-sizing — first-principles PROCESS centrifugal pump sizing: total
 * dynamic head (static lift + Darcy-Weisbach pipe friction + process
 * backpressure) and motor power (P = rho g Q H / eta), rounded up to the next
 * standard IEC frame.
 *
 * Replaces the irrigation:pump-sizing (drip/NFT/sprinkler, Hazen-Williams,
 * "n_emitters") hack the CO2-mineralisation plan used for the MEA circulation
 * pump. A process plant has no emitters/sprinklers — this tool's worked maths
 * reads as a real centrifugal process pump.
 *
 * Pattern mirrors crystalliser-evaporator-sizing.ts / reactor-cstr-pfr-sizing.ts
 * exactly: spawn the repo .venv python on the paired impl, marshal JSON in/out,
 * attach tool provenance + the `worked[]` block.
 *
 * Friction: Darcy-Weisbach + Swamee-Jain explicit Colebrook. No fabricated
 * constants. British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface ProcessPumpSizingInput {
  pump_name?: string
  flow_m3_h: number
  /** N parallel pump trains sharing flow_m3_h — sizes ONE pump on its share
   *  (flow_m3_h / parallel_pumps) so the worked-calc is PER-PUMP. Default 1. */
  parallel_pumps?: number
  fluid_density_kg_m3?: number
  fluid_viscosity_pa_s?: number
  static_head_m?: number
  /** Authoritative total dynamic head [m]. When given, OVERRIDES the
   *  static+friction+process sum so the pump head equals the caller's pre-computed
   *  TDH (avoids double-counting friction the caller already included). */
  total_dynamic_head_m?: number
  pipe_length_m?: number
  pipe_diameter_mm?: number
  roughness_mm?: number
  fittings_equiv_length_m?: number
  process_backpressure_kpa?: number
  pump_efficiency?: number
  motor_efficiency?: number
}

export interface ProcessPumpSizingOutput {
  pump_name: string
  pump_type: string
  parallel_pumps: number
  flow_m3_h: number              // PER-PUMP duty flow
  flow_m3_h_total: number        // loop total (sum of all parallel trains)
  pump_flow_lpm: number
  fluid_density_kg_m3: number
  pipe_velocity_m_s: number
  reynolds: number
  darcy_friction_factor: number
  head_basis: string
  head_override_applied: boolean
  head_breakdown: {
    static_head_m: number
    friction_head_m: number
    process_backpressure_head_m: number
  }
  pump_head_m: number
  hydraulic_power_w: number      // PER-PUMP
  shaft_power_w: number          // PER-PUMP
  motor_power_w: number          // PER-PUMP
  motor_power_kw: number         // PER-PUMP
  recommended_motor_kw: number   // PER-PUMP IEC frame
  system_hydraulic_power_w: number  // all N trains
  system_shaft_power_w: number      // all N trains
  system_motor_kw: number           // all N trains
  pump_efficiency: number
  motor_efficiency: number
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'process:pump-sizing'
const SCRIPT = resolve(__dirname, 'python', 'process_pump_sizing.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

const APPLICABLE_CLASSES = new Set<string>([
  'co2_mineralisation',
  'e_fuel_synthesis',  // 2026-06-05 Power-to-Liquid FT SAF plant (liquid product/reflux pumps)
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

export const processPumpSizing: Tool<ProcessPumpSizingInput, ProcessPumpSizingOutput> = {
  id: TOOL_ID,
  name: 'Process Centrifugal Pump Sizing',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/process',
  domain: 'process',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    return APPLICABLE_CLASSES.has(envelope.class)
  },
  async invoke(input): Promise<ToolResult<ProcessPumpSizingOutput>> {
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
      const output = JSON.parse(proc.stdout) as ProcessPumpSizingOutput & { error?: string }
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

registerTool(processPumpSizing)
