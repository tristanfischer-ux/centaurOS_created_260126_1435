// proveCatch guard for the ZONED-DELIVERY DISTRIBUTION NETWORK rule (mintDemandCoverage
// rule 8, universal-contract-sizing.ts) — Tristan 2026-07-03, fischer-codema HOLD-003.
//
// THE BUG: the client's ebb/flow irrigation distribution section (D — £895k, 71 % of the
// offer: mains, risers, 200 valve zones, laterals, drain returns for 6,000 containers) was
// ~£158k modelled because the field distribution grid is never per-pipe ROUTED — the engine
// only priced the plant-room equipment + a £40k valve line, and the recon flagged the
// section PARTIAL → HOLD-003. THE RULE: mint the network as a PARAMETRICALLY-DERIVED
// engineered allowance (lengths by DN from the brief-stated zoning geometry + flow-split
// hydraulics), keyed ONLY on zoned-delivery signals (a zoning-qualified valve count + a
// per-group delivery flow) — never a class table — with 'parametric — not routed'
// provenance and the derivation formula on every quantity.
//
// This guard fails the build if: the water-brief signals stop minting the network (the
// catch), the derived arithmetic drifts, a non-zoned archetype (BESS-like) is no longer
// byte-identical, the rule stops being idempotent, or the 1-stem fuzzy match regression
// returns (a "Flow Distribution Plates" word adopting/suppressing the manifold principal).

import { mintDemandCoverage, applyUniversalContractSizing } from './universal-contract-sizing'
import type { ContractInProgress } from '../types'

function waterQuantities(): Record<string, number> {
  return {
    // zoned-delivery signals (the fischer-codema v56d contract shape)
    actuated_distribution_valve_count: 200,
    cultivation_container_count: 6000,
    irrigation_pump_flow_m3_h: 90, // the ONE delivered flow in the metric family
    irrigation_demand_m3_h: 90, // echo (excluded by FLOW_ECHO_TOKEN_RE)
    // brief-stated zoning geometry (water-builder emissions)
    distribution_delivery_groups: 2,
    distribution_branch_runs: 20,
    distribution_levels_per_branch: 5,
    distribution_risers_per_branch: 2,
    distribution_positions_per_zone: 30,
    distribution_zone_rows: 2,
    distribution_position_pitch_mm: 2760,
    distribution_position_width_mm: 1290,
    distribution_zone_valve_dn_mm: 65,
    // drain/return signal (activates the drain mirror)
    drain_water_tank_volume_each_m3: 40,
    drain_water_tank_count: 2,
    // hand-watering signal (rule 8b — the brief-stated 25 m³/h @ 3 bar manual duty)
    hand_watering_pump_throughput_m3_h: 25,
  }
}

const briefMetrics = [
  { key_metric: 'max_irrigation_demand_per_department', value: 45, unit: 'm3/h', category: 'scale' },
] as never[]

function freshContract(q: Record<string, number>): ContractInProgress {
  const cq: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(q)) cq[k] = { value: v, unit: '', family: '', basis: 'rated', scope: 'system', source: 'brief' }
  return { quantities: cq } as unknown as ContractInProgress
}

function expectEq(label: string, got: number | undefined, want: number): void {
  if (got !== want) throw new Error(`zoned-distribution: ${label} = ${got}, want ${want}`)
}

