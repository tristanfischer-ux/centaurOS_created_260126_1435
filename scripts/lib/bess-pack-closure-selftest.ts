// proveCatch for the BESS down-scale pack closure + brief-stated DoD pair (2026-07-09).
// Root: the class-default cell (314 Ah) at the default 800 V bus makes the MINIMUM
// buildable pack one 1P×250S string = 251.2 kWh, so a 14 kWh residential wall-unit
// brief G0.5-halted (exit 3) at 18× scale — the architecture was geometry-locked, not
// energy-driven (known drawer). The closure derives (cell, series, bus) from the real
// LFP ladder to CLOSE the brief nameplate; the DoD derives from a brief-stated
// nameplate+usable pair instead of the 0.8 utility convention.
/* eslint-disable no-console */
import { buildContract } from './engineering-contract'

function g(c: any, k: string): number | undefined {
  const v = (c?.quantities ?? {})[k]
  return v && typeof v === 'object' ? (v as any).value : undefined
}

function expect(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`bess-pack-closure: ${msg}`)
}

// ── 1. CATCH: a 14/13.5 kWh wall-unit brief CLOSES (never 251 kWh) ──────────────
const res = buildContract('energy_storage', {
  original_text: 'residential wall-mounted battery energy storage',
  product_description: 'residential, wall-mounted, all-in-one battery energy storage system, single-phase 230 V',
  constraints: {
    max_mass_kg: { value: 130 },
    target_performance: { value: 14, unit: 'kWh', metrics: [
      { key_metric: 'nameplate_capacity_kwh', value: 14.0, unit: 'kWh' },
      { key_metric: 'usable_energy_kwh', value: 13.5, unit: 'kWh' },
      { key_metric: 'continuous_power_kw', value: 11.04, unit: 'kW' },
    ] },
  },
} as any)
const np = g(res, 'nameplate_capacity_kwh') ?? 0
const us = g(res, 'usable_capacity_kwh') ?? 0
const bus = g(res, 'dc_bus_voltage_v') ?? 0
expect(Math.abs(np - 14) / 14 <= 0.10, `residential nameplate must close ≈14 kWh (got ${np})`)
expect(Math.abs(us - 13.5) / 13.5 <= 0.10, `residential usable must close ≈13.5 kWh (got ${us})`)
expect(Math.abs((g(res, 'dod_fraction') ?? 0) - 13.5 / 14) < 0.01,
  `DoD must derive from the brief pair 13.5/14 (got ${g(res, 'dod_fraction')})`)
expect(bus >= 176 && bus <= 1500,
  `bus must respect the P/63A current floor (11.04 kW → ≥176 V) (got ${bus})`)
expect((g(res, 'cell_capacity_ah') ?? 0) < 314, 'a wall unit must NOT use the utility 314 Ah cell')
expect((g(res, 'total_cell_mass_kg') ?? 1e9) < 130,
  `cell mass must fit the 130 kg unit (got ${g(res, 'total_cell_mass_kg')})`)

// ── 2. NO FALSE POSITIVE: utility 5 MWh keeps the class-default topology ────────
const util = buildContract('energy_storage', {
  original_text: 'utility BESS',
  product_description: '20-ft containerised utility battery energy storage, 5 MWh usable',
  constraints: {
    max_mass_kg: { value: 44000 },
    target_performance: { value: 5000, unit: 'kWh', metrics: [
      { key_metric: 'usable_energy_kwh', value: 5000, unit: 'kWh' },
      { key_metric: 'continuous_power_kw', value: 2500, unit: 'kW' },
    ] },
  },
} as any)
expect(g(util, 'cell_capacity_ah') === 314, `utility keeps 314 Ah (got ${g(util, 'cell_capacity_ah')})`)
expect(g(util, 'dc_bus_voltage_v') === 800, `utility keeps the 800 V default (got ${g(util, 'dc_bus_voltage_v')})`)
expect(g(util, 'dod_fraction') === 0.8, `utility keeps the 0.8 DoD convention (got ${g(util, 'dod_fraction')})`)

// ── 3. NO FALSE POSITIVE: a brief-STATED bus always wins (closure never fires) ──
const hv = buildContract('energy_storage', {
  original_text: 'x',
  product_description: 'utility BESS with DC bus voltage approximately 1,500 V nominal',
  constraints: {
    target_performance: { value: 4000, unit: 'kWh', metrics: [
      { key_metric: 'usable_energy_kwh', value: 4000, unit: 'kWh' },
    ] },
  },
} as any)
expect(g(hv, 'dc_bus_voltage_v') === 1500, `brief-stated 1500 V bus wins (got ${g(hv, 'dc_bus_voltage_v')})`)
expect(g(hv, 'cell_capacity_ah') === 314, `brief-stated bus keeps the default cell (got ${g(hv, 'cell_capacity_ah')})`)

console.log('bess-pack-closure --selftest OK (14 kWh wall unit closes at a real-cell '
  + 'ladder pack within the P/63A bus floor + brief-pair DoD; utility 5 MWh and '
  + 'brief-stated-1500V briefs keep the 314 Ah / default topology byte-identically)')
