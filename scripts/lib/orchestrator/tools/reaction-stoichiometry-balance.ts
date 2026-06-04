/**
 * scripts/lib/orchestrator/tools/reaction-stoichiometry-balance.ts
 *
 * reaction:stoichiometry-balance — first-principles mass balance of a balanced
 * chemical reaction.
 *
 * Given a balanced reaction (species + signed coefficients, reactants negative,
 * products positive) and a basis (the known molar/mass rate of ONE species), it
 * returns the mole + mass flow of EVERY species from stoichiometry x molecular
 * weight (chemicals.MW). Grounds the CO2-mineralisation gypsum / CaCO3 / K2SO4
 * tonnages (the thin novel sub-modules that have no catalogue parts), resolving
 * the gypsum 3.91-vs-3.1 t/day discrepancy from conservation of atoms.
 *
 * Pattern mirrors cantera-real.ts exactly: spawn the repo .venv python on the
 * paired impl, marshal JSON in/out, attach tool provenance. The Python returns a
 * `worked[]` array (built from its live values via _worked.py) which the executor
 * stows in contract.worked_calculations[tool_id] and the attribution appendix
 * renders so a reviewer can hand-check the maths.
 *
 * Molecular-weight data source: NIST atomic weights via the `chemicals` package
 * (MIT). No thermodynamic data — atom conservation only.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface ReactionSpecies {
  /** Formula (e.g. 'K2SO4') or common name (e.g. 'gypsum'). For HYDRATES supply
   *  a flat Hill `formula` too (e.g. gypsum -> 'CaH4O6S') — the atom-balance check
   *  cannot parse 'CaSO4.2H2O' notation. */
  name: string
  /** Signed stoichiometric coefficient: reactants NEGATIVE, products POSITIVE. */
  coeff: number
  /** Optional CAS number to disambiguate the MW lookup (recommended for salts/hydrates). */
  cas?: string
  /** Optional flat Hill formula for the atom-balance check (required for hydrates). */
  formula?: string
}

export interface StoichiometryInput {
  reaction_name?: string
  species: ReactionSpecies[]
  basis: {
    /** Which species the known rate is for (matches a species `name`). */
    species: string
    /** The known rate value. */
    rate: number
    /** Rate unit: t/day | kg/day | kg/h | kg/s | g/s | mol/s | mol/h | mol/day | kmol/h | kmol/day. */
    unit: string
    /** true => `rate` is a MASS rate; false => a MOLE rate. */
    is_mass: boolean
    cas?: string
  }
}

export interface StoichiometrySpeciesOut {
  name: string
  role: 'reactant' | 'product'
  coeff: number
  mw_g_mol: number
  mole_flow_mol_s: number
  mass_flow_kg_s: number
  mass_flow_kg_day: number
  mass_flow_t_day: number
}

export interface StoichiometryOutput {
  reaction_name: string
  basis: { species: string; rate: number; unit: string; is_mass: boolean; molar_flow_mol_s: number }
  species: StoichiometrySpeciesOut[]
  /** Flat map species name -> mass flow (t/day) — what the dossier sub-modules read. */
  mass_flows_t_day: Record<string, number>
  mass_flows_kg_day: Record<string, number>
  /** true iff every element's net atom count across the reaction is zero. */
  atom_balanced: boolean
  element_net_atoms: Record<string, number>
  mass_balance_reactants_t_day: number
  mass_balance_products_t_day: number
  mass_closure_pct: number
  warnings: string[]
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'reaction:stoichiometry-balance'
const SCRIPT = resolve(__dirname, 'python', 'reaction_stoichiometry_balance.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

// Chemical-process classes this tool serves (CO2 mineralisation + the broader
// process-plant family: DAC, fluid processing, electrolysis, water treatment,
// bioreactor, plus the bespoke-plant fallback classes).
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

export const reactionStoichiometryBalance: Tool<StoichiometryInput, StoichiometryOutput> = {
  id: TOOL_ID,
  name: 'Reaction Stoichiometry Mass Balance',
  version: '1.0.0',
  license: 'MIT',
  source_url: 'github.com/CalebBell/chemicals',
  domain: 'process',
  pinned_environment: { python: '3.14.4', chemicals: '1.5.0' },
  applicable_to(envelope) {
    return APPLICABLE_CLASSES.has(envelope.class)
  },
  async invoke(input): Promise<ToolResult<StoichiometryOutput>> {
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
      const output = JSON.parse(proc.stdout) as StoichiometryOutput & { error?: string }
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
          tool_license: 'MIT', tool_source_url: 'github.com/CalebBell/chemicals',
          invocation_input: input, invocation_output_field: '(multiple)',
          pinned_versions: { python: '3.14.4', chemicals: '1.5.0' },
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

registerTool(reactionStoichiometryBalance)
