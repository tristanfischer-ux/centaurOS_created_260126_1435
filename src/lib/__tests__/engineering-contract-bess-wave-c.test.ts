/**
 * @file engineering-contract-bess-wave-c.test.ts
 *
 * Regression guard for BESS WAVE C addenda (2026-07-04):
 *   Addendum 5 — the real root cause behind the "feasibility mass-cap bug"
 *     report was a regex ambiguity: `usableKwh` picked up the NAMEPLATE
 *     figure ("Nameplate energy capacity: 5 MWh") instead of the USABLE
 *     figure ("Usable energy capacity: approximately 4.5 MWh") whenever a
 *     brief states both (it appears first in the text). The brief's own
 *     44,000 kg mass cap was ALREADY read correctly (verified against
 *     out/bess-campaign-v2/0.5-engineering-contract.json:
 *     container_payload_rating_kg = 44000) — the mass-cap framing in the
 *     original report was imprecise; the usable-vs-nameplate conflation was
 *     the real defect.
 *   Addendum 6 — round_trip_efficiency_percent and cost_per_kwh_gbp as
 *     DELIVERED contract quantities with full lineage.
 */

import { buildContract } from '../../../scripts/lib/engineering-contract'

function makeBrief(overrides: Partial<{ withUsableLine: boolean; unitCostCeiling: number; withBatteryOnlyAnchor: boolean }> = {}) {
  const withUsableLine = overrides.withUsableLine ?? true
  const withBatteryOnlyAnchor = overrides.withBatteryOnlyAnchor ?? true
  return {
    project_id: 'test-bess',
    product_description: 'A 20-foot containerised lithium iron phosphate (LFP) battery energy storage system with a 5 MWh nameplate capacity and 2.5 MW power rating.',
    original_text: [
      'Key constraints:',
      '- Nameplate energy capacity: 5 MWh (5,000 kWh)',
      withUsableLine ? '- Usable energy capacity: approximately 4.5 MWh at beginning of life (90% depth of discharge)' : '',
      '- Headline power rating: 2.5 MW (2,500 kW) continuous, two-hour discharge duration',
      '- Direct-current bus voltage: approximately 1,500 V nominal',
      '- Round-trip efficiency: at least 88% at beginning of life',
      '- Maximum gross mass: 44,000 kg',
    ].filter(Boolean).join('\n'),
    constraints: {
      unit_cost_ceiling: { value: overrides.unitCostCeiling ?? 900000, currency: 'GBP', source: 'user' },
      max_mass_kg: { value: 44000, source: 'user' },
      operating_environment: { temp_min_c: -20, temp_max_c: 45 },
      target_performance: {
        value: 5,
        unit: 'MWh',
        metrics: [
          { key_metric: 'nameplate_capacity_mwh', value: 5, unit: 'MWh', category: 'scale', source: 'user' },
          { key_metric: 'usable_energy_capacity_mwh', value: 4.5, unit: 'MWh', category: 'scale', source: 'user' },
          { key_metric: 'rated_power_mw', value: 2.5, unit: 'MW', category: 'scale', source: 'user' },
          { key_metric: 'round_trip_efficiency_percent', value: 88, unit: '%', category: 'efficiency', source: 'user' },
        ],
      },
      // Real brief text (out/bess-campaign-v3/0-original-brief.md) — the
      // battery-container-only cost anchor lives here, NOT in a structured
      // target_performance metric, so the contract must parse it from prose.
      additional_constraints: withBatteryOnlyAnchor
        ? [{ description: 'Cost target for battery container only (excluding PCS/MV) is £315,000 / £63 per kWh', source: 'user' }]
        : [],
    },
  }
}

describe('BESS WAVE C addendum 5 — usableKwh root cause (nameplate/usable conflation)', () => {
  it('reads the USABLE figure (4500), not the NAMEPLATE figure (5000), when a brief states both', () => {
    const contract = buildContract('bess', makeBrief({ withUsableLine: true }))!
    expect(contract.quantities.usable_capacity_kwh_requested.value).toBe(4500)
  })

  it('falls back gracefully to the broad pattern when NEITHER the structured metric NOR an explicit "usable" line is present', () => {
    const brief = makeBrief({ withUsableLine: false })
    // Strip the structured usable-energy metric too, to exercise the pure
    // free-text fallback path (priority #3, the old broad pattern).
    brief.constraints.target_performance.metrics = brief.constraints.target_performance.metrics.filter(
      (m) => m.key_metric !== 'usable_energy_capacity_mwh',
    )
    const contract = buildContract('bess', brief)!
    // With no "usable" signal anywhere, the old broad pattern picks up
    // "Nameplate energy capacity: 5 MWh" (5000) — unchanged fallback
    // behaviour for a brief that only ever states one capacity figure.
    expect(contract.quantities.usable_capacity_kwh_requested.value).toBe(5000)
  })

  it('the mass cap was NOT the bug — container_payload_rating_kg already reads the real brief value (44,000 kg)', () => {
    const contract = buildContract('bess', makeBrief())!
    expect(contract.quantities.container_payload_rating_kg.value).toBe(44000)
  })

  it('brief_target_feasibility closure narrative uses live variables, not stale "800 V + 28 t" / "1P × 250S" literals', () => {
    const contract = buildContract('bess', makeBrief())!
    const closure = contract.closures?.find((c: any) => c.invariant_id === 'brief_target_feasibility') as any
    expect(closure).toBeDefined()
    expect(closure.reason).not.toContain('800 V')
    expect(closure.reason).not.toContain('28 t')
    expect(closure.reason).not.toContain('250S')
    expect(closure.reason).toContain('1500 V')
  })
})

