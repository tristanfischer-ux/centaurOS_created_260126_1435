/**
 * scripts/lib/orchestrator/tools/rotor-centrifugal-stress.ts
 *
 * TypeScript wrapper for `rotor_centrifugal_stress.py` — subprocess to repo .venv.
 * Promoted 2026-07-28 from prototypes/mgu-mcu-pack/ (Formula E MGU/MCU pack).
 * The Python module is the canonical implementation; this wrapper marshals
 * JSON in/out and registers the tool with the orchestrator registry.
 *
 * License: free-proprietary. Source: internal://forgeos/mgu-mcu-pack
 */

import { registerTool } from '../registry'
import type { Provenance, Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'rotor_centrifugal_stress.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const RotorCentrifugalStressTool: Tool<any, any> = {
  id: 'motor:rotor-centrifugal-stress',
  name: 'Rotor Centrifugal Rim / Sleeve Stress',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/mgu-mcu-pack',
  domain: 'mechanical',
  pinned_environment: { python: '3.12' },
  applicable_to(envelope) {
    return [
            'formula_e_rear_mgu',
            'traction_mgu',
            'electric_powertrain',
            'ev_drive_unit',
            'e_bike',
            'evtol',
            'drone',
    ].includes(envelope.class)
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
      source: 'tool:motor:rotor-centrifugal-stress',
      tool_id: 'motor:rotor-centrifugal-stress',
      tool_version: '1.0.0',
      tool_license: 'free-proprietary',
      tool_source_url: 'internal://forgeos/mgu-mcu-pack',
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
      const output = JSON.parse(proc.stdout)
      const warnings = Array.isArray(output?.warnings) ? output.warnings : []
      return { ok: true, output, provenance, warnings }
    } catch (err) {
      return { ok: false, output: null, provenance, warnings: [],
               error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}` }
    }
  },
}
registerTool(RotorCentrifugalStressTool)
