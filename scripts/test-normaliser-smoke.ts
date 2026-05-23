/**
 * Smoke test for the Normaliser + 3 refactored detectors.
 *
 * Tests three scenarios for each class:
 *   1. The KNOWN BUG scenario (what made the chain fail in production)
 *   2. The HAPPY PATH (parser picks right metric)
 *   3. Edge case (whitespace in unit, comma thousands)
 *
 * Run: npx tsx scripts/test-normaliser-smoke.ts
 */

import { detectEnvelope } from './lib/orchestrator/envelope'
import type { ParsedConstraints } from './lib/orchestrator/types'

let pass = 0
let fail = 0

function test(name: string, c: Partial<ParsedConstraints>, expect: { class: string; scale_tier: string } | null) {
  const constraints: ParsedConstraints = {
    product_class: 'unknown',
    product_description: '',
    ...c,
  } as ParsedConstraints
  const env = detectEnvelope(constraints)
  const ok =
    (expect === null && env === null) ||
    (expect !== null && env !== null && env.class === expect.class && env.scale_tier === expect.scale_tier)
  if (ok) {
    pass++
    console.log(`  ✓ ${name} → ${env ? `${env.class}/${env.scale_tier}` : 'null'}`)
  } else {
    fail++
    console.log(`  ✗ ${name} — expected ${JSON.stringify(expect)}, got ${JSON.stringify(env && { class: env.class, scale_tier: env.scale_tier })}`)
  }
}

console.log('\n══ BIOREACTOR ════════════════════════════════════════════════════════')
console.log('Scenario 1: parser picked kLa (the original confirmed bug)')
test('parser picked kLa, volume in product_description', {
  product_class: 'bioreactor',
  product_description: 'A 200 L single-use bioreactor (SUB) for pilot-scale process development. Nominal working volume: 200 L. kLa ≥ 8 hr⁻¹ at 1 vvm air sparging.',
  target_performance: { value: 8, unit: 'hr-1' },
}, { class: 'bioreactor', scale_tier: 'pilot' })

console.log('Scenario 2: parser picked volume (happy path)')
test('parser picked volume', {
  product_class: 'bioreactor',
  product_description: 'A 200 L single-use bioreactor',
  target_performance: { value: 200, unit: 'L' },
}, { class: 'bioreactor', scale_tier: 'pilot' })

console.log('Scenario 3: whitespace in unit')
test('whitespace in unit " L "', {
  product_class: 'bioreactor',
  product_description: 'A bioreactor for biotech.',
  target_performance: { value: 200, unit: ' L ' },
}, { class: 'bioreactor', scale_tier: 'pilot' })

console.log('Scenario 4: bench scale')
test('50L bench scale via target_performance', {
  product_class: 'bioreactor',
  product_description: 'A 50 L bench-scale fermenter',
  target_performance: { value: 50, unit: 'l' },
}, { class: 'bioreactor', scale_tier: 'bench' })

console.log('Scenario 5: production scale via m³')
test('5 m³ production unit via m³ unit', {
  product_class: 'bioreactor',
  product_description: 'A 5 m³ production unit',
  target_performance: { value: 5, unit: 'm³' },
}, { class: 'bioreactor', scale_tier: 'production' })

console.log('Scenario 6: comma thousands (1,500 L)')
test('1,500 L parser miss, found via desc', {
  product_class: 'bioreactor',
  product_description: 'A 1,500 L production fermenter for monoclonal antibody manufacture.',
  target_performance: { value: 8, unit: 'hr-1' },
}, { class: 'bioreactor', scale_tier: 'production' })

console.log('Scenario 7: graceful null when no volume anywhere')
test('no volume anywhere → null', {
  product_class: 'bioreactor',
  product_description: 'A bioreactor.',
  target_performance: { value: 8, unit: 'hr-1' },
}, null)

console.log('\n══ HEAT PUMP ═════════════════════════════════════════════════════════')
console.log('Scenario 1: parser picked SCOP (suspected bug)')
test('parser picked SCOP, kW in desc', {
  product_class: 'heat_pump_residential',
  product_description: 'A 12 kW air-source heat pump with SCOP of 4.2 for residential dwellings. Heat output: 12 kW at A2/W35.',
  target_performance: { value: 4.2, unit: 'dimensionless' },
}, { class: 'heat_pump_residential', scale_tier: 'residential' })

console.log('Scenario 2: parser picked kW heat output (happy path)')
test('parser picked kW heat output', {
  product_class: 'heat_pump_residential',
  product_description: 'A 12 kW air-source heat pump',
  target_performance: { value: 12, unit: 'kW' },
}, { class: 'heat_pump_residential', scale_tier: 'residential' })

console.log('Scenario 3: light_commercial 25 kW')
test('25 kW light commercial', {
  product_class: 'heat_pump_residential',
  product_description: 'A 25 kW commercial heat pump',
  target_performance: { value: 25, unit: 'kW' },
}, { class: 'heat_pump_residential', scale_tier: 'light_commercial' })

