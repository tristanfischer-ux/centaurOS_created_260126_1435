/**
 * scripts/lib/orchestrator/tools/pybamm-stub.ts
 *
 * PHASE 2 STUB — PyBaMM cell sizing tool.
 *
 * This is an interim stub that simulates PyBaMM's output using
 * first-principles cell-energy arithmetic. It exists so the
 * orchestrator can be exercised end-to-end before the real PyBaMM
 * subprocess wrapper lands.
 *
 * Real wrapper (next): subprocess to a Python script that imports
 * PyBaMM, runs a DFN model + capacity-fade prediction, returns
 * structured JSON. Same I/O contract as this stub.
 *
 * Cost of the stub: 0 (no external calls). Cost of the real wrapper:
 * ~5-10 seconds per invocation (cell-model simulation).
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult, PartialContract } from '../types'

export interface PybammInput {
  target_energy_kwh: number              // usable energy at rated DoD
  dod_fraction: number                   // 0.80 typical for utility LFP
  cell_chemistry: 'lfp' | 'nmc' | 'lto'
  cell_capacity_ah: number               // datasheet
  cell_voltage_v: number                 // nominal cell voltage
  ambient_temp_c?: number                // operating temp; default 25
}

export interface PybammOutput {
  cell_count: number                     // integer, EoL-margin included
  cell_count_theoretical: number         // ceil(nameplate / cell_energy)
  nameplate_capacity_kwh: number         // usable / DoD
  capacity_fade_at_6000_cycles_pct: number
  internal_resistance_mohm: number       // initial, at 50% SOC
  thermal_dissipation_at_05c_w: number   // continuous discharge dissipation per cell
  voltage_profile_at_05c_summary: {
    voltage_at_100_soc_v: number
    voltage_at_50_soc_v: number
    voltage_at_10_soc_v: number
  }
}

// ---------------------------------------------------------------------------
// STUB IMPLEMENTATION
// First-principles cell sizing. The real PyBaMM wrapper will replace
// this with a Doyle-Fuller-Newman model simulation. The I/O contract
// is identical.
// ---------------------------------------------------------------------------

function computePybammOutput(input: PybammInput): PybammOutput {
  const cellEnergyKwh = (input.cell_capacity_ah * input.cell_voltage_v) / 1000
  const nameplate = input.target_energy_kwh / input.dod_fraction
  const cellCountTheoretical = Math.ceil(nameplate / cellEnergyKwh)
  const cellCount = Math.ceil(cellCountTheoretical * 1.025) // EoL margin

  // Empirical capacity fade for LFP at 6000 cycles at 25 deg C, 0.5C: ~8-12%
  let capacityFadePct = 8.0
  if (input.cell_chemistry === 'nmc') capacityFadePct = 15.0
  else if (input.cell_chemistry === 'lto') capacityFadePct = 4.0

  // Internal resistance (initial, 50% SOC): LFP 280 Ah typical ~0.35 mOhm
  let internalResistanceMohm = 0.35
  if (input.cell_chemistry === 'nmc') internalResistanceMohm = 0.45
  else if (input.cell_chemistry === 'lto') internalResistanceMohm = 0.20

  // Thermal dissipation at 0.5C continuous (typical 2-4 W/cell at 0.5C
  // for 280 Ah LFP)
  const dischargeCurrentA = input.cell_capacity_ah * 0.5
  const thermalW = dischargeCurrentA * dischargeCurrentA * internalResistanceMohm / 1000

  // Voltage profile (LFP characteristic shape: flat 3.2V plateau)
  const voltageMid = input.cell_voltage_v
  const voltageProfile = input.cell_chemistry === 'lfp'
    ? { voltage_at_100_soc_v: voltageMid + 0.15, voltage_at_50_soc_v: voltageMid, voltage_at_10_soc_v: voltageMid - 0.25 }
    : { voltage_at_100_soc_v: voltageMid + 0.4, voltage_at_50_soc_v: voltageMid, voltage_at_10_soc_v: voltageMid - 0.5 }

  return {
    cell_count: cellCount,
    cell_count_theoretical: cellCountTheoretical,
    nameplate_capacity_kwh: nameplate,
    capacity_fade_at_6000_cycles_pct: capacityFadePct,
    internal_resistance_mohm: internalResistanceMohm,
    thermal_dissipation_at_05c_w: thermalW,
    voltage_profile_at_05c_summary: voltageProfile,
  }
}

// ---------------------------------------------------------------------------
// TOOL DEFINITION
// ---------------------------------------------------------------------------

export const pybammCellSizingStub: Tool<PybammInput, PybammOutput> = {
  id: 'pybamm:cell-sizing',
  name: 'PyBaMM Cell Sizing',
  version: '23.5-stub',
  license: 'BSD-3-Clause',
  source_url: 'github.com/pybamm-team/PyBaMM',
  domain: 'battery',
  pinned_environment: {
    python: '3.11.4-stub',
    pybamm: '23.5-stub',
    numpy: '1.26.0-stub',
    scipy: '1.11.0-stub',
  },

  applicable_to(envelope, _contract: PartialContract): boolean {
    return envelope.class === 'bess'
  },

  async invoke(input, _contract): Promise<ToolResult<PybammOutput>> {
    const t0 = Date.now()
    try {
      const output = computePybammOutput(input)
      const duration_ms = Date.now() - t0
      return {
        ok: true,
        output,
        provenance: {
          source: 'tool:pybamm:cell-sizing',
          tool_id: 'pybamm:cell-sizing',
          tool_version: '23.5-stub',
          tool_license: 'BSD-3-Clause',
          tool_source_url: 'github.com/pybamm-team/PyBaMM',
          invocation_input: input,
          pinned_versions: {
            python: '3.11.4-stub',
            pybamm: '23.5-stub',
            numpy: '1.26.0-stub',
          },
          timestamp: new Date(0).toISOString(),  // deterministic for tests
          duration_ms,
        },
        warnings: ['STUB: this is a first-principles approximation; real PyBaMM DFN model not yet wired'],
      }
    } catch (err) {
      return {
        ok: false,
        output: null,
        provenance: {
          source: 'tool:pybamm:cell-sizing',
          tool_id: 'pybamm:cell-sizing',
          tool_version: '23.5-stub',
        },
        warnings: [],
        error: (err as Error).message,
      }
    }
  },
}

// Auto-register at module load.
registerTool(pybammCellSizingStub)
