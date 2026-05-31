/**
 * scripts/lib/orchestrator/tools/aerosandbox-run.ts
 *
 * TypeScript wrapper for `aerosandbox_run.py` — subprocess to repo .venv.
 *
 * Auto-generated 2026-05-22 by /tmp/wrap-gen/gen.py. The Python wrapper
 * is the canonical implementation; this TS wrapper marshals the JSON
 * input + output and registers the tool with the orchestrator registry.
 *
 * License: MIT. Source: github.com/peterdsharpe/aerosandbox
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'aerosandbox_run.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const aerosandboxRunTool: Tool<any, any> = {
  id: 'aerosandbox:airfoil-analysis',
  name: 'AeroSandbox Airfoil Polars',
  version: '4.2.9',
  license: 'MIT',
  source_url: 'github.com/peterdsharpe/aerosandbox',
  domain: 'aero',
  pinned_environment: { python: '3.14.4', aerosandbox: '4.2.9' },
  applicable_to(envelope) { return ['haps', 'drone', 'wind_turbine'].includes(envelope.class) },
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
          source: 'tool:aerosandbox:airfoil-analysis',
          tool_id: 'aerosandbox:airfoil-analysis',
          tool_version: '4.2.9',
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
          source: 'tool:aerosandbox:airfoil-analysis',
          tool_id: 'aerosandbox:airfoil-analysis',
          tool_version: '4.2.9',
        },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:aerosandbox:airfoil-analysis',
        tool_id: 'aerosandbox:airfoil-analysis',
        tool_version: '4.2.9',
        tool_license: 'MIT',
        tool_source_url: 'github.com/peterdsharpe/aerosandbox',
        invocation_input: input,
        invocation_output_field: '(multiple)',
        pinned_versions: { python: '3.14.4', aerosandbox: '4.2.9' },
        timestamp: new Date().toISOString(),
        duration_ms,
      },
      warnings: [],
    }
  },
}
registerTool(aerosandboxRunTool)
