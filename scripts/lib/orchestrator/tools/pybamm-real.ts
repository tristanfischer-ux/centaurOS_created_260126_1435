/**
 * scripts/lib/orchestrator/tools/pybamm-real.ts
 *
 * REAL PyBaMM cell-sizing wrapper. Subprocess to a Python script that
 * imports PyBaMM, builds a DFN (Doyle-Fuller-Newman) cell model from
 * a chemistry-specific parameter set, runs a 0.5C discharge simulation,
 * and returns voltage profile + internal resistance + cell-count math.
 *
 * REPLACES the stub at scripts/lib/orchestrator/tools/pybamm-stub.ts.
 *
 * Verified output standalone (Build #18f, 2026-05-22) for 3.5 MWh LFP:
 *   cell_count: 5006
 *   nameplate_capacity_kwh: 4375
 *   parameter_set: Prada2013 (LFP)
 *   voltage_at_100_soc_v: 3.5476
 *   voltage_at_50_soc_v: 3.2171  (LFP plateau)
 *   voltage_at_10_soc_v: 2.4498
 *   internal_resistance_mohm: 0.022 (PyBaMM Prada2013 reference cell;
 *                                    real 280 Ah cells run ~0.3-0.5 mohm)
 *   wall_time: 1.52 s per call
 *
 * Known limitation: PyBaMM's Prada2013 parameter set is for a reference
 * small LFP cell, not a 280 Ah utility cell. Voltage profile shape is
 * correct; absolute internal resistance + thermal dissipation values
 * need cell-size calibration. Future: tune a 280 Ah-specific PyBaMM
 * parameter set, OR scale internal_resistance inversely with cell area.
 *
 * License: BSD-3-Clause. Source: github.com/pybamm-team/PyBaMM
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface PybammInput {
  target_energy_kwh: number
  dod_fraction: number
  cell_chemistry: 'lfp' | 'nmc' | 'lto'
  cell_capacity_ah: number
  cell_voltage_v: number
  ambient_temp_c?: number
}

export interface PybammOutput {
  cell_count: number
  cell_count_theoretical: number
  nameplate_capacity_kwh: number
  capacity_fade_at_6000_cycles_pct: number
  internal_resistance_mohm: number
  thermal_dissipation_at_05c_w: number
  voltage_profile_at_05c_summary: {
    voltage_at_100_soc_v: number | null
    voltage_at_50_soc_v: number | null
    voltage_at_10_soc_v: number | null
  }
  _meta: {
    real_pybamm_simulation_ok: boolean
    parameter_set: string
    c_rate_simulated: number
    error: string | null
    wall_time_s: number
  }
}

const PYTHON_SCRIPT = resolve(__dirname, 'python', 'pybamm_run.py')
const VENV_PYTHON = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const pybammCellSizingReal: Tool<PybammInput, PybammOutput> = {
  id: 'pybamm:cell-sizing',
  name: 'PyBaMM Cell Sizing',
  version: '26.4.3',
  license: 'BSD-3-Clause',
  source_url: 'github.com/pybamm-team/PyBaMM',
  domain: 'battery',
  pinned_environment: {
    python: '3.14.4',
    pybamm: '26.4.3',
    pybammsolvers: '0.6.0',
  },

  applicable_to(envelope) {
    return envelope.class === 'bess'
  },

  async invoke(input): Promise<ToolResult<PybammOutput>> {
    const t0 = Date.now()
    const payload = JSON.stringify(input)
    const proc = spawnSync(VENV_PYTHON, [PYTHON_SCRIPT], {
      input: payload,
      encoding: 'utf-8',
      timeout: 60_000,  // PyBaMM DFN sim ~1-3s; allow generous headroom
    })
    const duration_ms = Date.now() - t0

    if (proc.status !== 0) {
      return {
        ok: false,
        output: null,
        provenance: {
          source: 'tool:pybamm:cell-sizing',
          tool_id: 'pybamm:cell-sizing',
          tool_version: '26.4.3',
        },
        warnings: [],
        error: `Python exit ${proc.status}: ${proc.stderr?.slice(0, 400) ?? '(no stderr)'}`,
      }
    }

    let output: PybammOutput
    try {
      output = JSON.parse(proc.stdout) as PybammOutput
    } catch (err) {
      return {
        ok: false,
        output: null,
        provenance: { source: 'tool:pybamm:cell-sizing', tool_id: 'pybamm:cell-sizing', tool_version: '26.4.3' },
        warnings: [],
        error: `JSON parse: ${(err as Error).message}; stdout: ${proc.stdout.slice(0, 200)}`,
      }
    }

    const warnings: string[] = []
    if (!output._meta.real_pybamm_simulation_ok) {
      warnings.push(`PyBaMM simulation fell back to empirical voltage profile: ${output._meta.error ?? 'unknown'}`)
    }
    if (output.internal_resistance_mohm < 0.1) {
      warnings.push(`internal_resistance ${output.internal_resistance_mohm} mΩ is from PyBaMM's reference cell, not a 280 Ah utility cell — value not calibrated for absolute thermal sizing`)
    }

    return {
      ok: true,
      output,
      provenance: {
        source: 'tool:pybamm:cell-sizing',
        tool_id: 'pybamm:cell-sizing',
        tool_version: '26.4.3',
        tool_license: 'BSD-3-Clause',
        tool_source_url: 'github.com/pybamm-team/PyBaMM',
        invocation_input: input,
        invocation_output_field: '(multiple)',
        pinned_versions: { python: '3.14.4', pybamm: '26.4.3', pybammsolvers: '0.6.0' },
        timestamp: new Date().toISOString(),
        duration_ms,
      },
      warnings,
    }
  },
}

registerTool(pybammCellSizingReal)
