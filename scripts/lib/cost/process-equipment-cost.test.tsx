/**
 * process-equipment-cost.test.tsx — validates the cost module against the signed-off CO₂ mockup
 * (mockups/co2-cost-basis-mockup.html). The mockup's flagship numbers are the spec.
 * Run: npx tsx "scripts/lib/cost/process-equipment-cost.test.tsx"
 * Network-free, deterministic.
 */
import {
  costProcessEquipment, costMaterialTakeoff, installedFromPurchased, catalogueBasis,
  ESCALATION, MATERIAL_FACTORS, MATERIAL_RATE_GBP_PER_KG, FABRICATION_FACTOR,
  toGallonsUS, toFt2, toFt, kwToHp, m3hToCfm,
} from './process-equipment-cost'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
function near(name: string, got: number, want: number, tolPct = 10) {
  const within = Math.abs(got - want) / want <= tolPct / 100
  ok(name, within, `got £${Math.round(got).toLocaleString('en-GB')}, want ≈£${want.toLocaleString('en-GB')} (±${tolPct}%)`)
}

console.log('process-equipment-cost — flagship CO₂ lines vs signed-off mockup\n')

// ── Flagship £ figures reproduce the mockup (±10%) ──
const absorber = costProcessEquipment({
  label: 'Packed absorber column', curve: 'packed_column',
  packedColumn: { idFt: 0.98 /* DN300 */, heightFt: toFt(12) }, material: 'ss316_vessel',
})
near('absorber column ≈ £61,200', absorber.gbp, 61200)

const stripper = costProcessEquipment({
  label: 'Stripper column', curve: 'packed_column',
  packedColumn: { idFt: 0.98, heightFt: toFt(8) }, material: 'ss316_vessel',
})
near('stripper column ≈ £51,800', stripper.gbp, 51800)

const reactor = costProcessEquipment({
  label: 'Gypsum carbonation reactor', curve: 'vertical_vessel_15psig',
  size: { value: toGallonsUS(1.0), unit: 'US_gal' }, material: 'ss316_vessel', agitatorHp: kwToHp(4),
})
near('carbonation reactor ≈ £82,300', reactor.gbp, 82300)

const crossHx = costProcessEquipment({
  label: 'Lean/rich cross-exchanger', curve: 'spiral_plate_hx',
  size: { value: toFt2(8), unit: 'ft2' }, material: 'none',
})
near('cross-exchanger ≈ £15,400', crossHx.gbp, 15400)

const blower = costProcessEquipment({
  label: 'Flue-gas blower', curve: 'rotary_blower',
  size: { value: m3hToCfm(225), unit: 'cfm' }, material: 'none',
})
near('flue-gas blower ≈ £21,100', blower.gbp, 21100)

// ── Catalogue line (MEA pump) — keep the live price, high confidence ──
const pump = catalogueBasis(4000, { vendor: 'Grundfos', mpn: 'CRNE 5-8', url: 'https://product-selection.grundfos.com' })
ok('pump uses catalogue method', pump.method === 'catalogue')
ok('pump cost = £4,000', pump.result_gbp === 4000)
ok('pump high confidence, no RFQ', pump.confidence === 'high' && pump.rfq_recommended === false)

// ── Crystalliser — no curve → honest RFQ, never a fake number ──
const cryst = costProcessEquipment({
  label: 'K₂SO₄ crystalliser', curve: 'none', material: 'ss316_vessel',
  rfqRange: { lowGbp: 50000, highGbp: 150000, reason: 'forced-circulation packaged unit' },
})
ok('crystalliser = vendor_quote method', cryst.basis.method === 'vendor_quote')
ok('crystalliser flagged RFQ + low confidence', cryst.basis.rfq_recommended && cryst.basis.confidence === 'low')
near('crystalliser mid ≈ £100,000', cryst.gbp, 100000)

// ── Installed plant cost via Lang factor ──
near('installed from £450,400 purchased ≈ £2.14M', installedFromPurchased(450400).gbp, 2135000, 3)

// ── Trail / estimate-class structure ──
ok('absorber extrapolated (39 ft > 18 ft drawn) → RFQ + class 5',
  absorber.basis.rfq_recommended && absorber.basis.estimate_class === 5)
