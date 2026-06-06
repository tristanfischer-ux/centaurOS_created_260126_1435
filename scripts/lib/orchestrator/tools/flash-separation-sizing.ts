/**
 * scripts/lib/orchestrator/tools/flash-separation-sizing.ts
 *
 * process:flash-separation — first-principles sizing of a 3-phase (vapour /
 * hydrocarbon-liquid / aqueous) flash separator: the vapour-disengagement
 * diameter from the Souders-Brown terminal-settling velocity, the liquid
 * hold-up volume from a residence-time basis, a real horizontal vessel size
 * (diameter x tangent-to-tangent length, L/D clamped to the [2.5, 5] economic
 * band) and an oil-water settling check (Stokes' law).
 *
 * Grounds the e-fuel synthesis 3-phase separator on the Fischer-Tropsch /
 * methanol reactor effluent (syncrude/raw-methanol liquid + reaction water +
 * unconverted syngas) — a NOVEL bespoke vessel with no catalogue part, where
 * a SIZED vessel (D x L + the settling check) IS the BoM line item (was
 * LLM-guessed).
 *
 * Pattern mirrors reactor-cstr-pfr-sizing.ts exactly: spawn the repo .venv
 * python on the paired impl, marshal JSON in/out, attach tool provenance. The
 * Python returns a `worked[]` array (built from its live values via _worked.py)
 * which the executor stows in contract.worked_calculations[tool_id] and the
 * attribution appendix renders so a reviewer can hand-check the maths.
 *
 * Design correlations cited inline in the Python (Souders-Brown load factor;
 * GPSA Engineering Data Book Section 7 K-value bands; Svrcek & Monnery 2000
 * horizontal separator L/D + 50% liquid level; Stokes' law oil-water settling).
 * No fabricated constants.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface FlashSeparationInput {
  /** Overhead vapour mass flow [kg/h] (required). */
  vapour_flow_kg_h: number
  /** Hydrocarbon-liquid mass flow [kg/h] (required). */
  liquid_hc_flow_kg_h: number
  /** Produced-water (aqueous) mass flow [kg/h] (default 0). */
  aqueous_flow_kg_h?: number
  /** Vapour density at operating P,T [kg/m3] (default 15). */
  rho_v_kg_m3?: number
  /** Hydrocarbon-liquid density [kg/m3] (default 700). */
  rho_l_kg_m3?: number
  /** Aqueous density [kg/m3] (default 1000). */
  rho_aq_kg_m3?: number
  /** Operating pressure [bar] (required; selects the Souders-Brown K band). */
  p_bar: number
  /** Operating temperature [K] (required). */
  t_k: number
  /** Liquid hold-up residence time [min] (default 20). */
  liq_residence_min?: number
  /** Vessel orientation (default 'horizontal'). */
  orientation?: 'horizontal' | 'vertical'
  /** Demister mesh pad fitted? (default false). */
  mesh?: boolean
  /** Aqueous droplet diameter for the Stokes settling check [um] (default 150). */
  droplet_um?: number
}

export interface FlashSeparationOutput {
  vessel_diameter_m: number
  vessel_length_m: number
  l_over_d: number
  vapour_velocity_max_ms: number
  k_factor_used: number
  liquid_residence_min: number
  oil_water_settling_ok: boolean
  holdup_volume_m3: number
  orientation: string
  mesh_fitted: boolean
  operating_pressure_bar: number
  operating_temperature_k: number
  settling_time_s: number | null
  vapour_cross_section_m2: number
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'process:flash-separation'
const SCRIPT = resolve(__dirname, 'python', 'flash_separation_sizing.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const flashSeparationSizing: Tool<FlashSeparationInput, FlashSeparationOutput> = {
  id: TOOL_ID,
  name: 'Flash Separator (3-Phase) Sizing',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/process',
  domain: 'process',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    return envelope.class === 'e_fuel_synthesis'
  },
  async invoke(input): Promise<ToolResult<FlashSeparationOutput>> {
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
      const output = JSON.parse(proc.stdout) as FlashSeparationOutput & { error?: string }
      if (output.error) {
        return {
          ok: false, output: null,
          provenance: { source: `tool:${TOOL_ID}`, tool_id: TOOL_ID, tool_version: '1.0.0' },
          warnings: [], error: output.error,
        }
      }
      const warnings: string[] = []
      if (output.oil_water_settling_ok === false) {
        warnings.push(
          'oil-water settling NOT satisfied at the given residence time — ' +
          'increase liq_residence_min or add a coalescer/larger vessel',
        )
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
        warnings,
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

registerTool(flashSeparationSizing)
