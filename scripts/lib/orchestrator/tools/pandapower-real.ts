/**
 * scripts/lib/orchestrator/tools/pandapower-real.ts
 *
 * REAL pandapower wrapper — subprocess to Python script that builds
 * an actual grid model + runs AC power flow + short-circuit calc.
 *
 * License: BSD-3-Clause. Source: github.com/e2nIEE/pandapower
 * Standalone verified 2026-05-22: 1MW BESS at 11kV PCC EU →
 *   transformer_rating_kva 1250, mass 4250kg, PCC SC 7.87kA, LV 1.0028pu.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface PandaPowerInput {
  rated_power_kw: number
  pcc_voltage_kv: number
  region: 'EU' | 'UK' | 'US' | 'ROW'
  grid_strength: 'strong' | 'medium' | 'weak'
}

export interface PandaPowerOutput {
  transformer_rating_kva: number
  transformer_impedance_pct: number
  transformer_mass_kg: number
  pcc_short_circuit_ka: number
  lv_voltage_at_pcs_pu: number
  voltage_unbalance_pct: number
  harmonic_distortion_pct: number
  ena_g99_compliance: boolean
  ieee_519_compliance: boolean
  _meta?: { wall_time_s: number }
}

const SCRIPT = resolve(__dirname, 'python', 'pandapower_run.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const pandapowerGridReal: Tool<PandaPowerInput, PandaPowerOutput> = {
  id: 'pandapower:grid-integration',
  name: 'pandapower Grid Integration',
  version: '3.4.0',
  license: 'BSD-3-Clause',
  source_url: 'github.com/e2nIEE/pandapower',
  domain: 'grid',
  pinned_environment: { python: '3.14.4', pandapower: '3.4.0' },
  applicable_to(envelope) {
    return ['bess', 'ev_charger'].includes(envelope.class) && envelope.voltage_tier !== 'extra_low'
  },
  async invoke(input): Promise<ToolResult<PandaPowerOutput>> {
    const t0 = Date.now()
    const proc = spawnSync(VENV_PY, [SCRIPT], { input: JSON.stringify(input), encoding: 'utf-8', timeout: 60_000 })
    const duration_ms = Date.now() - t0
    if (proc.status !== 0) {
      return { ok: false, output: null, provenance: { source: 'tool:pandapower:grid-integration', tool_id: 'pandapower:grid-integration', tool_version: '3.4.0' }, warnings: [], error: `Python exit ${proc.status}: ${proc.stderr?.slice(0, 400)}` }
    }
    try {
      const output = JSON.parse(proc.stdout) as PandaPowerOutput
      return { ok: true, output, provenance: { source: 'tool:pandapower:grid-integration', tool_id: 'pandapower:grid-integration', tool_version: '3.4.0', tool_license: 'BSD-3-Clause', tool_source_url: 'github.com/e2nIEE/pandapower', invocation_input: input, invocation_output_field: '(multiple)', pinned_versions: { python: '3.14.4', pandapower: '3.4.0' }, timestamp: new Date().toISOString(), duration_ms }, warnings: [] }
    } catch (err) {
      return { ok: false, output: null, provenance: { source: 'tool:pandapower:grid-integration', tool_id: 'pandapower:grid-integration', tool_version: '3.4.0' }, warnings: [], error: `JSON parse: ${(err as Error).message}` }
    }
  },
}

registerTool(pandapowerGridReal)
