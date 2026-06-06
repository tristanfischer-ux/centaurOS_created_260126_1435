/**
 * scripts/lib/orchestrator/tools/gas-compressor-sizing.ts
 *
 * gas:compressor-sizing — first-principles sizing of a multi-stage centrifugal /
 * reciprocating gas compressor: stage count, per-stage pressure ratio, real-gas
 * POLYTROPIC head + shaft/driver power, discharge temperature and the total
 * intercooler heat-rejection duty, for an arbitrary gas mixture (H2 / CO2 / CO /
 * CH4 / N2 / H2O).
 *
 * Grounds the e-fuel synthesis (power-to-liquid / SAF) feed-compression train:
 * the CO2 + green-H2 feed must be raised from near-atmospheric capture pressure
 * to the FT / methanol synthesis loop pressure (20-30 bar). The compression duty
 * (and its intercooler heat rejection) is a major CAPEX/OPEX line and a real BoM
 * item — previously LLM-guessed. Real-gas Z matters: CO2 near its critical point
 * (304 K, 74 bar) departs materially from ideal.
 *
 * Pattern mirrors reactor-cstr-pfr-sizing.ts / reaction-stoichiometry-balance.ts
 * exactly: spawn the repo .venv python on the paired impl, marshal JSON in/out,
 * attach tool provenance. The Python returns a `worked[]` array (built from its
 * live values via _worked.py) which the executor stows in
 * contract.worked_calculations[tool_id] and the attribution appendix renders so a
 * reviewer can hand-check the maths.
 *
 * Design correlations cited inline in the Python (GPSA Engineering Data Book §13
 * polytropic head + power; Peng-Robinson 1976 EOS for real-gas Z; Reid-Prausnitz-
 * Poling critical constants). No fabricated constants.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface GasCompressorSizingInput {
  /** Total mass throughput [kg/h]. Required. */
  mass_flow_kg_h: number
  /** Optional MOLE fractions among H2, CO2, CO, CH4, N2, H2O. Drives MW, k and
   *  the Peng-Robinson real-gas Z. If absent, supply mol_weight (+ k_cp_cv) and
   *  Z is taken as 1.0 (a warning is emitted). */
  composition?: Record<string, number>
  /** Used iff no composition: mixture molecular weight [g/mol]. */
  mol_weight?: number
  /** Used iff no composition: heat-capacity ratio Cp/Cv [-]. Default 1.3. */
  k_cp_cv?: number
  /** Inlet absolute pressure [bar]. Required. */
  p_in_bar: number
  /** Discharge absolute pressure [bar]. Required. */
  p_out_bar: number
  /** Inlet (and post-intercool) temperature [K]. Default 313.15. */
  t_in_k?: number
  /** Polytropic efficiency [-]. Default 0.75. */
  poly_eff?: number
  /** Mechanical/transmission efficiency [-]. Default 0.95. */
  mech_eff?: number
  /** Maximum per-stage pressure ratio [-]. Default 3.5. */
  max_stage_ratio?: number
  /** Intercooler outlet temperature [K]. Default = t_in_k. */
  intercool_t_k?: number
}

export interface GasCompressorSizingOutput {
  n_stages: number
  stage_pressure_ratio: number
  shaft_power_kw: number
  driver_power_kw: number
  discharge_t_k: number
  intercooler_total_duty_kw: number
  mixture_mw: number
  mixture_k: number
  z_inlet: number
  z_outlet: number
  overall_pressure_ratio: number
  mass_flow_kg_h: number
  property_basis: string
  worked: unknown[]
  warnings: string[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'gas:compressor-sizing'
const SCRIPT = resolve(__dirname, 'python', 'gas_compressor_sizing.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

// Pure first-principles thermodynamics; applicable ONLY to the e-fuel synthesis
// class per the task scope (CO2 + H2 feed compression, syngas recycle, tail-gas
// boost on a power-to-liquid / SAF plant).
const APPLICABLE_CLASSES = new Set<string>([
  'e_fuel_synthesis',
])

export const gasCompressorSizing: Tool<GasCompressorSizingInput, GasCompressorSizingOutput> = {
  id: TOOL_ID,
  name: 'Gas Compressor (Multi-Stage Polytropic) Sizing',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/process',
  domain: 'process',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    return APPLICABLE_CLASSES.has(envelope.class)
  },
  async invoke(input): Promise<ToolResult<GasCompressorSizingOutput>> {
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
      const output = JSON.parse(proc.stdout) as GasCompressorSizingOutput & { error?: string }
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
        warnings: output.warnings ?? [],
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

registerTool(gasCompressorSizing)