console.log('Scenario 4: parser picked refrigerant fill quantity (wrong)')
test('parser picked refrigerant kg, kW in desc', {
  product_class: 'heat_pump_residential',
  product_description: 'A 8 kW monobloc heat pump with R290 refrigerant. Heat output: 8 kW at A7/W35.',
  target_performance: { value: 1.5, unit: 'kg' },
}, { class: 'heat_pump_residential', scale_tier: 'residential' })

console.log('\n══ H2 ELECTROLYSER ═══════════════════════════════════════════════════')
console.log('Scenario 1: parser picked H2 production rate (suspected bug)')
test('parser picked Nm³/hr, MW in desc', {
  product_class: 'h2_electrolyser',
  product_description: 'A 5 MW PEM electrolyser. Hydrogen output: 1000 Nm³/hr. Electrical input: 5 MW.',
  target_performance: { value: 1000, unit: 'Nm3/hr' },
}, { class: 'h2_electrolyser', scale_tier: 'industrial' })  // 1000 * 5.0 = 5000 kW → industrial tier

console.log('Scenario 2: parser picked MW (happy path)')
test('parser picked MW directly', {
  product_class: 'h2_electrolyser',
  product_description: 'A 5 MW PEM electrolyser',
  target_performance: { value: 5, unit: 'MW' },
}, { class: 'h2_electrolyser', scale_tier: 'industrial' })

console.log('Scenario 3: lab scale 50 kW')
test('50 kW lab', {
  product_class: 'h2_electrolyser',
  product_description: 'A 50 kW alkaline electrolyser for academic research',
  target_performance: { value: 50, unit: 'kW' },
}, { class: 'h2_electrolyser', scale_tier: 'lab' })

console.log('Scenario 4: H2 rate only (parser missed power entirely)')
test('100 Nm³/hr only, → 500 kW commercial', {
  product_class: 'h2_electrolyser',
  product_description: 'A 100 Nm³/hr PEM electrolyser. Hydrogen output: 100 Nm³/hr.',
  target_performance: { value: 100, unit: 'Nm3/hr' },
}, { class: 'h2_electrolyser', scale_tier: 'commercial' })  // 100 * 5.0 = 500 kW

console.log('\n══ BESS ══════════════════════════════════════════════════════════════')
console.log('Scenario 1: parser picked C-rate (suspected bug)')
test('parser picked C-rate, MWh in desc', {
  product_class: 'bess',
  product_description: 'A 4 MWh utility-scale BESS in a 40-foot container. Nameplate capacity: 4 MWh. C-rate: 0.5C.',
  target_performance: { value: 0.5, unit: 'C' },
}, { class: 'bess', scale_tier: 'utility_containerised' })

console.log('Scenario 2: 100 kWh light_commercial')
test('100 kWh via target_performance', {
  product_class: 'bess',
  product_description: 'A 100 kWh commercial BESS',
  target_performance: { value: 100, unit: 'kWh' },
}, { class: 'bess', scale_tier: 'light_commercial' })

console.log('\n══ EV CHARGER ════════════════════════════════════════════════════════')
console.log('Scenario 1: parser picked efficiency')
test('parser picked efficiency, kW in desc', {
  product_class: 'ev_charger',
  product_description: 'A 350 kW DC fast charger with 97% efficiency. Output power: 350 kW.',
  target_performance: { value: 97, unit: '%' },
}, { class: 'ev_charger', scale_tier: 'ultra_fast' })

console.log('Scenario 2: 150 kW happy path')
test('150 kW dc_fast', {
  product_class: 'ev_charger',
  product_description: 'A 150 kW DC fast charger',
  target_performance: { value: 150, unit: 'kW' },
}, { class: 'ev_charger', scale_tier: 'dc_fast' })

console.log('\n══ PEMFC ═════════════════════════════════════════════════════════════')
console.log('Scenario 1: parser picked Pt loading')
test('parser picked Pt loading, kW in desc', {
  product_class: 'pemfc',
  product_description: 'A 100 kW automotive fuel cell stack. Rated power: 100 kW. Pt loading: 0.4 mg/cm².',
  target_performance: { value: 0.4, unit: 'mg/cm2' },
}, { class: 'pemfc', scale_tier: 'transport' })

console.log('\n══ SMR ═══════════════════════════════════════════════════════════════')
console.log('Scenario 1: parser picked capacity factor')
test('parser picked capacity factor, MWe in desc', {
  product_class: 'smr',
  product_description: 'A 300 MWe small modular reactor with 95% capacity factor. Rated thermal power: 900 MWt. Net electrical output: 300 MWe.',
  target_performance: { value: 95, unit: '%' },
}, { class: 'smr', scale_tier: 'medium_smr' })

console.log('\n══════════════════════════════════════════════════════════════════════')
console.log(`Pass: ${pass}  Fail: ${fail}`)
process.exit(fail > 0 ? 1 : 0)
