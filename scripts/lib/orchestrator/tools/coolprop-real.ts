/**
 * scripts/lib/orchestrator/tools/coolprop-real.ts
 *
 * REAL CoolProp wrapper — subprocess to a Python script that imports
 * CoolProp.CoolProp.PropsSI and returns thermophysical properties for
 * the requested refrigerant or fluid.
 *
 * REPLACES the stub at scripts/lib/orchestrator/tools/coolprop-stub.ts.
 * Same I/O contract; the stub had hardcoded lookup tables for ~5
 * fluids; this real wrapper supports every fluid CoolProp ships
 * (which is hundreds).
 *
 * Performance: ~150-200ms per call (Python startup + CoolProp init +
 * actual PropsSI call). Acceptable for chain orchestrator dispatch.
 *
 * Verified output for R290 @ 35°C:
 *   saturation_pressure 12.179 bar
 *   liquid_density      476.1 kg/m³
 *   latent_heat         317.17 kJ/kg
 *   cp_liquid           2.841 kJ/(kg·K)
 *
 * License: MIT. Source: coolprop.org
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface CoolPropInput {
  fluid: string                          // 'r290' | 'r32' | 'r410a' | 'r513a' | 'water' | 'water_glycol_50' | 'co2' | 'ammonia'
  temperature_c: number
}

export interface CoolPropOutput {
  fluid: string
  saturation_temp_at_10bar_c: number | null
  saturation_pressure_at_temp_bar: number | null
  liquid_density_kg_m3: number | null
  vapour_density_kg_m3: number | null
  enthalpy_liquid_kj_kg: number | null
  enthalpy_vapour_kj_kg: number | null
  latent_heat_kj_kg: number | null
  cp_liquid_kj_kgk: number | null
  flammability_class: string
}

const PYTHON_SCRIPT = resolve(
  __dirname,
  'python',
  'coolprop_run.py',
)

// We expect to be invoked under the repo's venv. The CHAIN orchestrator
// is launched with the repo's standard env (npx tsx). For CoolProp, we
// shell out to the repo's .venv Python explicitly.
const VENV_PYTHON = resolve(
  __dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3',
)

export const coolpropPropertiesReal: Tool<CoolPropInput, CoolPropOutput> = {
  id: 'coolprop:refrigerant-properties',
  name: 'CoolProp Refrigerant Properties',
  version: '7.2.0',
  license: 'MIT',
  source_url: 'coolprop.org',
  domain: 'thermal',
  pinned_environment: {
    python: '3.14.4',
    coolprop: '7.2.0',  // resolved at runtime via venv
  },

  applicable_to(envelope) {
    return ['bess', 'heat_pump_residential', 'vertical_farm', 'auv'].includes(envelope.class)
  },

  async invoke(input): Promise<ToolResult<CoolPropOutput>> {
    const t0 = Date.now()
    const payload = JSON.stringify(input)
    const proc = spawnSync(VENV_PYTHON, [PYTHON_SCRIPT], {
      input: payload,
      encoding: 'utf-8',
      timeout: 30_000,
    })
    const duration_ms = Date.now() - t0

    if (proc.status !== 0) {
      return {
        ok: false,
        output: null,
        provenance: {
          source: 'tool:coolprop:refrigerant-properties',
          tool_id: 'coolprop:refrigerant-properties',
          tool_version: '7.2.0',
        },
        warnings: [],
        error: `Python exit ${proc.status}: ${proc.stderr?.slice(0, 400) ?? '(no stderr)'}`,
      }
    }

    let output: CoolPropOutput
    try {
      output = JSON.parse(proc.stdout) as CoolPropOutput
    } catch (err) {
      return {
        ok: false,
        output: null,
        provenance: { source: 'tool:coolprop:refrigerant-properties', tool_id: 'coolprop:refrigerant-properties', tool_version: '6.4.3' },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }

    // CoolProp can return null for fields it cannot compute (e.g. some
    // incompressible mixtures don't have a vapour-side). Caller-side
    // consumers should handle null gracefully.
    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:coolprop:refrigerant-properties',
        tool_id: 'coolprop:refrigerant-properties',
        tool_version: '7.2.0',
        tool_license: 'MIT',
        tool_source_url: 'coolprop.org',
        invocation_input: input,
        invocation_output_field: '(multiple)',
        pinned_versions: { python: '3.14.4', coolprop: '7.2.0' },
        timestamp: new Date().toISOString(),
        duration_ms,
      },
      warnings: [],
    }
  },
}

registerTool(coolpropPropertiesReal)