function run(): void {
  // ── 1. the CATCH: the water brief's zoned-delivery signals mint the full network ──
  const q = waterQuantities()
  const contract = freshContract(q)
  mintDemandCoverage(q, contract, { modules: [{ sub_modules: [{ words: [] }] }] as never, briefMetrics })
  // segment lengths — the exact standard-layout arithmetic (formulas in the source_detail)
  expectEq('zone lateral total (200 × 0.6 m)', q.distribution_zone_lateral_length_m, 120)
  expectEq('zone lateral DN (45 m³/h ≤ 3.0 m/s flood-fill)', q.distribution_zone_lateral_dn_mm, 75)
  expectEq('riser total (200/5 risers × 7 m)', q.distribution_riser_length_m, 280)
  expectEq('main/riser DN (45 m³/h ≤ 1.3 m/s surge-limited)', q.distribution_riser_dn_mm, 125)
  expectEq('mains total (2 × (10 × 7.7 m branch pitch + 30 m stand-off))', q.distribution_main_length_m, 214)
  expectEq('drain riser total (100 drops × 7 m)', q.distribution_drain_riser_length_m, 700)
  expectEq('drain DN (gravity ≤ 1.4 m/s)', q.distribution_drain_riser_dn_mm, 110)
  expectEq('drain collection (2 × 7.7 × 20)', q.distribution_drain_collection_length_m, 308)
  expectEq('drain main total (spine mirror)', q.distribution_drain_main_length_m, 214)
  expectEq('drain main DN (part-full ≤ 0.8 m/s)', q.distribution_drain_main_dn_mm, 160)
  expectEq('network total (km roll-up — different unit family from the segments so the provenance divergence net never false-fires)', q.distribution_network_length_km, 1.836)
  // connections + the per-group manifold principal quantities
  expectEq('zone kits', q.distribution_zone_kits, 200)
  expectEq('position connections', q.distribution_position_connections, 200)
  expectEq('drain outlet connections', q.distribution_drain_outlet_connections, 100)
  expectEq('manifold count (delivery groups)', q.distribution_manifold_count, 2)
  expectEq('manifold duty (90 ÷ 2 groups)', q.distribution_manifold_throughput_m3_h, 45)
  // rule 8b — HAND-WATERING RING MAIN from the brief's own signals (Tristan 2026-07-03,
  // client section E): the SAME zoning geometry reproduces the brief's stated numbers —
  // 44 risers ("two per tunnel plus four at the irrigation room") and DN90 at 25 m³/h.
  expectEq('hand-watering ring main (2 groups × 2 legs × the 107 m delivery spine)', q.hand_watering_ring_main_length_m, 428)
  expectEq('hand-watering ring DN (25 m³/h ≤ 1.3 m/s → DN90, the brief-stated DN)', q.hand_watering_ring_main_dn_mm, 90)
  expectEq('hand-watering risers (2/branch × 20 branches + 2/group at the plant room = the brief-stated 44)', q.hand_watering_riser_count, 44)
  // conserved arithmetic: the ring is EXACTLY the out-and-return mirror of the delivery
  // spine (2 × mains), and the riser count is EXACTLY the branch/group split — no slack.
  expectEq('ring length conservation (ring == 2 × delivery mains)', q.hand_watering_ring_main_length_m, 2 * q.distribution_main_length_m)
  expectEq('riser count conservation (2×20 + 2×2)', q.hand_watering_riser_count, 2 * 20 + 2 * 2)
  // provenance: 'parametric — not routed' + the derivation formula on the contract quantity
  const cq = (contract as unknown as { quantities: Record<string, { source_detail?: string; source?: string }> }).quantities
  const lat = cq.distribution_zone_lateral_length_m
  if (!lat || lat.source !== 'demand-coverage' || !/parametric — not routed/.test(String(lat.source_detail))) {
    throw new Error(`zoned-distribution: lateral quantity must carry 'parametric — not routed' demand-coverage provenance (got ${JSON.stringify(lat)})`)
  }
  if (!/200 zones × 0.6 m \(multi-tier shared-tray zone-valve stub\)/.test(String(lat.source_detail))) {
    throw new Error(`zoned-distribution: the lateral source_detail must state its derivation formula (got ${String(lat.source_detail)})`)
  }

  // ── 2. IDEMPOTENT + DETERMINISTIC: a second pass over its own mints is a no-op ──
  const snap = JSON.stringify(q)
  const mints2 = mintDemandCoverage(q, contract, { modules: [{ sub_modules: [{ words: [] }] }] as never, briefMetrics })
  if (mints2.some((m) => m.key.startsWith('distribution_') || m.key.startsWith('hand_watering_'))) {
    throw new Error('zoned-distribution: rule 8/8b re-minted on a second pass (must be idempotent)')
  }
  if (JSON.stringify(q) !== snap) throw new Error('zoned-distribution: a second pass changed the quantity map')

  // ── 3. BYTE-IDENTITY: a non-zoned archetype (BESS-like) is strictly untouched ──
  const bess: Record<string, number> = { battery_rack_count: 14, cell_count: 5000, chiller_duty_kw: 40, coolant_valve_count: 12 }
  const bessSnap = JSON.stringify(bess)
  const bessMints = mintDemandCoverage(bess, freshContract(bess), { modules: [], briefMetrics: [] })
  if (bessMints.length !== 0 || JSON.stringify(bess) !== bessSnap) {
    throw new Error(`zoned-distribution: BESS-like quantities must be byte-identical (minted ${JSON.stringify(bessMints)})`)
  }

  // ── 3b. SINGLE-LEVEL TEST: old flood-fill arithmetic runs for levels=1 ──
  const singleLevel = waterQuantities()
  singleLevel.distribution_levels_per_branch = 1
  singleLevel.actuated_distribution_valve_count = 8
  const singleContract = freshContract(singleLevel)
  mintDemandCoverage(singleLevel, singleContract, { modules: [{ sub_modules: [{ words: [] }] }] as never, briefMetrics })
  const scq = (singleContract as unknown as { quantities: Record<string, { source_detail?: string }> }).quantities
  const sLat = scq.distribution_zone_lateral_length_m
  if (!sLat || !/8 zones × \(30 positions\/zone ÷ 2 rows × 2.76 m/.test(String(sLat.source_detail))) {
    throw new Error(`zoned-distribution: single-level lateral must use the flood-fill positions/row formula, got: ${String(sLat?.source_detail)}`)
  }
  expectEq(
    'single-level position connections',
    (scq.distribution_position_connections as { value?: number } | undefined)?.value as number,
    6000,
  )
  // a valve count WITHOUT a zoning qualifier must never trigger (coolant_valve_count above);
  // a zoning valve count WITHOUT a delivered-flow basis must never fabricate a network.
  const noFlow: Record<string, number> = { actuated_zone_valve_count: 200 }
  mintDemandCoverage(noFlow, freshContract(noFlow), { modules: [], briefMetrics: [] })
  if (Object.keys(noFlow).some((k) => k.startsWith('distribution_'))) {
    throw new Error('zoned-distribution: no delivered-flow basis must mean NO network mint (never fabricate)')
  }
  // rule 8b no-fabricate both ways: a hand-watering flow WITHOUT zoned geometry mints
  // nothing (no spine to ring around), and a zoned plant WITHOUT a hand-watering flow
  // (SAF-like: zoning but no manual duty) gains no hand_watering_* key.
  const hwOnly: Record<string, number> = { hand_watering_pump_throughput_m3_h: 25 }
  mintDemandCoverage(hwOnly, freshContract(hwOnly), { modules: [], briefMetrics: [] })
  if (Object.keys(hwOnly).some((k) => k.startsWith('hand_watering_ring') || k.startsWith('hand_watering_riser'))) {
    throw new Error('zoned-distribution: a hand-watering flow with NO zoned geometry must mint nothing (never fabricate)')
  }
  const noHw = waterQuantities()
  delete noHw.hand_watering_pump_throughput_m3_h
  mintDemandCoverage(noHw, freshContract(noHw), { modules: [{ sub_modules: [{ words: [] }] }] as never, briefMetrics })
  if (Object.keys(noHw).some((k) => k.startsWith('hand_watering_'))) {
    throw new Error('zoned-distribution: a zoned plant with NO hand-watering flow must gain no hand_watering_* key')
  }
  // provenance + formula on the ring-main quantity itself
  const hwq = cq.hand_watering_ring_main_length_m
  if (!hwq || !/parametric — not routed/.test(String(hwq.source_detail))
    || !/2 legs \(ring out-and-return along the 107 m delivery spine/.test(String(hwq.source_detail))) {
    throw new Error(`zoned-distribution: the hand-watering ring main must carry 'parametric — not routed' provenance + its derivation formula (got ${JSON.stringify(hwq)})`)
  }

  // ── 4. the MANIFOLD principal synthesises via the normal group path, and a 1-stem
  //      overlap word must neither adopt it nor suppress it (full-stem guard) ──
  const q4 = waterQuantities()
  // a word whose ONLY stem overlap with the manifold group is 'manif' — without the
  // full-stem guard it would adopt the group (×2 + a 45 m³/h flow box) AND matched.add()
  // would suppress the real principal's synthesis.
  const bracket = {
    id: 'manifold_support_bracket',
    name_human: 'Manifold Support Bracket',
    content_character: { character_id: 'manifold_support_bracket', name_human: 'Manifold Support Bracket' },
    modifier_characters: [],
  }
  const modules4 = [
    { module: 'mass_fluid_transport_process', sub_modules: [{ words: [bracket] }] },
  ] as never[]
  applyUniversalContractSizing(modules4, freshContract(q4), {
    onlyUnsized: true, synthesizeMissing: true, dedupeAndStrip: false, explode: false, instrument: false, briefMetrics,
  })
  const allWords = (modules4 as Array<{ sub_modules: Array<{ words: Array<{ name_human?: string; modifier_characters?: Array<{ kind?: string; value?: unknown }> }> }> }>)
    .flatMap((m) => m.sub_modules).flatMap((sm) => sm.words ?? [])
  const manifold = allWords.find((w) => /distribution manifold/i.test(String(w.name_human)))
  if (!manifold) throw new Error('zoned-distribution: the Distribution Manifold principal was not synthesised via the group path (a 1-stem overlap word suppressed it?)')
  const mQty = (manifold.modifier_characters ?? []).find((mc) => mc.kind === 'quantity')
  if (!mQty || !/×\s*2\b/.test(String(mQty.value))) {
    throw new Error(`zoned-distribution: the manifold principal must carry ×2 (one per delivery group), got ${JSON.stringify(mQty)}`)
  }
  const brk = allWords.find((w) => w.name_human === 'Manifold Support Bracket')
  const brkQty = (brk?.modifier_characters ?? []).find((mc) => mc.kind === 'quantity' && !/×\s*1\b/.test(String(mc.value)))
  const brkDim = (brk?.modifier_characters ?? []).find((mc) => mc.kind === 'dimension' || mc.kind === 'dimensions')
  if (brkQty || brkDim) {
    throw new Error(`zoned-distribution: a 1-stem 'manif' overlap word adopted the manifold group (qty ${JSON.stringify(brkQty)}, dim ${JSON.stringify(brkDim)}) — the full-stem guard regressed`)
  }

  // eslint-disable-next-line no-console
  console.log('zoned-distribution --selftest OK (water-brief signals mint the 1,836 m parametric network — laterals 120 m DN75 multi-tier, mains/risers DN125, drain mirror DN110/DN160, 200 zone kits, 200 inlets — with formula provenance; single-level fallback preserved; rule 8b hand-watering ring 428 m DN90 + the brief-stated 44 risers, conserved vs the spine, no-op without either signal; idempotent; BESS-like map byte-identical; no-flow-basis never fabricates; manifold ×2 synthesised and shielded from 1-stem fuzzy matches)')
}

run()
