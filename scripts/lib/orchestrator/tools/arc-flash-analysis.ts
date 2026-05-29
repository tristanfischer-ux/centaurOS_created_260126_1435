/**
 * scripts/lib/orchestrator/tools/arc-flash-analysis.ts
 *
 * TypeScript wrapper for `arc_flash_ieee1584.py` — subprocess to repo .venv.
 *
 * UPGRADE 2026-05-29: replaced the simplified arc_flash_analysis.py (Ralph Lee
 * approximation) with the fully-validated arc_flash_ieee1584.py (IEEE 1584-2018
 * Annex D regression models, 20/20 tests PASS). Same tool ID preserved so
 * ev-charger + solar-inverter class plans require no changes.
 *
 * License: free-proprietary. Source: internal://forgeos/electrical
 * Standard: IEEE 1584-2018 "Guide for Performing Arc-Flash Hazard Calculations"
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'arc_flash_ieee1584.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const arcFlashAnalysisTool: Tool<any, any> = {
  id: 'arc-flash:ieee-1584',
  name: 'Arc Flash IEEE 1584',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/electrical',
  domain: 'power_electronics',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope) { return ['bess', 'ev_charger', 'h2_electrolyser', 'wind_turbine'].includes(envelope.class) },
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
          source: 'tool:arc-flash:ieee-1584',
          tool_id: 'arc-flash:ieee-1584',
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
          source: 'tool:arc-flash:ieee-1584',
          tool_id: 'arc-flash:ieee-1584',
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
        source: 'tool:arc-flash:ieee-1584',
        tool_id: 'arc-flash:ieee-1584',
        tool_version: '1.0.0',
        tool_license: 'free-proprietary',
        tool_source_url: 'internal://forgeos/electrical',
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
registerTool(arcFlashAnalysisTool)
