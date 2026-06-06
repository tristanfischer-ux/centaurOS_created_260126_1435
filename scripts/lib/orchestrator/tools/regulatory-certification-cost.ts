/**
 * scripts/lib/orchestrator/tools/regulatory-certification-cost.ts
 *
 * TypeScript wrapper for `regulatory_certification_cost.py` — subprocess to repo .venv.
 *
 * Auto-generated 2026-05-22 by /tmp/wrap-gen/gen.py. The Python wrapper
 * is the canonical implementation; this TS wrapper marshals the JSON
 * input + output and registers the tool with the orchestrator registry.
 *
 * License: free-proprietary. Source: internal://forgeos/regulatory
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'
import { isProcessPlantClass, markNotEstimatedForClass } from './generic-tool-class-applicability'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'regulatory_certification_cost.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const regulatoryCertificationCostTool: Tool<any, any> = {
  id: 'regulatory-cert-cost:lookup',
  name: 'Regulatory Certification Cost',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/regulatory',
  domain: 'standards',
  pinned_environment: { python: '3.14.4' },
  applicable_to() { return true },
  async invoke(input: any, contract?: any): Promise<ToolResult<any>> {
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
          source: 'tool:regulatory-cert-cost:lookup',
          tool_id: 'regulatory-cert-cost:lookup',
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
          source: 'tool:regulatory-cert-cost:lookup',
          tool_id: 'regulatory-cert-cost:lookup',
          tool_version: '1.0.0',
        },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    // 2026-06-06 (FIX 5): the certification-cost lookup is keyed to discrete-
    // product conformity schemes (CE/UKCA marking, type approval, EMC test) and
    // returned £0 / 0 months for the process plant — but a COMAH / PED / ATEX /
    // DSEAR major-hazard installation carries a substantial, schedule-driving
    // safety-case and design-code cost that this table does not hold. Declare
    // not-estimated-for-this-class rather than render a misleading £0; the
    // renderer suppresses the number. Tool still ran + is listed.
    const warnings: string[] = []
    if (output && typeof output === 'object' && isProcessPlantClass(contract?.product_class)) {
      output = markNotEstimatedForClass(
        output,
        'a major-hazard process installation is certified under the process-safety '
        + 'regime (COMAH safety case, PED / EN 13445 vessel codes, DSEAR / ATEX '
        + 'hazardous-area assessment, environmental permitting), not a discrete-'
        + 'product conformity scheme; the certification cost & critical path must be '
        + 'scoped with a process-safety consultant at FEED stage.',
      )
      warnings.push('regulatory-cert-cost not calibrated for process-plant class — output marked not_estimated_for_class')
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:regulatory-cert-cost:lookup',
        tool_id: 'regulatory-cert-cost:lookup',
        tool_version: '1.0.0',
        tool_license: 'free-proprietary',
        tool_source_url: 'internal://forgeos/regulatory',
        invocation_input: input,
        invocation_output_field: '(multiple)',
        pinned_versions: { python: '3.14.4' },
        timestamp: new Date().toISOString(),
        duration_ms,
      },
      warnings,
    }
  },
}
registerTool(regulatoryCertificationCostTool)
