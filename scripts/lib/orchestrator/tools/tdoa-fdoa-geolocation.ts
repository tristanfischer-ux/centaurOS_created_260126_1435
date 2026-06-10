/**
 * scripts/lib/orchestrator/tools/tdoa-fdoa-geolocation.ts
 *
 * TypeScript wrapper for `tdoa_fdoa_geolocation.py` — passive RF-emitter
 * geolocation accuracy (TDOA/FDOA Cramer-Rao bound). Subprocess to the .venv.
 *
 * FAMILY-APPLICABLE: keyed on the physical feature "passive RF geolocation /
 * SIGINT payload" (NOT a fixed class allowlist). Governing physics:
 * sigma_pos ~ c*sigma_t*GDOP (TDOA) + FDOA cross-track term; CEP = 1.1774*sigma.
 * (Torrieri 1984; Stein 1981; Ho & Chan 1993.)
 *
 * License: free-proprietary. Source: internal://forgeos/spacecraft
 */

import { registerTool } from '../registry'
import type { BriefEnvelope, PartialContract, Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'tdoa_fdoa_geolocation.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

const GEO_FEATURE = /\bsigint\b|geoloc|emitter.?locat|\btdoa\b|\bfdoa\b|time.?difference.?of.?arrival|frequency.?difference|passive.?(rf|radio).?(payload|location|sensor)|electronic.?(intelligence|support)|\belint\b|rf.?surveillance|signal.?intelligence|interferometr.?geoloc/i
const GEO_CLASSES = new Set<string>([
  // No dedicated SIGINT class exists yet; feature regex is the primary path.
])

export function geolocationApplicable(envelope: BriefEnvelope, contract?: PartialContract): boolean {
  const hay = [
    envelope?.class ?? '',
    envelope?.application ?? '',
    envelope?.scale_tier ?? '',
    contract?.brief_summary ?? '',
    contract?.product_class ?? '',
  ].join(' ').toLowerCase()
  if (GEO_FEATURE.test(hay)) return true
  return GEO_CLASSES.has(envelope?.class)
}

export const tdoaFdoaGeolocationTool: Tool<any, any> = {
  id: 'rf:tdoa-fdoa-geolocation',
  name: 'TDOA/FDOA Emitter Geolocation Accuracy',
  version: '1.0.0',
  license: 'free-proprietary',
  source_url: 'internal://forgeos/spacecraft',
  domain: 'power_electronics',
  pinned_environment: { python: '3.14.4' },
  applicable_to(envelope, contract) { return geolocationApplicable(envelope, contract) },
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
        provenance: { source: 'tool:rf:tdoa-fdoa-geolocation', tool_id: 'rf:tdoa-fdoa-geolocation', tool_version: '1.0.0' },
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
        provenance: { source: 'tool:rf:tdoa-fdoa-geolocation', tool_id: 'rf:tdoa-fdoa-geolocation', tool_version: '1.0.0' },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:rf:tdoa-fdoa-geolocation',
        tool_id: 'rf:tdoa-fdoa-geolocation',
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
registerTool(tdoaFdoaGeolocationTool)
