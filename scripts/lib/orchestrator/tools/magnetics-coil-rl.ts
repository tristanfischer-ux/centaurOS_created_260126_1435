/**
 * scripts/lib/orchestrator/tools/magnetics-coil-rl.ts
 *
 * TypeScript wrapper for `magnetics_coil_rl.py` — subprocess to repo .venv.
 * Micro-coil R, L, rise time + voltage-limited MMF ceiling.
 * Ported 2026-07-24 from the PHANTM actuator workstream (scripts/phantm/ —
 * FE-validated reference values in the python --selftest). The Python wrapper
 * is the canonical implementation; this TS wrapper marshals JSON in/out and
 * registers the tool with the orchestrator registry.
 *
 * License: free-proprietary. Source: internal://forgeos/phantm
 */

import { registerTool } from '../registry'
import type { Provenance, Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'magnetics_coil_rl.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const magneticsCoilRlTool: Tool<any, any> = {
  id: 'magnetics:coil-rl-risetime',
  name: 'Magnetics Coil R-L Rise Time',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/phantm',
  domain: 'actuation',
  pinned_environment: { python: '3.12' },
  applicable_to(envelope) {
    return ['beam_steering_actuator', 'linear_actuator', 'micro_stepper',
            'phased_array_antenna', 'reluctance_actuator'].includes(envelope.class)
  },
  async invoke(input: any): Promise<ToolResult<any>> {
    const t0 = Date.now()
    const proc = spawnSync(VENV_PYTHON, [PYTHON_SCRIPT], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      timeout: 60_000,
    })
    const duration_ms = Date.now() - t0
    const provenance: Provenance = {
      source: 'tool:magnetics:coil-rl-risetime',
      tool_id: 'magnetics:coil-rl-risetime',
      tool_version: '1.0.0',
      tool_license: 'free-proprietary',
      tool_source_url: 'internal://forgeos/phantm',
      invocation_input: input,
      invocation_output_field: '(multiple)',
      pinned_versions: { python: '3.12' },
      timestamp: new Date().toISOString(),
      duration_ms,
    }
    if (proc.status !== 0) {
      return { ok: false, output: null, provenance, warnings: [],
               error: `Python exit ${proc.status}: ${proc.stderr?.slice(0, 400) ?? '(no stderr)'}` }
    }
    try {
      return { ok: true, output: JSON.parse(proc.stdout), provenance, warnings: [] }
    } catch (err) {
      return { ok: false, output: null, provenance, warnings: [],
               error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}` }
    }
  },
}
registerTool(magneticsCoilRlTool)
