/**
 * scripts/lib/orchestrator/tools/fia-power-regen-split.ts
 *
 * TypeScript wrapper for `fia_power_regen_split.py`.
 * SOURCE: public FIA FE tech regs + GEN3/GEN4 fact-sheet power envelopes.
 */

import { registerTool } from '../registry'
import type { Provenance, Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'fia_power_regen_split.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const FiaPowerRegenSplitTool: Tool<any, any> = {
  id: 'powertrain:fia-power-regen-split',
  name: 'FIA Axle Power / Regen Split Feasibility',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'https://www.fia.com/regulation/category/109',
  domain: 'power_electronics',
  pinned_environment: { python: '3.12' },
  applicable_to(envelope) {
    return [
      'formula_e_rear_mgu',
      'formula_e_front_mgu',
      'traction_mgu',
      'electric_powertrain',
      'ev_drive_unit',
      'motor_control_unit',
    ].includes(envelope.class)
  },
  async invoke(input: any): Promise<ToolResult<any>> {
    const t0 = Date.now()
    const proc = spawnSync(VENV_PYTHON, [PYTHON_SCRIPT], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      timeout: 30_000,
    })
    const duration_ms = Date.now() - t0
    const provenance: Provenance = {
      source: 'tool:powertrain:fia-power-regen-split',
      tool_id: 'powertrain:fia-power-regen-split',
      tool_version: '1.0.0',
      tool_license: 'free-proprietary',
      tool_source_url: 'https://www.fia.com/regulation/category/109',
      invocation_input: input,
      invocation_output_field: '(multiple)',
      pinned_versions: { python: '3.12' },
      timestamp: new Date().toISOString(),
      duration_ms,
    }
    if (proc.status !== 0) {
      return {
        ok: false, output: null, provenance, warnings: [],
        error: `Python exit ${proc.status}: ${proc.stderr?.slice(0, 400) ?? '(no stderr)'}`,
      }
    }
    try {
      const output = JSON.parse(proc.stdout)
      const warnings = Array.isArray(output?.warnings) ? output.warnings : []
      return { ok: true, output, provenance, warnings }
    } catch (err) {
      return {
        ok: false, output: null, provenance, warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
  },
}
registerTool(FiaPowerRegenSplitTool)
