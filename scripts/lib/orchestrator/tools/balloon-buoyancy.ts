/**
 * scripts/lib/orchestrator/tools/balloon-buoyancy.ts
 *
 * TypeScript wrapper for `balloon_buoyancy.py` — stratospheric balloon
 * buoyancy + float-altitude solver (US Standard Atmosphere 1976). Subprocess
 * to the repo .venv.
 *
 * FAMILY-APPLICABLE: keyed on the physical feature "lighter-than-air / balloon"
 * (NOT a fixed class allowlist). Governing physics (Archimedes + US-76):
 * L = (rho_air(h)-rho_gas)*V*g; float where rho_air(h*) = m_total/V + rho_gas.
 * (US Standard Atmosphere 1976; Anderson; Yajima 2009.)
 *
 * License: free-proprietary. Source: internal://forgeos/spacecraft
 */

import { registerTool } from '../registry'
import type { BriefEnvelope, PartialContract, Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'balloon_buoyancy.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

const BALLOON_FEATURE = /balloon|lighter.?than.?air|\blta\b|buoyan|aerostat|zero.?pressure|super.?pressure|float.?altitude|stratospheric.?(balloon|platform)|sounding.?balloon|gas.?envelope|helium.?lift|hydrogen.?lift|airship|blimp/i
const BALLOON_CLASSES = new Set([
  'haps',
])

export function balloonApplicable(envelope: BriefEnvelope, contract?: PartialContract): boolean {
  const hay = [
    envelope?.class ?? '',
    envelope?.application ?? '',
    envelope?.scale_tier ?? '',
    envelope?.form_factor ?? '',
    contract?.brief_summary ?? '',
    contract?.product_class ?? '',
  ].join(' ').toLowerCase()
  if (BALLOON_FEATURE.test(hay)) return true
  // HAPS only when the form factor is the lighter-than-air variant (a
  // fixed-wing HAPS has no gas envelope).
  if (BALLOON_CLASSES.has(envelope?.class) && /lighter.?than.?air|balloon|aerostat/i.test(envelope?.form_factor ?? '')) {
    return true
  }
  return false
}

export const balloonBuoyancyTool: Tool<any, any> = {
  id: 'aero:balloon-buoyancy',
  name: 'Balloon Buoyancy & Float Altitude (US-76)',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/spacecraft',
  domain: 'aero',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope, contract) { return balloonApplicable(envelope, contract) },
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
        provenance: { source: 'tool:aero:balloon-buoyancy', tool_id: 'aero:balloon-buoyancy', tool_version: '1.0.0' },
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
        provenance: { source: 'tool:aero:balloon-buoyancy', tool_id: 'aero:balloon-buoyancy', tool_version: '1.0.0' },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:aero:balloon-buoyancy',
        tool_id: 'aero:balloon-buoyancy',
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
registerTool(balloonBuoyancyTool)
