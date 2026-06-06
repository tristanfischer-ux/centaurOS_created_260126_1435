/**
 * scripts/lib/orchestrator/tools/storage-tank-liquid-fuel.ts
 *
 * storage-tank:liquid-fuel — first-principles sizing of the product liquid-fuel
 * storage farm: the required working volume from a days-of-storage basis, the
 * number of tanks once a single-tank volume cap is applied, a real cylindrical
 * tank size (diameter x height from an H/D aspect ratio) and the shell-course
 * thickness + steel mass from the API 650 1-foot method.
 *
 * Grounds the e-fuel synthesis product tank farm (methanol / FT syncrude /
 * e-kerosene buffered before truck/pipeline export) — a NOVEL bespoke item
 * with no catalogue part, where a SIZED tank (count + D x H + shell mass) IS
 * the BoM line item (was LLM-guessed).
 *
 * Pattern mirrors reactor-cstr-pfr-sizing.ts exactly: spawn the repo .venv
 * python on the paired impl, marshal JSON in/out, attach tool provenance. The
 * Python returns a `worked[]` array (built from its live values via _worked.py)
 * which the executor stows in contract.worked_calculations[tool_id] and the
 * attribution appendix renders so a reviewer can hand-check the maths.
 *
 * Design correlation cited inline in the Python (API 650 'Welded Tanks for Oil
 * Storage' clause 5.6.3 1-foot-method shell thickness; carbon-steel density
 * 7850 kg/m3 for shell mass). No fabricated constants.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface StorageTankInput {
  /** Fuel produced per day [m3/day] (required). */
  daily_production_m3: number
  /** Days of buffer storage (default 14). */
  days_storage?: number
  /** Working volume / gross tank fill fraction (default 0.9). */
  fill_fraction?: number
  /** Product (fuel) density [kg/m3] (default 800). */
  product_density_kg_m3?: number
  /** Single-tank volume cap [m3] (default 1000). */
  max_tank_m3?: number
  /** Corrosion allowance [mm] (default 3). */
  corrosion_allow_mm?: number
  /** Allowable design stress [MPa] (default 160). */
  allow_stress_mpa?: number
  /** Weld joint efficiency E (default 0.85). */
  joint_eff?: number
  /** Tank height-to-diameter aspect ratio (default 0.8). */
  h_over_d?: number
}

export interface StorageTankOutput {
  tank_count: number
  tank_diameter_m: number
  tank_height_m: number
  shell_thickness_mm: number
  shell_mass_kg_each: number
  total_volume_m3: number
  days_storage: number
  volume_per_tank_m3: number
  shell_mass_kg_total: number
  product_density_kg_m3: number
  fill_fraction: number
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'storage-tank:liquid-fuel'
const SCRIPT = resolve(__dirname, 'python', 'storage_tank_liquid_fuel.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const storageTankLiquidFuel: Tool<StorageTankInput, StorageTankOutput> = {
  id: TOOL_ID,
  name: 'Liquid-Fuel Storage Tank (API 650) Sizing',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/process',
  domain: 'process',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    return envelope.class === 'e_fuel_synthesis'
  },
  async invoke(input): Promise<ToolResult<StorageTankOutput>> {
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
      const output = JSON.parse(proc.stdout) as StorageTankOutput & { error?: string }
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

registerTool(storageTankLiquidFuel)
