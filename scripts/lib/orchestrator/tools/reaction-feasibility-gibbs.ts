/**
 * scripts/lib/orchestrator/tools/reaction-feasibility-gibbs.ts
 *
 * reaction:feasibility-gibbs — first-principles thermodynamic feasibility of a
 * chemical reaction.
 *
 * Given a reaction (species + signed coefficients + phase) and temperature(s),
 * returns dG_rxn = Σ coeff x dGf, the equilibrium constant K = exp(-dG/RT), and a
 * feasible | borderline | infeasible verdict. Validates whether the CO2 plant's
 * NOVEL K2SO4 / MEA-regeneration loop is thermodynamically real (the subsystem with
 * no plant analogue): gypsum carbonation computes dG ≈ -96 kJ/mol => FEASIBLE.
 *
 * Pattern mirrors cantera-real.ts exactly: spawn the repo .venv python on the paired
 * impl, marshal JSON in/out, attach tool provenance. The Python returns a `worked[]`
 * array which the executor stows in contract.worked_calculations[tool_id] and the
 * attribution appendix renders for hand-checking.
 *
 * HONESTY: dGf comes from the `chemicals` package (CRC/NIST tables) for solids/liquids/
 * gases, and a CITED literature table (CRC Handbook; Robie & Hemingway USGS Bull. 2131)
 * for species the package lacks (gypsum, aqueous CO2/KOH, liquid MEA). EVERY value
 * carries its source + confidence in `gibbs_formation_table`, and a species with no
 * honest value makes the tool ERROR — a thermodynamic value is NEVER fabricated.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface GibbsReactionSpecies {
  /** Formula or common name. */
  name: string
  /** Signed stoichiometric coefficient: reactants NEGATIVE, products POSITIVE. */
  coeff: number
  /** CAS number (recommended — drives the dGf lookup). */
  cas?: string
  /** Phase: 's' | 'l' | 'g' | 'aq'. Defaults to 's'. */
  phase?: 's' | 'l' | 'g' | 'aq'
  /** Optional caller-supplied dGf (kJ/mol) override for one-off literature values. */
  gf_kj_mol?: number
  hf_kj_mol?: number
  gf_source?: string
  gf_confidence?: 'high' | 'medium' | 'low' | 'unknown'
}

export interface GibbsInput {
  reaction_name?: string
  species: GibbsReactionSpecies[]
  /** Temperatures (K) to evaluate. Defaults to [298.15]. */
  temperatures_k?: number[]
}

export interface GibbsTemperatureResult {
  temperature_k: number
  delta_g_rxn_kj_mol: number
  delta_h_rxn_kj_mol: number | null
  equilibrium_constant_K: number
  ln_K: number
  log10_K: number | null
  verdict: 'feasible' | 'borderline' | 'infeasible'
  temperature_basis: string
}

export interface GibbsFormationRow {
  name: string
  coeff: number
  phase: string
  gf_kj_mol: number
  hf_kj_mol: number | null
  source: string
  confidence: 'high' | 'medium' | 'low' | 'unknown'
}

export interface GibbsOutput {
  reaction_name: string
  delta_g_rxn_298k_kj_mol: number
  delta_h_rxn_298k_kj_mol: number | null
  verdict: 'feasible' | 'borderline' | 'infeasible'
  equilibrium_constant_K: number
  results_by_temperature: GibbsTemperatureResult[]
  gibbs_formation_table: GibbsFormationRow[]
  lowest_data_confidence: 'high' | 'medium' | 'low' | 'unknown'
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'reaction:feasibility-gibbs'
const SCRIPT = resolve(__dirname, 'python', 'reaction_feasibility_gibbs.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

// Same chemical-process class set as the stoichiometry tool.
const APPLICABLE_CLASSES = new Set<string>([
  'co2_mineralisation',
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

export const reactionFeasibilityGibbs: Tool<GibbsInput, GibbsOutput> = {
  id: TOOL_ID,
  name: 'Reaction Feasibility (Gibbs Free Energy)',
  version: '1.0.0',
  license: 'MIT',
  source_url: 'github.com/CalebBell/chemicals',
  domain: 'process',
  pinned_environment: { python: '3.14.4', chemicals: '1.5.0' },
  applicable_to(envelope) {
    return APPLICABLE_CLASSES.has(envelope.class)
  },
  async invoke(input): Promise<ToolResult<GibbsOutput>> {
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
      const output = JSON.parse(proc.stdout) as GibbsOutput & { error?: string }
      if (output.error) {
        // Honest data-gap (a species lacked a cited dGf) — surfaced, not swallowed.
        return {
          ok: false, output: null,
          provenance: { source: `tool:${TOOL_ID}`, tool_id: TOOL_ID, tool_version: '1.0.0' },
          warnings: [], error: output.error,
        }
      }
      // Carry the worst-case data confidence as a warning so the design flags it.
      const warnings: string[] = []
      if (output.lowest_data_confidence && output.lowest_data_confidence !== 'high') {
        warnings.push(
          `lowest thermodynamic-data confidence is '${output.lowest_data_confidence}' — ` +
          `the verdict relies on a literature/estimated dGf (see gibbs_formation_table)`)
      }
      return {
        ok: true, output,
        provenance: {
          source: `tool:${TOOL_ID}`, tool_id: TOOL_ID, tool_version: '1.0.0',
          tool_license: 'MIT', tool_source_url: 'github.com/CalebBell/chemicals',
          invocation_input: input, invocation_output_field: '(multiple)',
          pinned_versions: { python: '3.14.4', chemicals: '1.5.0' },
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

registerTool(reactionFeasibilityGibbs)
