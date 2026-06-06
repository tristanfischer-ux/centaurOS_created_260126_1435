/**
 * scripts/lib/orchestrator/tools/cybersecurity-threat-model.ts
 *
 * TypeScript wrapper for `cybersecurity_threat_model.py` — subprocess to repo .venv.
 *
 * Auto-generated 2026-05-22 by /tmp/wrap-gen/gen.py. The Python wrapper
 * is the canonical implementation; this TS wrapper marshals the JSON
 * input + output and registers the tool with the orchestrator registry.
 *
 * License: free-proprietary. Source: internal://forgeos/cyber
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'
import { isProcessPlantClass, markNotEstimatedForClass } from './generic-tool-class-applicability'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'cybersecurity_threat_model.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const cybersecurityThreatModelTool: Tool<any, any> = {
  id: 'cybersecurity-threat-model:stride',
  name: 'STRIDE/DREAD Threat Model',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/cyber',
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
          source: 'tool:cybersecurity-threat-model:stride',
          tool_id: 'cybersecurity-threat-model:stride',
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
          source: 'tool:cybersecurity-threat-model:stride',
          tool_id: 'cybersecurity-threat-model:stride',
          tool_version: '1.0.0',
        },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    // 2026-06-06 (FIX 5): the STRIDE/DREAD model scores a connected consumer/
    // industrial PRODUCT's attack surface (radios, OTA, PII, OCPP, etc.); a
    // continuous process plant's cyber risk is an OT/ICS concern (IEC 62443
    // zones & conduits around the DCS/SIS), so the product-scale score is
    // meaningless here. Declare not-estimated-for-this-class; the renderer
    // suppresses the number. Tool still ran + is listed.
    const warnings: string[] = []
    if (output && typeof output === 'object' && isProcessPlantClass(contract?.product_class)) {
      output = markNotEstimatedForClass(
        output,
        'plant cyber risk is an operational-technology / industrial-control-system '
        + 'concern assessed under IEC 62443 (zones & conduits around the DCS and the '
        + 'safety-instrumented system), not a consumer-product STRIDE/DREAD score; '
        + 'commission an OT security assessment at FEED stage.',
      )
      warnings.push('cybersecurity-threat-model not calibrated for process-plant class — output marked not_estimated_for_class')
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:cybersecurity-threat-model:stride',
        tool_id: 'cybersecurity-threat-model:stride',
        tool_version: '1.0.0',
        tool_license: 'free-proprietary',
        tool_source_url: 'internal://forgeos/cyber',
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
registerTool(cybersecurityThreatModelTool)
