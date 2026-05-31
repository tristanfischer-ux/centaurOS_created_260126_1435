/**
 * scripts/lib/orchestrator/tools/pvlib-run.ts
 *
 * TypeScript wrapper for `pvlib_run.py` — subprocess to repo .venv.
 *
 * Auto-generated 2026-05-22 by /tmp/wrap-gen/gen.py. The Python wrapper
 * is the canonical implementation; this TS wrapper marshals the JSON
 * input + output and registers the tool with the orchestrator registry.
 *
 * License: BSD-3-Clause. Source: github.com/pvlib/pvlib-python
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'pvlib_run.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const pvlibRunTool: Tool<any, any> = {
  id: 'pvlib:solar-irradiance',
  name: 'pvlib Solar Irradiance',
  version: '0.15.1',
  license: 'BSD-3-Clause',
  source_url: 'github.com/pvlib/pvlib-python',
  domain: 'photonics',
  pinned_environment: { python: '3.14.4', pvlib: '0.15.1' },
  applicable_to(envelope) { return ['haps', 'vertical_farm', 'solar_inverter', 'wind_turbine'].includes(envelope.class) },
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
          source: 'tool:pvlib:solar-irradiance',
          tool_id: 'pvlib:solar-irradiance',
          tool_version: '0.15.1',
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
          source: 'tool:pvlib:solar-irradiance',
          tool_id: 'pvlib:solar-irradiance',
          tool_version: '0.15.1',
        },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:pvlib:solar-irradiance',
        tool_id: 'pvlib:solar-irradiance',
        tool_version: '0.15.1',
        tool_license: 'BSD-3-Clause',
        tool_source_url: 'github.com/pvlib/pvlib-python',
        invocation_input: input,
        invocation_output_field: '(multiple)',
        pinned_versions: { python: '3.14.4', pvlib: '0.15.1' },
        timestamp: new Date().toISOString(),
        duration_ms,
      },
      warnings: [],
    }
  },
}
registerTool(pvlibRunTool)
