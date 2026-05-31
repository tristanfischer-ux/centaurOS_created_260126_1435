/**
 * scripts/lib/orchestrator/tools/ht-run.ts
 *
 * TypeScript wrapper for `ht_run.py` — subprocess to repo .venv.
 *
 * Auto-generated 2026-05-22 by /tmp/wrap-gen/gen.py. The Python wrapper
 * is the canonical implementation; this TS wrapper marshals the JSON
 * input + output and registers the tool with the orchestrator registry.
 *
 * License: BSD-3-Clause. Source: github.com/CalebBell/ht
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'ht_run.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const htRunTool: Tool<any, any> = {
  id: 'ht:ntu-heat-exchanger',
  name: 'HT ε-NTU Heat Exchanger',
  version: '1.2.0',
  license: 'BSD-3-Clause',
  source_url: 'github.com/CalebBell/ht',
  domain: 'thermal',
  pinned_environment: { python: '3.14.4', ht: '1.2.0' },
  applicable_to() { return true },
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
          source: 'tool:ht:ntu-heat-exchanger',
          tool_id: 'ht:ntu-heat-exchanger',
          tool_version: '1.2.0',
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
          source: 'tool:ht:ntu-heat-exchanger',
          tool_id: 'ht:ntu-heat-exchanger',
          tool_version: '1.2.0',
        },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:ht:ntu-heat-exchanger',
        tool_id: 'ht:ntu-heat-exchanger',
        tool_version: '1.2.0',
        tool_license: 'BSD-3-Clause',
        tool_source_url: 'github.com/CalebBell/ht',
        invocation_input: input,
        invocation_output_field: '(multiple)',
        pinned_versions: { python: '3.14.4', ht: '1.2.0' },
        timestamp: new Date().toISOString(),
        duration_ms,
      },
      warnings: [],
    }
  },
}
registerTool(htRunTool)