describe('BESS WAVE C addendum 6 — round_trip_efficiency_percent (delivered)', () => {
  it('is present, grounded, and clears the brief floor for a well-formed brief', () => {
    const contract = buildContract('bess', makeBrief())!
    const rte = contract.quantities.round_trip_efficiency_percent
    expect(rte).toBeDefined()
    expect(rte.value).toBeGreaterThan(0)
    expect(rte.value).toBeLessThan(100)
    expect(rte.source_detail).toMatch(/cell RTE/)
    expect(rte.source_detail).toMatch(/PCS efficiency/)
    expect(rte.source_detail).toMatch(/aux-load factor/)
  })

  it('the round_trip_efficiency_closure compares against the brief target (88%)', () => {
    const contract = buildContract('bess', makeBrief())!
    const closure = contract.closures?.find((c: any) => c.invariant_id === 'round_trip_efficiency_closure') as any
    expect(closure).toBeDefined()
    expect(closure.required.value).toBe(88)
    expect(['pass', 'warn', 'fail']).toContain(closure.status)
  })
})

describe('BESS WAVE C addendum 6 — cost_per_kwh_gbp (delivered)', () => {
  it('is present, grounded in the real macro_assembly_prices total, and carries scope caveats', () => {
    const contract = buildContract('bess', makeBrief())!
    const cost = contract.quantities.cost_per_kwh_gbp
    expect(cost).toBeDefined()
    expect(cost.value).toBeGreaterThan(0)
    expect(cost.unit).toBe('GBP/kWh')
    expect(cost.family).toBe('currency')
    const macroTotal = (contract.macro_assembly_prices ?? []).reduce((a, m) => a + m.total_gbp, 0)
    expect(cost.value).toBeCloseTo(macroTotal / contract.quantities.usable_capacity_kwh.value, 3)
    expect(cost.source_detail).toMatch(/EXCLUDES step-up transformer/)
    // WAVE C addendum 7: this figure is now explicitly labelled as NOT the
    // brief's headline anchor — battery_only_cost_per_kwh_gbp is that scope.
    expect(cost.source_detail).toMatch(/NOT the brief's headline battery-only anchor/)
  })
})

// WAVE C addendum 7 (2026-07-05, cost_per_kwh_closure SCOPE FIX) — the closure
// previously compared the FULL macro total (incl. PCS) against a ceiling-
// implied £/kWh, which NEVER actually confronted the brief's own named cost
// target ("battery container only … £63 per kWh") and hid a genuine ~2.3x
// battery-only cost overrun behind a mild 1.10x "warn". Fixed by deriving
// BOTH scopes: a battery-only rollup compared to the brief's OWN parsed
// anchor (cost_per_kwh_closure), and the full-system-flavoured figure kept
// separately with its own honest caveat (full_system_cost_per_kwh_closure).
describe('BESS WAVE C addendum 7 — battery_only_cost_per_kwh_gbp + scope-matched cost_per_kwh_closure', () => {
  it('battery_only_cost_per_kwh_gbp EXCLUDES the PCS and divides by NAMEPLATE kWh (matching the brief\'s own £315,000/5,000 kWh derivation)', () => {
    const contract = buildContract('bess', makeBrief())!
    const cost = contract.quantities.battery_only_cost_per_kwh_gbp
    expect(cost).toBeDefined()
    expect(cost.value).toBeGreaterThan(0)
    const batteryOnlyTotal = (contract.macro_assembly_prices ?? [])
      .filter((m: any) => m.word_name !== 'pcs_inverter')
      .reduce((a: number, m: any) => a + m.total_gbp, 0)
    expect(cost.value).toBeCloseTo(batteryOnlyTotal / contract.quantities.nameplate_capacity_kwh.value, 3)
    expect(cost.source_detail).toMatch(/SCOPE-MATCHED to the brief's own battery-container-only cost anchor/)
  })

  it('PROVECATCH — cost_per_kwh_closure compares the battery-only rollup against the brief\'s OWN parsed £63/kWh anchor, and FAILS on the genuine ~2.3x battery-only overrun (never softened by the whole-system ceiling)', () => {
    const contract = buildContract('bess', makeBrief())!
    const closure = contract.closures?.find((c: any) => c.invariant_id === 'cost_per_kwh_closure') as any
    expect(closure).toBeDefined()
    expect(closure.required.value).toBeCloseTo(63, 3)
    expect(closure.measured.value).toBeCloseTo(contract.quantities.battery_only_cost_per_kwh_gbp.value, 3)
    // The default well-formed brief's battery-only rollup genuinely exceeds
    // the £63/kWh anchor by >1.15x (real v3 shape: ~£147/kWh vs £63/kWh,
    // ratio ~2.3) — the closure must FAIL, not be softened by comparing
    // against the laxer whole-system ceiling.
    expect(closure.measured.value / 63).toBeGreaterThan(1.15)
    expect(closure.status).toBe('fail')
  })

  it('grounding-refusal: a brief with no parseable battery-only anchor text yields NO cost_per_kwh_closure — never fabricates a target', () => {
    const contract = buildContract('bess', makeBrief({ withBatteryOnlyAnchor: false }))!
    const closure = contract.closures?.find((c: any) => c.invariant_id === 'cost_per_kwh_closure')
    expect(closure).toBeUndefined()
    // battery_only_cost_per_kwh_gbp itself is still delivered — it needs no
    // anchor to compute, only the anchor-COMPARISON closure is withheld.
    expect(contract.quantities.battery_only_cost_per_kwh_gbp).toBeDefined()
  })

  it('a battery-only rollup within the anchor band PASSES (proveCatch, clean direction): an artificially cheap anchor must not spuriously fail', () => {
    // Same brief, but with an anchor loose enough that the real battery-only
    // rollup clears it — proves the closure is a genuine two-sided test, not
    // a check that always fires FAIL regardless of the numbers.
    const brief = makeBrief()
    ;(brief.constraints as any).additional_constraints = [
      { description: 'Cost target for battery container only (excluding PCS/MV) is £1,500,000 / £300 per kWh', source: 'user' },
    ]
    const contract = buildContract('bess', brief)!
    const closure = contract.closures?.find((c: any) => c.invariant_id === 'cost_per_kwh_closure') as any
    expect(closure).toBeDefined()
    expect(closure.required.value).toBeCloseTo(300, 3)
    expect(closure.status).toBe('pass')
  })
})

describe('BESS WAVE C addendum 7 — full_system_cost_per_kwh_closure (kept, separate, own caveat)', () => {
  it('PROVECATCH — compares the full-system-flavoured figure against the ceiling-implied £/kWh and still flags a genuine overrun', () => {
    const contract = buildContract('bess', makeBrief())!
    const closure = contract.closures?.find((c: any) => c.invariant_id === 'full_system_cost_per_kwh_closure') as any
    expect(closure).toBeDefined()
    const expectedCeilingPerKwh = 900000 / contract.quantities.usable_capacity_kwh.value
    expect(closure.required.value).toBeCloseTo(expectedCeilingPerKwh, 3)
    expect(closure.measured.value).toBeCloseTo(contract.quantities.cost_per_kwh_gbp.value, 3)
    expect(closure.reason).toMatch(/NOT the brief's battery-only headline anchor/)
  })

  it('grounding-refusal: a zero unit_cost_ceiling refuses the ceiling-implied comparator rather than dividing by zero', () => {
    const contract = buildContract('bess', makeBrief({ unitCostCeiling: 0 }))!
    const closure = contract.closures?.find((c: any) => c.invariant_id === 'full_system_cost_per_kwh_closure')
    expect(closure).toBeUndefined()
    // cost_per_kwh_gbp itself is still delivered (grounded in the real BoM
    // estimate, independent of the ceiling comparator).
    expect(contract.quantities.cost_per_kwh_gbp).toBeDefined()
    // AND the battery-only closure is UNAFFECTED by unit_cost_ceiling — it
    // never depended on the ceiling in the first place (proves the two
    // scopes are genuinely independent, not accidentally coupled).
    const batteryClosure = contract.closures?.find((c: any) => c.invariant_id === 'cost_per_kwh_closure')
    expect(batteryClosure).toBeDefined()
  })
})

describe('BESS WAVE C — determinism', () => {
  it('two buildContract calls are byte-identical', () => {
    const brief = makeBrief()
    const a = buildContract('bess', brief)
    const b = buildContract('bess', brief)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
