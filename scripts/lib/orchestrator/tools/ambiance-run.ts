/**
 * scripts/lib/orchestrator/tools/ambiance-run.ts
 *
 * TypeScript wrapper for `ambiance_run.py` — subprocess to repo .venv.
 *
 * Auto-generated 2026-05-22 by /tmp/wrap-gen/gen.py. The Python wrapper
 * is the canonical implementation; this TS wrapper marshals the JSON
 * input + output and registers the tool with the orchestrator registry.
 *
 * License: MIT. Source: github.com/airinnova/ambiance
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'ambiance_run.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const ambianceRunTool: Tool<any, any> = {
  id: 'ambiance:isa-atmosphere',
  name: 'Ambiance ISA Atmosphere',
  version: '1.3.1',
  license: 'MIT',
  source_url: 'github.com/airinnova/ambiance',
  domain: 'aero',
  pinned_environment: { python: '3.14.4', ambiance: '1.3.1' },
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
          source: 'tool:ambiance:isa-atmosphere',
          tool_id: 'ambiance:isa-atmosphere',
          tool_version: '1.3.1',
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
          source: 'tool:ambiance:isa-atmosphere',
          tool_id: 'ambiance:isa-atmosphere',
          tool_version: '1.3.1',
        },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:ambiance:isa-atmosphere',
        tool_id: 'ambiance:isa-atmosphere',
        tool_version: '1.3.1',
        tool_license: 'MIT',
        tool_source_url: 'github.com/airinnova/ambiance',
        invocation_input: input,
        invocation_output_field: '(multiple)',
        pinned_versions: { python: '3.14.4', ambiance: '1.3.1' },
        timestamp: new Date().toISOString(),
        duration_ms,
      },
      warnings: [],
    }
  },
}
registerTool(ambianceRunTool)
