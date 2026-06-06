/**
 * scripts/lib/orchestrator/tools/steam-generator-sizing.ts
 *
 * process:steam-generator — first-principles sizing of the waste-heat steam
 * generator that raises saturated steam from the STRONGLY EXOTHERMIC
 * Fischer-Tropsch (FT) reactor of an e-fuel (power-to-liquid) plant. The FT
 * reactor's heat REMOVAL is the dominant thermal duty: CO2 hydrogenation to
 * hydrocarbons releases ~165 kJ per mole of CO2 converted, recovered as steam
 * on the cooling side of a boiling heat exchanger / steam drum.
 *
 * Sizes: exotherm duty Q (given, OR from the CO2 conversion rate x reaction
 * enthalpy), saturated steam raised (Q / h_fg), the boiling-HX heat-transfer
 * area (Q = U A dT, isothermal boiling so LMTD = T_reactor - T_sat) and the
 * steam-drum volume (~10-min vapour holdup). Saturated-steam properties from an
 * embedded IAPWS-IF97 table.
 *
 * Pattern mirrors reactor-cstr-pfr-sizing.ts / reaction-stoichiometry-balance.ts
 * exactly: spawn the repo .venv python on the paired impl, marshal JSON in/out,
 * attach tool provenance. The Python returns a `worked[]` array (built from its
 * live values via _worked.py) which the executor stows in
 * contract.worked_calculations[tool_id] and the attribution appendix renders so
 * a reviewer can hand-check the maths.
 *
 * Design correlations cited inline in the Python (energy balance; boiling-HX
 * Q = U A dT, Coulson & Richardson / Sinnott; saturated-steam properties
 * IAPWS-IF97; FT/CO2-hydrogenation reaction enthalpy ~ -165 kJ/mol CO2). No
 * fabricated constants.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface SteamGeneratorInput {
  /** FT reactor heat to remove [kW], OR supply co2_converted_kmol_h. */
  exotherm_duty_kw?: number
  co2_converted_kmol_h?: number
  /** |dH| per mol CO2 hydrogenated to -CH2- [kJ/mol] (default 165). */
  dh_rxn_kj_mol?: number
  /** Raised-steam pressure [bar] (default 20). */
  steam_pressure_bar?: number
  /** Boiler feedwater temperature [K] (default 378). */
  feedwater_t_k?: number
  /** FT reactor (hot side) temperature [K] (default 573). */
  reactor_t_k?: number
  /** Overall heat-transfer coefficient, boiling HX [W/m2K] (default 500). */
  u_w_m2k?: number
}

export interface SteamGeneratorOutput {
  exotherm_duty_kw: number
  exotherm_duty_basis: string
  co2_converted_kmol_h: number | null
  dh_rxn_kj_mol: number
  steam_raised_kg_h: number
  steam_pressure_bar: number
  steam_tsat_c: number
  h_fg_kj_kg: number
  steam_property_basis: string
  reactor_t_k: number
  feedwater_t_k: number
  lmtd_k: number
  u_w_m2k: number
  heat_transfer_area_m2: number
  drum_volume_m3: number
  warnings: string[]
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'process:steam-generator'
const SCRIPT = resolve(__dirname, 'python', 'steam_generator_sizing.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const steamGeneratorSizing: Tool<SteamGeneratorInput, SteamGeneratorOutput> = {
  id: TOOL_ID,
  name: 'Steam Generator (FT reactor heat recovery) Sizing',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/process',
  domain: 'process',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    return envelope.class === 'e_fuel_synthesis'
  },
  async invoke(input): Promise<ToolResult<SteamGeneratorOutput>> {
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
      const output = JSON.parse(proc.stdout) as SteamGeneratorOutput & { error?: string }
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
        warnings: Array.isArray(output.warnings) ? output.warnings : [],
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

registerTool(steamGeneratorSizing)
