/**
 * scripts/lib/orchestrator/tools/feep-thrust.ts
 *
 * TypeScript wrapper for `feep_thrust.py` — FEEP (Field-Emission Electric
 * Propulsion, liquid-metal) thrust / Isp / power. Subprocess to the repo .venv.
 *
 * The Python module is the canonical implementation; this wrapper marshals the
 * JSON I/O and registers the tool. FAMILY-APPLICABLE: keyed on the physical
 * feature "electric propulsion" (NOT a fixed class allowlist) so the composer
 * selects it for any archetype with an electric-propulsion thruster.
 *
 * Governing physics: F = I_b*sqrt(2*m_i*V_b/q_i); v_e = sqrt(2*q_i*V_b/m_i);
 * Isp = v_e/g0; P = I_b*V_b.  (Goebel & Katz 2008; Tajmar 2003.)
 *
 * License: free-proprietary. Source: internal://forgeos/spacecraft
 */

import { registerTool } from '../registry'
import type { BriefEnvelope, PartialContract, Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'feep_thrust.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

/**
 * FAMILY feature predicate: does this design carry an ELECTRIC-PROPULSION
 * thruster? Matched on the envelope class + application + (best-effort) brief
 * summary text rather than a hard class list, so a novel electric-propulsion
 * archetype (FEEP terminal, electrospray microsat, drag-free platform) is
 * covered without per-class wiring. Falls back safely on undefined fields.
 */
const EP_FEATURE = /electric.?propuls|\bfeep\b|field.?emission|electrospray|ion.?thrust|gridded.?ion|hall.?thrust|plasma.?thrust|\bep\b.?thruster|micro.?newton|drag.?free|station.?keep|colloid|liquid.?metal.?ion/i
const EP_CLASSES = new Set([
  'propulsion_thruster_product',
  'satellite_smallsat',
  'satellite_cubesat',
  'satellite_geo_comsat',
  'satellite_interplanetary',
])

export function feepApplicable(envelope: BriefEnvelope, contract?: PartialContract): boolean {
  const hay = [
    envelope?.class ?? '',
    envelope?.application ?? '',
    envelope?.scale_tier ?? '',
    contract?.brief_summary ?? '',
    contract?.product_class ?? '',
  ].join(' ').toLowerCase()
  if (EP_FEATURE.test(hay)) return true
  return EP_CLASSES.has(envelope?.class)
}

export const feepThrustTool: Tool<any, any> = {
  id: 'propulsion:feep-thrust',
  name: 'FEEP Thrust (Field-Emission Electric Propulsion)',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/spacecraft',
  domain: 'aero',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope, contract) { return feepApplicable(envelope, contract) },
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
        provenance: { source: 'tool:propulsion:feep-thrust', tool_id: 'propulsion:feep-thrust', tool_version: '1.0.0' },
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
        provenance: { source: 'tool:propulsion:feep-thrust', tool_id: 'propulsion:feep-thrust', tool_version: '1.0.0' },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:propulsion:feep-thrust',
        tool_id: 'propulsion:feep-thrust',
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
registerTool(feepThrustTool)
