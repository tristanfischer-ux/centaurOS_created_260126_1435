/**
 * scripts/lib/orchestrator/tools/nrlmsise00-run.ts
 *
 * TypeScript wrapper for `nrlmsise00_run.py` — subprocess to repo .venv.
 *
 * Auto-generated 2026-05-22 by /tmp/wrap-gen/gen.py. The Python wrapper
 * is the canonical implementation; this TS wrapper marshals the JSON
 * input + output and registers the tool with the orchestrator registry.
 *
 * License: free-proprietary. Source: internal://forgeos/spacecraft
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'nrlmsise00_run.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const nrlmsise00RunTool: Tool<any, any> = {
  id: 'nrlmsise00:leo-density',
  name: 'NRLMSISE-00 LEO Atmospheric Density',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/spacecraft',
  domain: 'aero',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) { return ['satellite_smallsat', 'satellite_cubesat'].includes(envelope.class) },
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
          source: 'tool:nrlmsise00:leo-density',
          tool_id: 'nrlmsise00:leo-density',
          tool_version: '1.0.0',
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
          source: 'tool:nrlmsise00:leo-density',
          tool_id: 'nrlmsise00:leo-density',
          tool_version: '1.0.0',
        },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:nrlmsise00:leo-density',
        tool_id: 'nrlmsise00:leo-density',
        tool_version: '1.0.0',
        tool_license: 'free-proprietary',
        tool_source_url: 'internal://forgeos/spacecraft',
        invocation_input: input,
        invocation_output_field: '(multiple)',
        pinned_versions: { python: '3.14.4' },
        timestamp: new Date().toISOString(),
        duration_ms,
      },
      warnings: [],
    }
  },
}
registerTool(nrlmsise00RunTool)