ok('reactor in-range → no RFQ, class 4',
  reactor.basis.rfq_recommended === false && reactor.basis.estimate_class === 4)
ok('cross-HX cites DOE/NETL spiral-plate p17',
  crossHx.basis.correlation?.ref === 'DOE/NETL-2002/1169' && /Spiral/.test(crossHx.basis.correlation?.locator ?? ''))
ok('reactor trail carries CEPCI + material + FX factors',
  reactor.basis.factors.some(f => /CEPCI/.test(f.name)) &&
  reactor.basis.factors.some(f => f.name === 'material factor') &&
  reactor.basis.factors.some(f => /USD/.test(f.name)))
ok('reactor inputs record the sized capacity (gallons) + agitator hp',
  reactor.basis.inputs.some(i => i.unit === 'US_gal') && reactor.basis.inputs.some(i => i.unit === 'hp'))
ok('316SS vessel material factor = 2.90 (Table 7)', MATERIAL_FACTORS.ss316_vessel === 2.90)
ok('escalation 1998→2024 ≈ 2.054', Math.abs(ESCALATION - 2.054) < 0.01)
ok('every capacity_factored basis carries a correlation source + estimate_class',
  [absorber, stripper, reactor, crossHx, blower].every(r =>
    r.basis.method === 'capacity_factored' && !!r.basis.correlation && r.basis.estimate_class >= 4))

// ── Material take-off (the new, founder-requested path for fabricated vessels) ──
console.log('\nmaterial take-off — fabricated vessels priced from shell mass\n')

ok('316L material rate = £6/kg', MATERIAL_RATE_GBP_PER_KG.ss316l === 6)
ok('304 material rate = £5/kg', MATERIAL_RATE_GBP_PER_KG.ss304 === 5)
ok('column fabrication factor = 5.5', FABRICATION_FACTOR.column === 5.5)
ok('pressure-vessel fabrication factor = 4.5', FABRICATION_FACTOR.pressure_vessel === 4.5)
ok('atmospheric-tank fabrication factor = 3.0', FABRICATION_FACTOR.tank === 3.0)

const absT = costMaterialTakeoff({ label: 'Packed absorber column', massKg: 1292.306, material: 'ss316l', shape: 'column' })
near('absorber take-off ≈ £42,646 (1,292 kg × £6 × 5.5)', absT.gbp, 42646, 2)
ok('absorber method = material_takeoff, class 4, moderate, no RFQ',
  absT.basis.method === 'material_takeoff' && absT.basis.estimate_class === 4 && absT.basis.confidence === 'moderate' && !absT.basis.rfq_recommended)
ok('absorber working string shows material + fabrication + ±30%',
  /1,292 kg 316L × £6\/kg/.test(absT.basis.working ?? '') && /material/.test(absT.basis.working ?? '') && /fabrication \(×5\.5\)/.test(absT.basis.working ?? '') && /±30%/.test(absT.basis.working ?? ''),
  absT.basis.working)

const stripT = costMaterialTakeoff({ label: 'Stripper column', massKg: 955.796, material: 'ss316l', shape: 'column' })
near('stripper take-off ≈ £31,541 (956 kg × £6 × 5.5)', stripT.gbp, 31541, 2)

const reactT = costMaterialTakeoff({ label: 'Gypsum carbonation reactor', massKg: 771.97, material: 'ss316l', shape: 'pressure_vessel' })
near('primary reactor take-off ≈ £20,843 (772 kg × £6 × 4.5, bare shell)', reactT.gbp, 20843, 2)
ok('primary reactor working has NO agitator term (separate BoM line)', !/agitator/.test(reactT.basis.working ?? ''))

const limeT = costMaterialTakeoff({ label: 'Lime reactor', massKg: 420, material: 'ss304', shape: 'pressure_vessel', agitatorGbp: 5000, agitatorKw: 2 })
near('lime reactor take-off ≈ £14,450 (420 kg × £5 × 4.5 + £5k agitator)', limeT.gbp, 14450, 1)
ok('lime reactor working folds in the £5,000 / 2 kW agitator', /£5,000 agitator \(2 kW\)/.test(limeT.basis.working ?? ''), limeT.basis.working)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
