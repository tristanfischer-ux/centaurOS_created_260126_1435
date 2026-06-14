/**
 * Guard tests for brief-expander's load-bearing pure logic (no LLM).
 * Run: npx tsx src/lib/pdf-engine-v2/brief-expander.test.tsx
 *
 * These guard the two invariants that keep the expander honest:
 *   GUARD 1 — a derived "duty" must NEVER be a cost/mass CAP (a fabricated tight
 *             cap can drive a FALSE compliance PASS — the impossible-brief gotcha).
 *   FAIL-SAFE — an expansion with <2 valid duties is rejected (null), so a thin /
 *               malformed completion can only ADD signal, never replace the brief.
 */
import assert from 'node:assert'
import { isCapNotDuty, sanitiseExpansion, type DerivedRequirement } from './brief-expander'

function duty(partial: Partial<DerivedRequirement>): DerivedRequirement {
  return {
    key: 'k', label: 'L', value: 1, unit: 'x', basis: 'b',
    provenance: 'derived', confidence: 'high', category: 'other', ...partial,
  }
}

// ── GUARD 1: caps stripped, real duties kept ────────────────────────────────
assert.equal(isCapNotDuty(duty({ key: 'unit_cost_ceiling', label: 'Cost ceiling', unit: 'GBP' })), true, 'cost ceiling must be a cap')
assert.equal(isCapNotDuty(duty({ key: 'capex_budget_gbp', label: 'CAPEX budget', unit: 'GBP' })), true, 'capex budget must be a cap')
assert.equal(isCapNotDuty(duty({ key: 'max_mass_kg', label: 'Maximum gross mass', unit: 'kg', category: 'structural' })), true, 'max mass must be a cap')
assert.equal(isCapNotDuty(duty({ key: 'recirculation_flow_m3_per_h', label: 'Recirculation flow', unit: 'm3/h', category: 'flow' })), false, 'a flow duty is NOT a cap')
assert.equal(isCapNotDuty(duty({ key: 'total_system_mass_kg', label: 'Total system mass', unit: 'kg', category: 'structural' })), false, 'a mass DUTY (not a max/cap) is kept')

// ── FAIL-SAFE: <2 valid duties → null ───────────────────────────────────────
assert.equal(sanitiseExpansion({ derived_requirements: [{ key: 'a', label: 'A', value: 1, unit: 'kW' }] }), null, '<2 duties → null')
assert.equal(sanitiseExpansion({ derived_requirements: [] }), null, 'no duties → null')
assert.equal(sanitiseExpansion(null), null, 'null raw → null')

// ── Happy path: caps stripped from a real expansion, valid duties survive ────
const out = sanitiseExpansion({
  product_summary: 'Land-based RAS', primary_product: 'kingfish', construction_materials: 'HDPE/FRP',
  derived_requirements: [
    { key: 'o2_demand_kg_d', label: 'O2 demand', value: 360, unit: 'kg/d', basis: 'x', provenance: 'derived', confidence: 'high', category: 'mass_transfer' },
    { key: 'tan_kg_d', label: 'TAN', value: 21.6, unit: 'kg/d', basis: 'x', provenance: 'derived', confidence: 'high', category: 'water_quality' },
    { key: 'unit_cost_ceiling', label: 'Cost ceiling', value: 5_000_000, unit: 'GBP', basis: 'x', provenance: 'stated', confidence: 'high', category: 'other' },
  ],
})
assert.ok(out, 'valid expansion returns an object')
assert.equal(out!.derived_requirements.length, 2, 'the cost-ceiling cap is stripped → 2 duties remain')
assert.equal(out!.derived_requirements.find(r => r.key === 'unit_cost_ceiling'), undefined, 'no cap survives into duties')
assert.equal(out!.primary_product, 'kingfish', 'product identity preserved')

console.log('brief-expander guard tests PASSED (GUARD 1 + fail-safe + happy path)')
