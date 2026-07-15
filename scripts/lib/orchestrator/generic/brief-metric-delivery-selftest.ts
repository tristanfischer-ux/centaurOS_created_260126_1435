// proveCatch for brief-metric delivery coverage rule 4b-exact — P1-F 2026-07-08.
// Codema brief key peak_circulation_demand_m3_per_hr was UNVERIFIED because identity
// tokens {circulation} never hit irrigation_pump_flow_m3_h. Exact-key alias mint +
// exact-name override of the echo filter closes it. Never fabricates on non-flow plants.

import { mintDemandCoverage } from './universal-contract-sizing'
import type { ContractInProgress } from '../types'

function freshContract(q: Record<string, number>): ContractInProgress {
  const cq: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(q)) {
    cq[k] = { value: v, unit: /m3/.test(k) ? 'm3/h' : '', family: '', basis: 'rated', scope: 'system', source: 'brief' }
  }
  return { quantities: cq } as unknown as ContractInProgress
}

function expectEq(label: string, got: number | undefined, want: number): void {
  if (got !== want) throw new Error(`brief-metric-delivery: ${label} = ${got}, want ${want}`)
}

function run(): void {
  // ── 1. CATCH: peak_circulation brief key aliases irrigation_pump_flow ──
  const q: Record<string, number> = {
    irrigation_pump_flow_m3_h: 225,
    irrigation_demand_m3_h: 225, // echo — must NOT be the mint source
    acid_dosing_pump_throughput_m3_h: 0.04, // micro-flow — must NOT be preferred
    fertigation_dosing_pump_throughput_m3_h: 90,
  }
  const briefMetrics = [
    { key_metric: 'peak_circulation_demand_m3_per_hr', value: 225, unit: 'm3/hr' },
  ] as never[]
  const contract = freshContract(q)
  mintDemandCoverage(q, contract, { modules: [], briefMetrics })
  expectEq('peak_circulation alias from irrigation_pump_flow', q.peak_circulation_demand_m3_per_hr, 225)
  // provenance on the contract quantity
  const cq = (contract as unknown as { quantities: Record<string, { source?: string; source_detail?: string; value?: number }> }).quantities
  const peak = cq.peak_circulation_demand_m3_per_hr
  if (!peak || peak.source !== 'demand-coverage' || !/exact brief-key alias/.test(String(peak.source_detail))) {
    throw new Error(`brief-metric-delivery: peak must carry demand-coverage exact-alias provenance (got ${JSON.stringify(peak)})`)
  }
  if (!/irrigation_pump_flow_m3_h/.test(String(peak.source_detail))) {
    throw new Error('brief-metric-delivery: peak source_detail must name irrigation_pump_flow_m3_h as the delivered basis')
  }

  // ── 2. IDEMPOTENT ──
  const snap = JSON.stringify(q)
  mintDemandCoverage(q, contract, { modules: [], briefMetrics })
  if (JSON.stringify(q) !== snap) throw new Error('brief-metric-delivery: second pass must be a no-op')

  // ── 3. NEVER FABRICATE on a non-flow plant (BESS-like) ──
  const bess: Record<string, number> = { battery_rack_count: 14, cell_count: 5000, chiller_duty_kw: 40 }
  const bessSnap = JSON.stringify(bess)
  mintDemandCoverage(bess, freshContract(bess), {
    modules: [],
    briefMetrics: [{ key_metric: 'peak_circulation_demand_m3_per_hr', value: 225, unit: 'm3/hr' }] as never[],
  })
  if (Object.prototype.hasOwnProperty.call(bess, 'peak_circulation_demand_m3_per_hr') || JSON.stringify(bess) !== bessSnap) {
    throw new Error('brief-metric-delivery: BESS-like map must stay byte-identical (never fabricate a peak circulation)')
  }

  // ── 4. micro-flows alone must not mint ──
  const micro: Record<string, number> = { acid_dosing_pump_throughput_m3_h: 0.04, cip_tank_line_flow_m3_h: 4 }
  mintDemandCoverage(micro, freshContract(micro), {
    modules: [],
    briefMetrics: [{ key_metric: 'peak_circulation_demand_m3_per_hr', value: 225, unit: 'm3/hr' }] as never[],
  })
  if (Object.prototype.hasOwnProperty.call(micro, 'peak_circulation_demand_m3_per_hr')) {
    throw new Error('brief-metric-delivery: dosing/CIP micro-flows must never mint a peak circulation alias')
  }

  // eslint-disable-next-line no-console
  console.log('brief-metric-delivery --selftest OK (peak_circulation_demand_m3_per_hr aliases irrigation_pump_flow_m3_h=225 with exact-key provenance; BESS-like + micro-flow maps never fabricate; idempotent)')
}

run()
