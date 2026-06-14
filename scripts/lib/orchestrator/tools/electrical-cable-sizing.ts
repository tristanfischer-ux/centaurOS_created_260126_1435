/**
 * scripts/lib/orchestrator/tools/electrical-cable-sizing.ts
 *
 * electrical:cable-sizing — first-principles sizing of the main LV feeder cable
 * from the design current, run length and voltage: select the smallest STANDARD
 * conductor cross-sectional area (CSA, mm2) whose de-rated ampacity carries the
 * design current, then compute the volt-drop as a percentage of nominal, per
 * BS 7671 (IET Wiring Regulations) Appendix 4 / IEC 60364-5-52 ampacity +
 * mV/A/m tables.
 *
 * Grounds the CO2-mineralisation Electrical Distribution module — which showed
 * NO computation because the engine had no cable sizing tool. A feeder SIZED to
 * BS 7671 ampacity with a checked volt-drop IS the BoM line item (conductor CSA
 * + design current + volt-drop %) instead of an LLM guess.
 *
 * Pattern mirrors reactor-cstr-pfr-sizing.ts exactly: spawn the repo .venv
 * python on the paired impl, marshal JSON in/out, attach tool provenance. The
 * Python returns a `worked[]` array (built from its live values via _worked.py)
 * which the executor stows in contract.worked_calculations[tool_id] and the
 * attribution appendix renders so a reviewer can hand-check the maths.
 *
 * Tabulated ampacity + mV/A/m values are the published BS 7671 Appendix 4 /
 * IEC 60364-5-52 reference figures. No fabricated constants. The Python ERRORS
 * (rather than fabricating) when no standard CSA carries the target current.
 *
 * British spelling.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface CableSizingInput {
  cable_name?: string
  /** Design current [A], OR supply load_kw + voltage_v. */
  design_current_a?: number
  load_kw?: number
  voltage_v?: number
  power_factor?: number
  phases?: number
  /** Cable route length [m]. */
  length_m?: number
  /** Nominal system voltage for the volt-drop percentage [V]. */
  nominal_voltage_v?: number
  /** 'copper' | 'aluminium'. */
  conductor?: string
  /** BS 7671 ambient-temperature de-rating factor Ca [0.1,1]. */
  ambient_derate_ca?: number
  /** BS 7671 grouping de-rating factor Cg [0.1,1]. */
  grouping_derate_cg?: number
  /** Conductors per phase in parallel. */
  n_parallel?: number
  /** Advisory volt-drop ceiling [%] (BS 7671 §525). */
  max_voltdrop_pct?: number
}

export interface CableSizingOutput {
  cable_name: string
  conductor: string
  phases: number
  length_m: number
  nominal_voltage_v: number
  ambient_derate_ca: number
  grouping_derate_cg: number
  n_parallel: number
  /** Parallel runs the CALLER requested (before any auto-escalation). */
  n_parallel_requested: number
  /** True when the tool grew n_parallel because no single standard CSA could
   *  carry the de-rated target current (high-current LV feeder split). */
  parallel_auto_escalated: boolean
  tabulated_current_target_a: number
  selected_ampacity_a: number
  selected_ampacity_total_a: number
  mv_per_a_m: number
  main_feeder_cable_csa_mm2: number
  feeder_design_current_a: number
  cable_voltdrop_pct: number
  voltdrop_within_limit: boolean
  worked: unknown[]
  data_sources: string[]
  _meta?: { wall_time_s: number }
}

const TOOL_ID = 'electrical:cable-sizing'
const SCRIPT = resolve(__dirname, 'python', 'electrical_cable_sizing.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

// Process-plant family this tool serves (CO2 mineralisation + the broader
// process-plant classes whose main electrical feeder needs BS 7671 sizing).
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

export const electricalCableSizing: Tool<CableSizingInput, CableSizingOutput> = {
  id: TOOL_ID,
  name: 'Electrical Main Feeder Cable Sizing (BS 7671)',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/electrical',
  domain: 'grid',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    return APPLICABLE_CLASSES.has(envelope.class)
  },
  async invoke(input): Promise<ToolResult<CableSizingOutput>> {
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
      const output = JSON.parse(proc.stdout) as CableSizingOutput & { error?: string }
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
          tool_license: 'free-proprietary', tool_source_url: 'internal://forgeos/electrical',
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

registerTool(electricalCableSizing)
