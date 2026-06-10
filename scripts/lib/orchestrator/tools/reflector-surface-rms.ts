/**
 * scripts/lib/orchestrator/tools/reflector-surface-rms.ts
 *
 * TypeScript wrapper for `reflector_surface_rms.py` — reflector antenna surface
 * accuracy via the Ruze equation (gain loss vs RMS surface error). Subprocess
 * to the repo .venv.
 *
 * FAMILY-APPLICABLE: keyed on the physical feature "reflector / parabolic /
 * mesh antenna" (NOT a fixed class allowlist). Governing physics (Ruze):
 * eta = exp(-(4*pi*eps_rms/lambda)^2); G = G0_dBi - L_ruze_dB; rule eps<lambda/20.
 * (Ruze 1966; Balanis; Baars 2007.)
 *
 * License: free-proprietary. Source: internal://forgeos/spacecraft
 */

import { registerTool } from '../registry'
import type { BriefEnvelope, PartialContract, Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'reflector_surface_rms.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

const REFLECTOR_FEATURE = /reflector|parabol|\bdish\b|mesh.?antenna|paraboloid|cassegrain|gregorian|feed.?horn|surface.?accuracy|ruze|deployable.?antenna|high.?gain.?antenna|\bhga\b|ground.?station.?antenna|satellite.?dish|reflectarray/i
const REFLECTOR_CLASSES = new Set([
  'ground_station',
  'satellite_geo_comsat',
  'satellite_smallsat',
  'satellite_interplanetary',
  'phased_array',
])

export function reflectorApplicable(envelope: BriefEnvelope, contract?: PartialContract): boolean {
  const hay = [
    envelope?.class ?? '',
    envelope?.application ?? '',
    envelope?.scale_tier ?? '',
    contract?.brief_summary ?? '',
    contract?.product_class ?? '',
  ].join(' ').toLowerCase()
  if (REFLECTOR_FEATURE.test(hay)) return true
  return REFLECTOR_CLASSES.has(envelope?.class)
}

export const reflectorSurfaceRmsTool: Tool<any, any> = {
  id: 'antenna:reflector-surface-rms',
  name: 'Reflector Surface Accuracy (Ruze)',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/spacecraft',
  domain: 'photonics',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope, contract) { return reflectorApplicable(envelope, contract) },
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
        provenance: { source: 'tool:antenna:reflector-surface-rms', tool_id: 'antenna:reflector-surface-rms', tool_version: '1.0.0' },
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
        provenance: { source: 'tool:antenna:reflector-surface-rms', tool_id: 'antenna:reflector-surface-rms', tool_version: '1.0.0' },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:antenna:reflector-surface-rms',
        tool_id: 'antenna:reflector-surface-rms',
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
registerTool(reflectorSurfaceRmsTool)
