/**
 * scripts/lib/orchestrator/tools/electrical-transformer-sizing.ts
 *
 * electrical:transformer-sizing — first-principles sizing of the plant supply
 * (distribution) transformer from the connected electrical load: apparent power
 * (kVA = kW / pf), a spare-capacity headroom to pick the next standard IEC 60076
 * rating, and the primary + secondary line currents (S / (sqrt(3) x U) for a
 * three-phase supply).
 *
 * Grounds the CO2-mineralisation Electrical Distribution module — which showed
 * NO computation because the engine had no electrical sizing tool. A transformer
 * SIZED from the real ~561 kW connected load IS the BoM line item (kVA nameplate
 * + primary/secondary currents) instead of an LLM guess.
 *
 * Pattern mirrors reactor-cstr-pfr-sizing.ts exactly: spawn the repo .venv
 * python on the paired impl, marshal JSON in/out, attach tool provenance. The
 * Python returns a `worked[]` array (built from its live values via _worked.py)
 * which the executor stows in contract.worked_calculations[tool_id] and the
 * attribution appendix renders so a reviewer can hand-check the maths.
 *
 * Sizing basis cited inline in the Python (IEC 60076-1 standard kVA series; IEC
 * 60909 load-current basis; S / (sqrt(3) x U) line current). No fabricated
 * constants.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface TransformerSizingInput {
  transformer_name?: string
  /** Connected active electrical load [kW]. */
  plant_load_kw?: number
  /** Load displacement power factor (0,1]. */
  power_factor?: number
  /** Spare-capacity margin over demand [0,2]. */
  headroom_fraction?: number
  /** HV primary line-to-line voltage [V]. */
  primary_voltage_v?: number
  /** LV secondary line-to-line voltage [V]. */
  secondary_voltage_v?: number
  /** 3 (three-phase) or 1 (single-phase). */
  phases?: number
  /** Optional override of the IEC preferred-rating ladder. */
  standard_ratings_kva?: number[]
}

export interface TransformerSizingOutput {
  transformer_name: string
  phases: number
  plant_load_kw: number
  power_factor: number
  headroom_fraction: number
  primary_voltage_v: number
  secondary_voltage_v: number
  apparent_power_demand_kva: number
  required_with_headroom_kva: number
  transformer_kva: number
  transformer_primary_current_a: number
  transformer_secondary_current_a: number
  rating_off_standard_ladder: boolean
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'electrical:transformer-sizing'
const SCRIPT = resolve(__dirname, 'python', 'electrical_transformer_sizing.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

// Process-plant family this tool serves (CO2 mineralisation + the broader
// process-plant classes that have a plant electrical distribution board).
const APPLICABLE_CLASSES = new Set<string>([
  'co2_mineralisation',
  'dac',
  'chemical_process',
  'process_plant',
  'water_treatment',
  'electrolyser',
  'bioreactor',
  'bespoke_plant',
  'bespoke',
])

export const electricalTransformerSizing: Tool<TransformerSizingInput, TransformerSizingOutput> = {
  id: TOOL_ID,
  name: 'Electrical Distribution Transformer Sizing',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/electrical',
  domain: 'grid',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    return APPLICABLE_CLASSES.has(envelope.class)
  },
  async invoke(input): Promise<ToolResult<TransformerSizingOutput>> {
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
      const output = JSON.parse(proc.stdout) as TransformerSizingOutput & { error?: string }
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
          tool_license: 'free-proprietary', tool_source_url: 'internal://forgeos/electrical',
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

registerTool(electricalTransformerSizing)
