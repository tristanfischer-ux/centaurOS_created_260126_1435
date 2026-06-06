/**
 * scripts/lib/orchestrator/tools/asf-chain-growth.ts
 *
 * process:asf-chain-growth — Anderson-Schulz-Flory (ASF) chain-growth + OXCCU
 * wax-hydrocracking selectivity model for the e-fuel (Power-to-Liquid) Fischer-
 * Tropsch SAF plant.
 *
 * Given an effective chain-growth probability alpha and the wax-to-jet conversion
 * fraction (OXCCU selective hydrocracking), the tool computes the full ASF
 * weight-fraction distribution and aggregates it into the six standard FT product
 * cuts (C1/LPG/naphtha/jet/diesel/wax), producing the transparency outputs the
 * e_fuel_synthesis emitter reads:
 *
 *   jet_selectivity_frac      — upgraded jet cut (C10–C16 raw + wax→jet conversion)
 *   naphtha_selectivity_frac  — C5–C9 straight-run cut (unchanged by hydrocracking)
 *   ft_wax_residue_frac       — unconverted wax residue after upgrading
 *   methane_selectivity_frac  — C1 loss fraction
 *   carbon_to_liquids_frac    — C5+ liquid yield (= 1 - CH4 - LPG)
 *
 * NOTE — scope:
 *   ASF governs the SAF:naphtha SPLIT of the total liquid product.  It does NOT
 *   govern the overall CO2→liquid conversion rate (per_pass_conversion_frac or
 *   carbon_to_liquids_frac as defined in the mass-balance); overriding those from
 *   this tool would corrupt the mass balance.  The class-plan contract_update
 *   therefore writes ONLY jet_selectivity_frac, naphtha_selectivity_frac and
 *   ft_wax_residue_frac — not carbon_to_liquids_frac or per_pass_conversion_frac.
 *
 * Applicable to: e_fuel_synthesis only (Fischer-Tropsch SAF context).
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface AsfChainGrowthInput {
  /** Chain-growth probability alpha in (0,1).  Required — use the calibrated
   *  effective alpha for OXCCU's iron catalyst (see class plan comment). */
  alpha: number
  /** Fraction of the C21+ wax cut converted to jet (C10–C16) range by selective
   *  hydrocracking.  Default 0.80. */
  wax_to_jet_conversion?: number
  /** 'iron' | 'cobalt'.  Default 'iron'. */
  catalyst?: string
  /** Fraction of diesel cut (C17–C20) shifted to jet.  Default 0.0. */
  diesel_to_jet_fraction?: number
  /** Maximum carbon number for ASF sum.  Default 50. */
  n_max?: number
  /** FT reactor temperature [degC] — informational only when alpha is supplied
   *  explicitly (the tool uses alpha directly; temperature is recorded in the
   *  worked[] array for traceability). */
  reactor_temp_c?: number
}

export interface AsfChainGrowthOutput {
  alpha: number
  alpha_source: 'input' | 'estimated_from_temperature'
  alpha_basis: string
  reactor_temp_c: number
  catalyst: string
  n_max: number
  // Raw ASF cuts (straight chain growth, before OXCCU wax upgrading)
  methane_frac: number
  lpg_frac: number
  naphtha_frac: number
  jet_frac_raw: number
  diesel_frac: number
  wax_frac_raw: number
  cut_sum: number
  // After OXCCU wax hydrocracking
  wax_to_jet_conversion: number
  diesel_to_jet_fraction: number
  jet_selectivity_frac: number       // the key output — upgraded jet cut fraction
  naphtha_selectivity_frac: number   // straight-run naphtha (unchanged)
  wax_residue_frac: number           // unconverted wax after upgrading
  diesel_residue_frac: number
  methane_selectivity_frac: number
  carbon_to_liquids_frac: number     // C5+ liquid yield (informational; do NOT write to contract)
  peak_carbon_number: number
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'process:asf-chain-growth'
const SCRIPT = resolve(__dirname, 'python', 'asf_chain_growth.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

// Applicable only to the e-fuel (Power-to-Liquid Fischer-Tropsch) class.
const APPLICABLE_CLASSES = new Set<string>([
  'e_fuel_synthesis',
])

export const asfChainGrowth: Tool<AsfChainGrowthInput, AsfChainGrowthOutput> = {
  id: TOOL_ID,
  name: 'ASF Chain-Growth / FT Selectivity (OXCCU PtL)',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/process',
  domain: 'process',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    return APPLICABLE_CLASSES.has(envelope.class)
  },
  async invoke(input): Promise<ToolResult<AsfChainGrowthOutput>> {
    const t0 = Date.now()
    const proc = spawnSync(VENV_PY, [SCRIPT], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      timeout: 30_000,
    })
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
      const output = JSON.parse(proc.stdout) as AsfChainGrowthOutput & { error?: string }
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
        warnings: output.data_sources ? [] : ['data_sources missing from output'],
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

registerTool(asfChainGrowth)
