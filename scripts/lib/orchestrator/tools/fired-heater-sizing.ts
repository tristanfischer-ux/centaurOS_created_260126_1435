/**
 * scripts/lib/orchestrator/tools/fired-heater-sizing.ts
 *
 * process:fired-heater — first-principles sizing of a FEED-PREHEAT + iron-
 * Fischer-Tropsch catalyst-ACTIVATION startup heater on an e-fuel synthesis
 * plant: process heat duty from a sensible-heat (+ optional latent) energy
 * balance, the fuel/electrical input duty after burner/element efficiency, and
 * (for a FIRED heater) the radiant-section tube area from an average radiant
 * heat flux.
 *
 * SCOPE — this is the FEED-PREHEAT heater that brings the CO2/H2 feed up to
 * reactor inlet temperature AND performs the iron FT catalyst's reductive
 * activation soak at start-up. It is NOT the FT reactor's thermal duty: the FT
 * reaction is strongly EXOTHERMIC and that heat is REMOVED by a separate steam-
 * generator (boiler-feed-water) tool, not supplied by this heater.
 *
 * Grounds a real BoM line item with a real duty and (for fired) a real radiant
 * tube area — previously LLM-guessed.
 *
 * Pattern mirrors reactor-cstr-pfr-sizing.ts / reaction-stoichiometry-balance.ts
 * exactly: spawn the repo .venv python on the paired impl, marshal JSON in/out,
 * attach tool provenance. The Python returns a `worked[]` array (built from its
 * live values via _worked.py) which the executor stows in
 * contract.worked_calculations[tool_id] and the attribution appendix renders so a
 * reviewer can hand-check the maths.
 *
 * Design correlations cited inline in the Python (API 560 fired-heater radiant
 * flux / tube-area practice; first-law sensible-heat energy balance). No
 * fabricated constants.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface FiredHeaterSizingInput {
  /** Process-stream mass throughput [kg/h]. Required. */
  mass_flow_kg_h: number
  /** Mean specific heat of the stream [kJ/kg-K]. Default 2.2. */
  cp_kj_kgk?: number
  /** Inlet temperature [K]. Required. */
  t_in_k: number
  /** Outlet (target) temperature [K]. Required. */
  t_out_k: number
  /** Fraction of the stream vaporised over the heater [-]. Default 0. */
  vaporise_frac?: number
  /** Latent heat of vaporisation [kJ/kg]. Default 0. */
  latent_kj_kg?: number
  /** Heater type. Default 'electric'. */
  mode?: 'electric' | 'fired'
  /** Burner/element efficiency [-]. Default 0.98 electric / 0.88 fired. */
  efficiency?: number
  /** Average radiant heat flux [kW/m2] (fired only). Default 30. */
  avg_radiant_flux_kw_m2?: number
}

export interface FiredHeaterSizingOutput {
  process_duty_kw: number
  input_duty_kw: number
  mode: string
  efficiency_used: number
  delta_t_k: number
  mass_flow_kg_h: number
  /** Present only when mode === 'fired'. */
  radiant_area_m2?: number
  /** Present only when mode === 'electric'. */
  heating_element_kw?: number
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'process:fired-heater'
const SCRIPT = resolve(__dirname, 'python', 'fired_heater_sizing.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

// Pure first-principles energy balance; applicable ONLY to the e-fuel synthesis
// class per the task scope (CO2/H2 feed-preheat + FT catalyst-activation heater).
const APPLICABLE_CLASSES = new Set<string>([
  'e_fuel_synthesis',
])

export const firedHeaterSizing: Tool<FiredHeaterSizingInput, FiredHeaterSizingOutput> = {
  id: TOOL_ID,
  name: 'Fired / Electric Feed-Preheat + Catalyst-Activation Heater Sizing',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/process',
  domain: 'process',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    return APPLICABLE_CLASSES.has(envelope.class)
  },
  async invoke(input): Promise<ToolResult<FiredHeaterSizingOutput>> {
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
      const output = JSON.parse(proc.stdout) as FiredHeaterSizingOutput & { error?: string }
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

registerTool(firedHeaterSizing)
