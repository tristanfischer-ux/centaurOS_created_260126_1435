/**
 * scripts/lib/orchestrator/tools/bagging-throughput-sizing.ts
 *
 * bagging:throughput-sizing — first-principles sizing of the solids bagging +
 * packaging line from the product mass rate and bag size: the bag fill rate
 * (bags/hour), the equivalent bagging-line throughput (kg/h) and the upstream
 * day-silo storage volume (m3) for each product stream.
 *
 * Grounds the CO2-mineralisation Bagging & Packaging module — which showed NO
 * computation because the engine had no bagging sizing tool. A line SIZED from
 * the real product rates (~2.3 t/day CaCO3, ~3.9 t/day K2SO4 at 25 kg/bag) IS
 * the BoM line item (bags/h + line kg/h + day-silo m3) instead of an LLM guess.
 *
 * Pattern mirrors reactor-cstr-pfr-sizing.ts exactly: spawn the repo .venv
 * python on the paired impl, marshal JSON in/out, attach tool provenance. The
 * Python returns a `worked[]` array (built from its live values via _worked.py)
 * which the executor stows in contract.worked_calculations[tool_id] and the
 * attribution appendix renders so a reviewer can hand-check the maths.
 *
 * Sizing basis cited inline in the Python (Perry's ch.21 solids handling +
 * silo storage volume from bulk density; Woodcock & Mason 'Bulk Solids
 * Handling'). No fabricated constants.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface BaggingSizingInput {
  line_name?: string
  /** Product mass rate [t/day]. */
  product_mass_rate_t_day?: number
  /** Net bag weight [kg]. */
  bag_kg?: number
  /** Production hours per day (shift basis), (0,24]. */
  operating_hours_per_day?: number
  /** Day-silo storage basis [hours of product]. */
  silo_buffer_hours?: number
  /** Product loose bulk density [kg/m3]. */
  bulk_density_kg_m3?: number
  /** Freeboard above working volume [0,1]. */
  silo_ullage_fraction?: number
  /** Distinct product silos (informational). */
  n_products?: number
}

export interface BaggingSizingOutput {
  line_name: string
  product_mass_rate_t_day: number
  bag_kg: number
  operating_hours_per_day: number
  silo_buffer_hours: number
  bulk_density_kg_m3: number
  silo_ullage_fraction: number
  n_products: number
  bags_per_day: number
  day_silo_stored_mass_kg: number
  day_silo_working_volume_m3: number
  bagging_rate_bags_h: number
  bagging_line_kg_h: number
  day_silo_volume_m3: number
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'bagging:throughput-sizing'
const SCRIPT = resolve(__dirname, 'python', 'bagging_throughput_sizing.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

// Process-plant family this tool serves (CO2 mineralisation + the broader
// process-plant classes that bag/package a solid product).
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

export const baggingThroughputSizing: Tool<BaggingSizingInput, BaggingSizingOutput> = {
  id: TOOL_ID,
  name: 'Bagging & Packaging Line Throughput Sizing',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/process',
  domain: 'process',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    return APPLICABLE_CLASSES.has(envelope.class)
  },
  async invoke(input): Promise<ToolResult<BaggingSizingOutput>> {
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
      const output = JSON.parse(proc.stdout) as BaggingSizingOutput & { error?: string }
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

registerTool(baggingThroughputSizing)
