/**
 * scripts/lib/orchestrator/tools/auv-hydro.ts
 *
 * TypeScript wrapper for `auv_hydro.py` — subprocess to repo .venv.
 *
 * Auto-generated 2026-05-22 by /tmp/wrap-gen/gen.py. The Python wrapper
 * is the canonical implementation; this TS wrapper marshals the JSON
 * input + output and registers the tool with the orchestrator registry.
 *
 * License: MIT. Source: github.com/python-seawater
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'auv_hydro.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const auvHydroTool: Tool<any, any> = {
  id: 'auv-hydro:drag-buoyancy',
  name: 'AUV Hydrostatic + Drag',
  version: '3.3.5',
  license: 'MIT',
  source_url: 'github.com/python-seawater',
  domain: 'thermal',
  pinned_environment: { python: '3.14.4', seawater: '3.3.5' },
  applicable_to(envelope) { return ['auv'].includes(envelope.class) },
  async invoke(input: any): Promise<ToolResult<any>> {
    const t0 = Date.now()
    const payload = JSON.stringify(input)
    const proc = spawnSync(VENV_PYTHON, [PYTHON_SCRIPT], {
      input: payload,
      encoding: 'utf-8',
      timeout: 60_000,
    })
    const duration_ms = Date.now() - t0
    if (proc.status !== 0) {
      return {
        ok: false,
        output: null,
        provenance: {
          source: 'tool:auv-hydro:drag-buoyancy',
          tool_id: 'auv-hydro:drag-buoyancy',
          tool_version: '3.3.5',
        },
        warnings: [],
        error: `Python exit ${proc.status}: ${proc.stderr?.slice(0, 400) ?? '(no stderr)'}`,
      }
    }
    let output: any
    try {
      output = JSON.parse(proc.stdout)
    } catch (err) {
      return {
        ok: false,
        output: null,
        provenance: {
          source: 'tool:auv-hydro:drag-buoyancy',
          tool_id: 'auv-hydro:drag-buoyancy',
          tool_version: '3.3.5',
        },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:auv-hydro:drag-buoyancy',
        tool_id: 'auv-hydro:drag-buoyancy',
        tool_version: '3.3.5',
        tool_license: 'MIT',
        tool_source_url: 'github.com/python-seawater',
        invocation_input: input,
        invocation_output_field: '(multiple)',
        pinned_versions: { python: '3.14.4', seawater: '3.3.5' },
        timestamp: new Date().toISOString(),
        duration_ms,
      },
      warnings: [],
    }
  },
}
registerTool(auvHydroTool)
