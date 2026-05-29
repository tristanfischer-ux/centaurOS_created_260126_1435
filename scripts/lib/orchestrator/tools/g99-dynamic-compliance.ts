/**
 * scripts/lib/orchestrator/tools/g99-dynamic-compliance.ts
 *
 * REAL wrapper for g99_dynamic_compliance.py — EREC G99 / ENA Engineering
 * Recommendation G99 grid-code compliance for UK grid-connected generators
 * (LVRT / HVRT fault-ride-through, frequency response LFSM-O/LFSM-U,
 * reactive capability, G99 type classification A/B/C/D).
 *
 * Validated 2026-05-29: 35/35 tests PASS (g99_dynamic_compliance test harness).
 * Type classification: 1 MW @ 11 kV → Type B; 25 MW @ 33 kV → Type C.
 * LVRT floor = 0.10 pu retained at 140 ms; freq response LFSM-O triggers at 50.4 Hz.
 *
 * Standards: ENA EREC G99 Issue 6 (2023), IEC 61400-21-1.
 * License: free-proprietary. Source: internal://forgeos/grid-code
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'g99_dynamic_compliance.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const g99DynamicComplianceTool: Tool<any, any> = {
  id: 'g99:dynamic-compliance',
  name: 'G99 Dynamic Compliance (EREC G99)',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/grid-code',
  domain: 'grid',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) {
    // G99 is a UK grid-code standard — applies to UK-market grid-tied generators
    return ['bess', 'wind_turbine', 'solar_inverter', 'h2_electrolyser', 'ev_charger'].includes(envelope.class)
  },
  async invoke(input: any): Promise<ToolResult<any>> {
    const t0 = Date.now()
    const proc = spawnSync(VENV_PYTHON, [PYTHON_SCRIPT], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      timeout: 60_000,
    })
    const duration_ms = Date.now() - t0
    if (proc.status !== 0) {
      return {
        ok: false,
        output: null,
        provenance: {
          source: 'tool:g99:dynamic-compliance',
          tool_id: 'g99:dynamic-compliance',
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
          source: 'tool:g99:dynamic-compliance',
          tool_id: 'g99:dynamic-compliance',
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
        source: 'tool:g99:dynamic-compliance',
        tool_id: 'g99:dynamic-compliance',
        tool_version: '1.0.0',
        tool_license: 'free-proprietary',
        tool_source_url: 'internal://forgeos/grid-code',
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

registerTool(g99DynamicComplianceTool)
