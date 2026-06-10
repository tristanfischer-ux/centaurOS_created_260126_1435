/**
 * scripts/lib/orchestrator/tools/mpd-thrust.ts
 *
 * TypeScript wrapper for `mpd_thrust.py` — self-field magnetoplasmadynamic
 * (MPD) thruster thrust / Isp / discharge power. Subprocess to the repo .venv.
 *
 * FAMILY-APPLICABLE: keyed on the physical feature "electric / plasma
 * propulsion" (NOT a fixed class allowlist). Governing physics: Maecker
 * self-field law F = b*(mu0/4pi)*I_d^2 with b = ln(r_a/r_c)+0.75;
 * Isp = F/(m_dot*g0); P = I_d*V_d.  (Jahn 1968; Maecker 1955.)
 *
 * License: free-proprietary. Source: internal://forgeos/spacecraft
 */

import { registerTool } from '../registry'
import type { BriefEnvelope, PartialContract, Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'mpd_thrust.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

const MPD_FEATURE = /electric.?propuls|\bmpd\b|magnetoplasma|plasma.?thrust|pulsed.?plasma|\bppt\b|lorentz|self.?field|applied.?field|arcjet|high.?power.?electric|orbit.?transfer.?(tug|vehicle)|cargo.?tug/i
const MPD_CLASSES = new Set([
  'propulsion_thruster_product',
  'satellite_smallsat',
  'satellite_geo_comsat',
  'satellite_interplanetary',
])

export function mpdApplicable(envelope: BriefEnvelope, contract?: PartialContract): boolean {
  const hay = [
    envelope?.class ?? '',
    envelope?.application ?? '',
    envelope?.scale_tier ?? '',
    contract?.brief_summary ?? '',
    contract?.product_class ?? '',
  ].join(' ').toLowerCase()
  if (MPD_FEATURE.test(hay)) return true
  return MPD_CLASSES.has(envelope?.class)
}

export const mpdThrustTool: Tool<any, any> = {
  id: 'propulsion:mpd-thrust',
  name: 'MPD Thrust (self-field magnetoplasmadynamic)',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/spacecraft',
  domain: 'aero',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope, contract) { return mpdApplicable(envelope, contract) },
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
        provenance: { source: 'tool:propulsion:mpd-thrust', tool_id: 'propulsion:mpd-thrust', tool_version: '1.0.0' },
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
        provenance: { source: 'tool:propulsion:mpd-thrust', tool_id: 'propulsion:mpd-thrust', tool_version: '1.0.0' },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:propulsion:mpd-thrust',
        tool_id: 'propulsion:mpd-thrust',
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
registerTool(mpdThrustTool)
