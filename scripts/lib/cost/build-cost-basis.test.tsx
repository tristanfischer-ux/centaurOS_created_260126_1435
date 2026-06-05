/**
 * build-cost-basis.test.tsx — guards the bridge from chain state → cost-basis trail.
 * Locks the matcher/guard/disclosure/rollup behaviour debugged on the real co2 state.
 * Run: npx tsx "scripts/lib/cost/build-cost-basis.test.tsx"   (network-free, deterministic)
 */
import { buildCostBasis } from './build-cost-basis'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}

const state = {
  parsedBrief: { product_class: 'co2_mineralisation' },
  // Engineering contract carries the first-principles lime reactor shell mass (2nd sink) so the
  // take-off prices the DESIGN mass, not a hardcoded default.
  orchestratorContract: { quantities: { lime_reactor_shell_mass_kg: { value: 420, unit: 'kg' } } },
  partVerifications: [
    { word_id: 'packed_absorber_column_word', word_name: 'packed absorber column', price_estimate_gbp: 26000 },
    { word_id: 'mea_circulation_pump_word', word_name: 'MEA circulation pump', price_estimate_gbp: 3850, distributor_price_gbp: 3850 },
    { word_id: 'k2so4_recrystalliser_word', word_name: 'K2SO4 recrystalliser', price_estimate_gbp: 21000 },
    { word_id: 'carbonation_static_mixer_word', word_name: 'carbonation static mixer', price_estimate_gbp: 3200 }, // aux — must NOT cost as the reactor
    { word_id: 'crystalliser_circulation_heater_word', word_name: 'crystalliser circulation heater', price_estimate_gbp: 8500 }, // aux — must NOT cost as the crystalliser
    { word_id: 'stirred_carbonation_reactor_word', word_name: 'stirred carbonation reactor', price_estimate_gbp: 24000 },
    // SECOND carbonation sink (2026-06-05): the secondary hydrated-lime reactor — must cost via the
    // lime take-off (~£14,450 for 420 kg 304SS + £5k agitator), NOT via the primary gypsum entry.
    { word_id: 'lime_carbonation_reactor_word', word_name: 'lime carbonation reactor vessel', price_estimate_gbp: 14450 },
    { word_id: 'reactor_drain_valve_word', word_name: 'reactor drain valve', price_estimate_gbp: 32000, distributor_price_gbp: 32000, engine_c_flag: 'over', engine_c_ratio: 8.2 },
    { word_id: 'misc_gasket_word', word_name: 'gasket', price_estimate_gbp: 12 },
  ],
}

console.log('build-cost-basis — matcher / guard / disclosure / rollup\n')
const r = buildCostBasis(state)
const line = (wid: string) => r.lines.find(l => l.word_id === wid)!

ok('class detected', r.class === 'co2_mineralisation')

const abs = line('packed_absorber_column_word')
ok('absorber re-costed by material take-off', abs.defensible && abs.basis.method === 'material_takeoff')
ok('absorber ≈ £42.6k (mass take-off, not the engine £26k)', Math.abs(abs.cost_gbp - 42646) / 42646 < 0.02, `got £${abs.cost_gbp}`)
ok('absorber carries a human-readable working string', typeof abs.working === 'string' && /£6\/kg/.test(abs.working!) && /fabrication/.test(abs.working!), abs.working)

const pump = line('mea_circulation_pump_word')
ok('MEA pump → catalogue override £4,000', pump.defensible && pump.basis.method === 'catalogue' && pump.cost_gbp === 4000)

const cryst = line('k2so4_recrystalliser_word')
ok('crystalliser → vendor_quote + RFQ', cryst.basis.method === 'vendor_quote' && cryst.basis.rfq_recommended)

// the critical guard: auxiliaries must NOT be costed as the main unit
const mixer = line('carbonation_static_mixer_word')
ok('static mixer NOT costed as the reactor (guarded → disclosure)', !mixer.defensible && mixer.cost_gbp === 3200)
const heater = line('crystalliser_circulation_heater_word')
ok('crystalliser heater NOT costed as the crystalliser (guarded)', !heater.defensible && heater.cost_gbp === 8500)

const reactor = line('stirred_carbonation_reactor_word')
ok('reactor re-costed by take-off ≈ £20.8k (bare shell; agitator is a separate line)',
  reactor.defensible && reactor.basis.method === 'material_takeoff' && Math.abs(reactor.cost_gbp - 20843) / 20843 < 0.02, `got £${reactor.cost_gbp}`)

// SECOND carbonation sink: the secondary lime reactor must cost via the lime take-off
// (420 kg 304SS × £5/kg × 4.5 fab + £5k agitator = £14,450), NOT via the primary gypsum entry,
// and it must read the contract shell mass (420 kg), not be guarded out as an auxiliary.
const lime = line('lime_carbonation_reactor_word')
ok('secondary lime reactor re-costed by take-off ≈ £14,450 (420 kg 304SS + £5k agitator)',
  lime.defensible && lime.basis.method === 'material_takeoff' && Math.abs(lime.cost_gbp - 14450) / 14450 < 0.02, `got £${lime.cost_gbp}`)
ok('lime reactor working string shows 304 stainless + agitator (the 2nd-sink cost build-up)',
  typeof lime.working === 'string' && /304 stainless/.test(lime.working!) && /agitator/.test(lime.working!), lime.working)

const valve = line('reactor_drain_valve_word')
ok('over-flagged catalogue line is NOT high confidence', valve.basis.method === 'catalogue' && valve.basis.confidence !== 'high')
ok('over-flag noted in the basis', /over/.test(valve.basis.notes ?? ''))

const gasket = line('misc_gasket_word')
ok('unsourced estimate → llm_estimate, low confidence, RFQ', gasket.basis.method === 'llm_estimate' && gasket.basis.confidence === 'low' && gasket.basis.rfq_recommended)

// rollup uses the SKID factor, never the stick-built Lang 4.74
ok('installed central = purchased × 3.0 (skid factor, not Lang)',
  Math.abs(r.rollup.installed_central_gbp - r.rollup.purchased_gbp * 3.0) < 2,
  `central £${r.rollup.installed_central_gbp} vs purchased×3 £${Math.round(r.rollup.purchased_gbp * 3)}`)
ok('installed low/high bracket the central', r.rollup.installed_low_gbp < r.rollup.installed_central_gbp && r.rollup.installed_central_gbp < r.rollup.installed_high_gbp)
ok('methodology statement present', typeof r.methodology.statement === 'string' && r.methodology.statement.length > 20)
ok('take-off lines counted (absorber + primary gypsum reactor + secondary lime reactor = 3 here; stripper word absent in this fixture)',
  r.methodology.takeoff_lines === 3, `takeoff_lines=${r.methodology.takeoff_lines}`)
ok('every line carries a basis with a method + estimate_class', r.lines.every(l => l.basis && l.basis.method && l.basis.estimate_class >= 1))

// an unmapped class → universal disclosure only (no curve lines), never throws
const other = buildCostBasis({ parsedBrief: { product_class: 'widget_press' },
  partVerifications: [{ word_id: 'frame_word', word_name: 'frame', price_estimate_gbp: 5000 }] })
ok('unmapped class → all disclosure, no curve lines', other.methodology.curve_lines === 0 && other.lines.length === 1 && !other.lines[0].defensible)
ok('empty / missing partVerifications → no throw, empty lines', buildCostBasis({}).lines.length === 0)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
