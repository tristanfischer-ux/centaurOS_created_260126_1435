// proveCatch for recovery-side oxygen dosing (T-24 / Sam Green SME).
//
// THE BUG: fertigation/drainwater recovery plants shipped cloth filters + drain
// reservoirs but no oxygen/aeration dosing on the filtered return — the reference
// graph (fertigation-water-recycling.ts) requires filter + oxygen dosing as the
// recovery conditioning stage.
// THE RULE: (a) water_treatment contract with drain reservoirs + cloth filter mints
// oxygen_dosing_pump_*; (b) mintDemandCoverage rule 11 mints the same when those
// signals exist but oxygen keys are absent; (c) once-through (no drain reservoir,
// no recovery filter) → no mint.

import { buildContract } from '../../engineering-contract'
import { mintDemandCoverage } from './universal-contract-sizing'
import type { ContractInProgress } from '../types'

function qty(contract: { quantities?: Record<string, { value?: unknown }> }, key: string): number {
  const v = contract.quantities?.[key]?.value
  return typeof v === 'number' ? v : NaN
}

function freshContract(q: Record<string, number>): ContractInProgress {
  const quantities: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(q)) {
    quantities[k] = { value: v, unit: '', family: '', basis: 'rated', scope: 'system', source: 'brief' }
  }
  return { quantities } as unknown as ContractInProgress
}

function run(): void {
  // ── (a) proveCatch — water_treatment builder emits oxygen dosing with recovery ──
  const brief = {
    original_text: `
Water-handling plant. Reverse-osmosis permeate 8 cubic metres per hour.
One cleanwater reservoir approximately 91 cubic metres.
Two drain-water reservoirs approximately 91 cubic metres each.
Pump Unit 1 — 90 cubic metres per hour. Pump Unit 2 — 90 cubic metres per hour.
Nursery Pump Unit — 45 cubic metres per hour serving the nursery.
Cloth filter on drain recovery. Drain-water pit: one 5,000-litre concrete drain pit per zone.
`,
    product_description: 'fertigation and ebb/flow irrigation water plant with drainwater recovery',
  }
  const c = buildContract('water_treatment', brief)
  if (!c) throw new Error('recovery-oxygen: buildContract returned null')
  const o2Count = qty(c, 'oxygen_dosing_pump_count')
  const clothCount = qty(c, 'cloth_filter_count')
  if (!(o2Count >= 1)) {
    throw new Error(`recovery-oxygen proveCatch: oxygen_dosing_pump_count must be ≥1 (got ${o2Count})`)
  }
  if (o2Count !== clothCount) {
    throw new Error(
      `recovery-oxygen proveCatch: oxygen dosing count must track cloth-filter zones ` +
      `(o2=${o2Count}, cloth=${clothCount})`,
    )
  }
  const nurseryO2 = qty(c, 'nursery_oxygen_dosing_pump_count')
  if (!(nurseryO2 >= 1)) {
    throw new Error(`recovery-oxygen proveCatch: nursery oxygen dosing must mint when nursery zone exists (got ${nurseryO2})`)
  }

  // ── (b) proveCatch — mintDemandCoverage rule 11 fills a gap ──
  const gap: Record<string, number> = {
    drain_water_tank_volume_each_m3: 91,
    drain_water_tank_count: 2,
    cloth_filter_throughput_m3_h: 90,
    cloth_filter_count: 2,
    irrigation_demand_m3_h: 180,
  }
  const mints = mintDemandCoverage(gap, freshContract(gap), {
    modules: [{ sub_modules: [{ words: [] }] }] as never,
    briefMetrics: [],
  })
  if (!gap.oxygen_dosing_pump_count || gap.oxygen_dosing_pump_count !== 2) {
    throw new Error(
      `recovery-oxygen rule-11 proveCatch: expected oxygen_dosing_pump_count=2, got ${gap.oxygen_dosing_pump_count} ` +
      `(mints=${mints.map((m) => m.key).join(',')})`,
    )
  }

  // ── (c) proveNoFalsePositive — once-through (fresh only, no drain, no recovery filter) ──
  const once: Record<string, number> = {
    fresh_water_tank_volume_each_m3: 50,
    fresh_water_tank_count: 1,
    reverse_osmosis_skid_volume_m3: 10,
    reverse_osmosis_skid_count: 1,
    ro_permeate_capacity_m3_h: 8,
  }
  const onceMints = mintDemandCoverage(once, freshContract(once), {
    modules: [],
    briefMetrics: [],
  })
  if (once.oxygen_dosing_pump_count != null || onceMints.some((m) => /oxygen_dosing/.test(m.key))) {
    throw new Error(
      'recovery-oxygen proveNoFalsePositive: once-through plant must NOT mint oxygen dosing',
    )
  }

  // ── (d) proveNoFalsePositive — already has oxygen dosing → no double-mint ──
  const has: Record<string, number> = {
    drain_water_tank_volume_each_m3: 91,
    drain_water_tank_count: 2,
    cloth_filter_count: 2,
    oxygen_dosing_pump_throughput_m3_h: 0.04,
    oxygen_dosing_pump_power_kw: 0.04,
    oxygen_dosing_pump_count: 2,
  }
  const before = has.oxygen_dosing_pump_count
  mintDemandCoverage(has, freshContract(has), { modules: [], briefMetrics: [] })
  if (has.oxygen_dosing_pump_count !== before) {
    throw new Error('recovery-oxygen proveNoFalsePositive: must not overwrite existing oxygen dosing')
  }

  // eslint-disable-next-line no-console
  console.log(
    `recovery-oxygen-dosing --selftest OK (builder o2=${o2Count}, rule-11 gap filled, once-through silent)`,
  )
}

run()
