/**
 * scripts/lib/orchestrator/tools/opendss-real.ts
 *
 * REAL OpenDSS wrapper. Subprocess to Python's opendssdirect.py.
 * License: BSD (EPRI). Source: github.com/dss-extensions/OpenDSSDirect.py
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface OpenDssInput {
  rated_power_kw: number
  pcc_voltage_kv: number
  feeder_length_km?: number
}

export interface OpenDssOutput {
  pcc_voltage_pu: number
  pcc_voltage_phase_v: number
  feeder_losses_kw: number
  pcc_voltage_within_en50160_limits: boolean
  solution_converged: boolean
  _meta?: { wall_time_s: number }
}

const SCRIPT = resolve(__dirname, 'python', 'opendss_run.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const opendssFeederReal: Tool<OpenDssInput, OpenDssOutput> = {
  id: 'opendss:feeder-flow',
  name: 'OpenDSS Feeder Load Flow',
  version: '0.9.4',
  license: 'BSD-3-Clause',
  source_url: 'github.com/dss-extensions/OpenDSSDirect.py',
  domain: 'grid',
  pinned_environment: { python: '3.14.4', opendssdirect: '0.9.4' },
  applicable_to(envelope) {
    return ['bess', 'ev_charger'].includes(envelope.class)
  },
  async invoke(input): Promise<ToolResult<OpenDssOutput>> {
    const t0 = Date.now()
    const proc = spawnSync(VENV_PY, [SCRIPT], { input: JSON.stringify(input), encoding: 'utf-8', timeout: 30_000 })
    const duration_ms = Date.now() - t0
    if (proc.status !== 0) {
      return { ok: false, output: null, provenance: { source: 'tool:opendss:feeder-flow', tool_id: 'opendss:feeder-flow', tool_version: '0.9.4' }, warnings: [], error: `Python exit ${proc.status}: ${proc.stderr?.slice(0, 400)}` }
    }
    try {
      const output = JSON.parse(proc.stdout) as OpenDssOutput
      return { ok: true, output, provenance: { source: 'tool:opendss:feeder-flow', tool_id: 'opendss:feeder-flow', tool_version: '0.9.4', tool_license: 'BSD-3-Clause', tool_source_url: 'github.com/dss-extensions/OpenDSSDirect.py', invocation_input: input, invocation_output_field: '(multiple)', pinned_versions: { python: '3.14.4', opendssdirect: '0.9.4' }, timestamp: new Date().toISOString(), duration_ms }, warnings: [] }
    } catch (err) {
      return { ok: false, output: null, provenance: { source: 'tool:opendss:feeder-flow', tool_id: 'opendss:feeder-flow', tool_version: '0.9.4' }, warnings: [], error: `JSON parse: ${(err as Error).message}` }
    }
  },
}

registerTool(opendssFeederReal)
