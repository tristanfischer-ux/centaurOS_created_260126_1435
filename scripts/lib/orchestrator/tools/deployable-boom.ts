/**
 * scripts/lib/orchestrator/tools/deployable-boom.ts
 *
 * TypeScript wrapper for `deployable_boom.py` — deployable cantilever boom
 * stiffness, first natural frequency, stow ratio. Subprocess to the .venv.
 *
 * FAMILY-APPLICABLE: keyed on the physical feature "deployable structure /
 * boom / mast" (NOT a fixed class allowlist). Governing physics (Euler-
 * Bernoulli): delta = F*L^3/(3*E*I); f1 = (1.875^2/2pi)*sqrt(E*I/(rho*A*L^4)).
 * (Blevins 1979; Roark's Formulas; Pellegrino 2001.)
 *
 * License: free-proprietary. Source: internal://forgeos/spacecraft
 */

import { registerTool } from '../registry'
import type { BriefEnvelope, PartialContract, Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'deployable_boom.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

const BOOM_FEATURE = /deployable|\bboom\b|\bmast\b|stem.?(boom|mast)|tape.?spring|coilable|articulated.?(mast|arm)|extendable.?(boom|structure)|gravity.?gradient.?boom|magnetometer.?boom|sail.?spar|gossamer|unfold|stowed|deployment.?(mechanism|kinematics)/i
const BOOM_CLASSES = new Set([
  'satellite_smallsat',
  'satellite_cubesat',
  'satellite_geo_comsat',
  'satellite_interplanetary',
])

export function boomApplicable(envelope: BriefEnvelope, contract?: PartialContract): boolean {
  const hay = [
    envelope?.class ?? '',
    envelope?.application ?? '',
    envelope?.scale_tier ?? '',
    contract?.brief_summary ?? '',
    contract?.product_class ?? '',
  ].join(' ').toLowerCase()
  if (BOOM_FEATURE.test(hay)) return true
  return BOOM_CLASSES.has(envelope?.class)
}

export const deployableBoomTool: Tool<any, any> = {
  id: 'structures:deployable-boom',
  name: 'Deployable Boom Stiffness & First Mode',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/spacecraft',
  domain: 'mechanical',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope, contract) { return boomApplicable(envelope, contract) },
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
        provenance: { source: 'tool:structures:deployable-boom', tool_id: 'structures:deployable-boom', tool_version: '1.0.0' },
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
        provenance: { source: 'tool:structures:deployable-boom', tool_id: 'structures:deployable-boom', tool_version: '1.0.0' },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:structures:deployable-boom',
        tool_id: 'structures:deployable-boom',
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
registerTool(deployableBoomTool)
