/**
 * scripts/lib/orchestrator/tools/flare-thermal-oxidiser.ts
 *
 * flare:thermal-oxidiser — first-principles sizing of the enclosed thermal
 * oxidiser / flare that safely destroys the combustible purge / off-gas stream
 * of an e-fuel (power-to-liquid) plant. The light-ends and unconverted syngas
 * that cannot be recycled are routed to a thermal oxidiser whose combustion
 * chamber is sized for a destruction temperature and residence time, with a
 * stack sized for an exit velocity.
 *
 * Sizes: heat release (mass rate x lower heating value), combustion air
 * (stoichiometric air/fuel x (1 + excess)), flue-gas rate (mass conservation),
 * flue density (ideal gas at the combustion temperature), combustion-chamber
 * volume (volumetric flow x residence time) and stack diameter (continuity at
 * the exit velocity). The destruction temperature + residence time are the
 * carbon-monoxide / VOC destruction safety basis.
 *
 * Pattern mirrors reactor-cstr-pfr-sizing.ts / reaction-stoichiometry-balance.ts
 * exactly: spawn the repo .venv python on the paired impl, marshal JSON in/out,
 * attach tool provenance. The Python returns a `worked[]` array (built from its
 * live values via _worked.py) which the executor stows in
 * contract.worked_calculations[tool_id] and the attribution appendix renders so
 * a reviewer can hand-check the maths.
 *
 * Design correlations cited inline in the Python (combustion stoichiometry;
 * ideal-gas density; continuity for the stack; API STD 521 / API STD 537 /
 * enclosed thermal-oxidiser practice). No fabricated constants.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface FlareThermalOxidiserInput {
  /** Combustible purge / off-gas mass rate [kg/h] (required). */
  purge_flow_kg_h?: number
  /** Lower heating value of the purge [MJ/kg] (default 30). */
  lhv_mj_kg?: number
  /** Stoichiometric air/fuel mass ratio [kg air / kg fuel] (default 12). */
  stoich_air_kg_per_kg?: number
  /** Excess-air fraction (default 0.2 = 20%). */
  excess_air_frac?: number
  /** Combustion / destruction temperature [degC] (default 1000). */
  comb_temp_c?: number
  /** Combustion-gas residence time [s] (default 1.0). */
  residence_s?: number
  /** Stack exit velocity [m/s] (default 15). */
  exit_velocity_ms?: number
  /** Flue-gas mean molar mass [g/mol] (default 28). */
  flue_mw?: number
}

export interface FlareThermalOxidiserOutput {
  purge_flow_kg_h: number
  lhv_mj_kg: number
  heat_release_kw: number
  stoich_air_kg_per_kg: number
  excess_air_frac: number
  combustion_air_kg_h: number
  flue_gas_kg_h: number
  flue_mw: number
  flue_density_kg_m3: number
  flue_volumetric_m3_s: number
  comb_temp_c: number
  residence_s: number
  chamber_volume_m3: number
  exit_velocity_ms: number
  stack_diameter_m: number
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'flare:thermal-oxidiser'
const SCRIPT = resolve(__dirname, 'python', 'flare_thermal_oxidiser.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const flareThermalOxidiser: Tool<FlareThermalOxidiserInput, FlareThermalOxidiserOutput> = {
  id: TOOL_ID,
  name: 'Flare / Thermal Oxidiser (purge destruction) Sizing',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/process',
  domain: 'process',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    return envelope.class === 'e_fuel_synthesis'
  },
  async invoke(input): Promise<ToolResult<FlareThermalOxidiserOutput>> {
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
      const output = JSON.parse(proc.stdout) as FlareThermalOxidiserOutput & { error?: string }
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

registerTool(flareThermalOxidiser)
