/**
 * scripts/lib/orchestrator/tools/cantera-real.ts
 *
 * REAL Cantera wrapper for thermochemistry + ideal-gas properties.
 * License: BSD. Source: github.com/Cantera/cantera
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface CanteraInput {
  mode?: 'equilibrium' | 'ideal_gas_thermo'
  mechanism?: string                       // e.g. 'gri30.yaml'
  composition?: string                     // e.g. 'H2:2, O2:1, N2:3.76'
  t_in_k?: number
  p_pa?: number
  species?: string                         // for ideal_gas_thermo mode
  t_k?: number
}

export interface CanteraOutput {
  mode: string
  mechanism?: string
  initial_composition?: string
  equilibrium_temp_k?: number
  equilibrium_pressure_bar?: number
  final_composition_mole_fractions?: Record<string, number>
  species?: string
  temperature_k?: number
  pressure_pa?: number
  cp_mass_j_kgk?: number
  cv_mass_j_kgk?: number
  density_kg_m3?: number
  enthalpy_mass_j_kg?: number
  _meta?: { wall_time_s: number }
}

const SCRIPT = resolve(__dirname, 'python', 'cantera_run.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const canteraReal: Tool<CanteraInput, CanteraOutput> = {
  id: 'cantera:thermochemistry',
  name: 'Cantera Thermochemistry',
  version: '3.2.0',
  license: 'BSD-3-Clause',
  source_url: 'github.com/Cantera/cantera',
  domain: 'biochemistry',
  pinned_environment: { python: '3.14.4', cantera: '3.2.0' },
  applicable_to(envelope) {
    return ['bioreactor', 'heat_pump_residential'].includes(envelope.class)
  },
  async invoke(input): Promise<ToolResult<CanteraOutput>> {
    const t0 = Date.now()
    const proc = spawnSync(VENV_PY, [SCRIPT], { input: JSON.stringify(input), encoding: 'utf-8', timeout: 30_000 })
    const duration_ms = Date.now() - t0
    if (proc.status !== 0) {
      return { ok: false, output: null, provenance: { source: 'tool:cantera:thermochemistry', tool_id: 'cantera:thermochemistry', tool_version: '3.2.0' }, warnings: [], error: `Python exit ${proc.status}: ${proc.stderr?.slice(0, 400)}` }
    }
    try {
      const output = JSON.parse(proc.stdout) as CanteraOutput
      return { ok: true, output, provenance: { source: 'tool:cantera:thermochemistry', tool_id: 'cantera:thermochemistry', tool_version: '3.2.0', tool_license: 'BSD-3-Clause', tool_source_url: 'github.com/Cantera/cantera', invocation_input: input, invocation_output_field: '(multiple)', pinned_versions: { python: '3.14.4', cantera: '3.2.0' }, timestamp: new Date().toISOString(), duration_ms }, warnings: [] }
    } catch (err) {
      return { ok: false, output: null, provenance: { source: 'tool:cantera:thermochemistry', tool_id: 'cantera:thermochemistry', tool_version: '3.2.0' }, warnings: [], error: `JSON parse: ${(err as Error).message}` }
    }
  },
}

registerTool(canteraReal)
