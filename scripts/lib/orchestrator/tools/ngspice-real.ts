/**
 * scripts/lib/orchestrator/tools/ngspice-real.ts
 *
 * REAL ngspice wrapper — direct subprocess to ngspice CLI (bypasses
 * PySpice 1.5 which is incompatible with ngspice 46). Builds netlists
 * in Python, runs `ngspice -b`, parses .print output.
 *
 * License: GPL-3.0 (ngspice). Source: ngspice.sourceforge.io
 * Standalone smoke test verified 2026-05-22: RC LPF V_out(τ) = 3.156V
 *   (63.1% of V_in) — matches expected physics 1 - 1/e = 63.2%.
 */

import { registerTool } from '../registry'
import type { Tool, ToolResult } from '../types'
import { spawnSync } from 'child_process'
import { resolve } from 'path'

export interface NgspiceInput {
  rated_power_kw: number
  dc_bus_voltage_v: number
  ac_output_voltage_v?: number
  topology: 'two_level_igbt' | 'three_level_igbt' | 'sic_two_level' | 'modular_multilevel'
}

export interface NgspiceOutput {
  inverter_efficiency_pct: number
  dissipated_power_kw: number
  dc_link_ripple_pct: number
  switching_losses_kw: number
  conduction_losses_kw: number
  ac_thd_pct: number
  filter_inductor_min_uh: number
  filter_capacitor_min_uf: number
  dc_continuous_current_a: number
  ac_continuous_current_a: number
  _ngspice_op_voltage_v?: number | null
  _meta?: { wall_time_s: number }
}

const SCRIPT = resolve(__dirname, 'python', 'ngspice_run.py')
const VENV_PY = resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python3')

export const ngspicePcsReal: Tool<NgspiceInput, NgspiceOutput> = {
  id: 'ngspice:pcs-simulation',
  name: 'ngspice PCS Simulation',
  version: '46',
  license: 'GPL-3.0',
  source_url: 'ngspice.sourceforge.io',
  domain: 'power_electronics',
  pinned_environment: { ngspice: '46' },
  applicable_to(envelope) {
    return ['bess', 'ev_charger'].includes(envelope.class)
  },
  async invoke(input): Promise<ToolResult<NgspiceOutput>> {
    const t0 = Date.now()
    const proc = spawnSync(VENV_PY, [SCRIPT], { input: JSON.stringify(input), encoding: 'utf-8', timeout: 30_000 })
    const duration_ms = Date.now() - t0
    if (proc.status !== 0) {
      return { ok: false, output: null, provenance: { source: 'tool:ngspice:pcs-simulation', tool_id: 'ngspice:pcs-simulation', tool_version: '46' }, warnings: [], error: `Python exit ${proc.status}: ${proc.stderr?.slice(0, 400)}` }
    }
    try {
      const output = JSON.parse(proc.stdout) as NgspiceOutput
      return { ok: true, output, provenance: { source: 'tool:ngspice:pcs-simulation', tool_id: 'ngspice:pcs-simulation', tool_version: '46', tool_license: 'GPL-3.0', tool_source_url: 'ngspice.sourceforge.io', invocation_input: input, invocation_output_field: '(multiple)', pinned_versions: { ngspice: '46' }, timestamp: new Date().toISOString(), duration_ms }, warnings: ['PCS sizing uses empirical efficiency map + ngspice DC operating-point sanity check. Full switching-loss + harmonic-distortion analysis would require behavioural inverter model — future work.'] }
    } catch (err) {
      return { ok: false, output: null, provenance: { source: 'tool:ngspice:pcs-simulation', tool_id: 'ngspice:pcs-simulation', tool_version: '46' }, warnings: [], error: `JSON parse: ${(err as Error).message}` }
    }
  },
}

registerTool(ngspicePcsReal)
