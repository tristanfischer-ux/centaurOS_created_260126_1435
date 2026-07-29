/**
 * bom-cost-grounding.test.tsx — verifies per-line price grounding against hand-checked build-ups.
 * Run: npx tsx "scripts/lib/cost/bom-cost-grounding.test.tsx"   (network-free, deterministic)
 *
 * Mirrors the real e-fuel BoM (out/oxccu-saf-v21): a fabricated reactor/column → a sane DOE/NETL
 * installed £ with the build-up shown; a real-MPN catalogue line → the cache path (injected stub);
 * a descriptive/ungrounded line → null / no-ground.
 */
import {
  groundBomLineCost,
  type BomLine,
  type GroundingContext,
  type CacheLookup,
} from './bom-cost-grounding'

let pass = 0,
  fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}
function near(name: string, got: number | null, want: number, tolPct = 2) {
  if (got == null) {
    fail++
    console.error(`  ✗ ${name} — got null, want ≈£${want.toLocaleString('en-GB')}`)
    return
  }
  const within = Math.abs(got - want) / want <= tolPct / 100
  ok(name, within, `got £${Math.round(got).toLocaleString('en-GB')}, want ≈£${want.toLocaleString('en-GB')} (±${tolPct}%)`)
}

// Helper to build a BoM "word" from a name + a partial modifier map.
function word(name_human: string, mods: Record<string, { value: string; unit?: string }>, extra: Partial<BomLine> = {}): BomLine {
  return {
    name_human,
    modifier_characters: Object.entries(mods).map(([kind, m]) => ({ kind, value: m.value, unit: m.unit })),
    ...extra,
  }
}

// The real e-fuel engineering-contract quantities the process tools registered (subset).
const efuelQuantities = {
  ft_reactor_shell_mass_kg: { value: 2386.72, unit: 'kg' },
  fractionation_column_shell_mass_kg: { value: 2341.352, unit: 'kg' },
  product_tank_shell_mass_kg: { value: 6269.2, unit: 'kg' },
  steam_generator_area_m2: { value: 15.448, unit: 'm2' },
  total_system_mass_kg: { value: 19000, unit: 'kg' }, // must NEVER be used for a single line
}

console.log('bom-cost-grounding — per-line price grounding vs hand-checked build-ups\n')

// ─────────────────────────────────────────────────────────────────────────────
// 1) FABRICATED PROCESS EQUIPMENT → DOE/NETL Class-4 installed
// ─────────────────────────────────────────────────────────────────────────────
console.log('fabricated process equipment → DOE/NETL Class-4 installed\n')

// ── FT synthesis reactor: real contract shell mass 2386.72 kg, 316L, pressure_vessel ──
// HAND CHECK (skid ×3.0):
//   purchased = 2386.72 kg × £6/kg × 4.5 fab = £64,441
//   installed = £64,441 × 3.0 = £193,324
const ftReactor = word(
  'Fischer-Tropsch synthesis reactor',
  {
    form: { value: 'cooled multitubular fixed-bed Fischer-Tropsch synthesis reactor, 316L, 25 bar' },
    manufacturer: { value: 'made-to-order fabrication' },
    part_number: { value: 'engineered fabricated reactor package' },
    list_price_gbp: { value: '1500000' },
  },
  { content_character: { material_radical_primary: 'stainless_steel' } },
)
const ftSkid = groundBomLineCost(ftReactor, { quantities: efuelQuantities, installMode: 'skid' })
ok('FT reactor → doe-netl-class4 provenance', ftSkid.provenance === 'doe-netl-class4', ftSkid.provenance)
near('FT reactor installed ≈ £193,324 (2387 kg × £6 × 4.5 × 3.0 skid)', ftSkid.price_gbp, 193324)
ok('FT reactor is a SANE process-equipment price (£100k–£5M installed, not £15)',
  (ftSkid.price_gbp ?? 0) >= 100000 && (ftSkid.price_gbp ?? 0) <= 5000000, `got £${ftSkid.price_gbp}`)
ok('FT reactor basis shows the build-up + install factor',
  /4\.5/.test(ftSkid.basis) && /skid-modular ×3/.test(ftSkid.basis) && /installed/.test(ftSkid.basis), ftSkid.basis)
ok('FT reactor confidence medium (in-range take-off, no extrapolation)', ftSkid.confidence === 'medium', ftSkid.confidence)
ok('FT reactor carries a CostBasis trail (material_takeoff)', ftSkid.cost_basis?.method === 'material_takeoff')

// install-factor mode is honoured (the single biggest sensitivity): stick-built 4.74 vs skid 3.0
const ftStick = groundBomLineCost(ftReactor, { quantities: efuelQuantities, installMode: 'stick-built' })
near('FT reactor stick-built ≈ £305,450 (× 4.74 Lang)', ftStick.price_gbp, 305450)
const ftPurch = groundBomLineCost(ftReactor, { quantities: efuelQuantities, installMode: 'purchased' })
near('FT reactor purchased (no install) ≈ £64,441', ftPurch.price_gbp, 64441)
ok('purchased mode flagged installed=false', ftPurch.installed === false)

// ── Product fractionation column: contract shell mass 2341.352 kg, 316L, column (fab ×5.5) ──
// HAND CHECK (skid ×3.0): 2341.352 × 6 × 5.5 = £77,265 purchased; × 3.0 = £231,794 installed
const column = word(
  'product fractionation column',
  {
    form: { value: 'packed/trayed fractionation column splitting the syncrude into SAF + naphtha, 316L' },
    manufacturer: { value: 'made-to-order fabrication' },
    part_number: { value: 'fabricated distillation column' },
    list_price_gbp: { value: '700000' },
  },
  { content_character: { material_radical_primary: 'stainless_steel' } },
)
const colSkid = groundBomLineCost(column, { quantities: efuelQuantities, installMode: 'skid' })
ok('fractionation column → doe-netl-class4', colSkid.provenance === 'doe-netl-class4')
near('column installed ≈ £231,794 (2341 kg × £6 × 5.5 column-fab × 3.0)', colSkid.price_gbp, 231794)
ok('column used the column fabrication factor 5.5 (not pressure-vessel 4.5)',
  /×5\.5/.test(colSkid.cost_basis?.working ?? ''), colSkid.cost_basis?.working)

// ── Heat exchanger sized from its kW duty (no contract area key for this one) ──
// effluent product cooler, 782 kW → A = 782000/7500 = 104.3 m² = 1122.5 ft² → DOE shell-&-tube curve
const cooler = word('effluent product cooler', {
  form: { value: 'shell-and-tube effluent cooler condensing syncrude' },
  capacity: { value: '782', unit: 'kW' },
  manufacturer: { value: 'Alfa Laval' },
  part_number: { value: 'shell-and-tube exchanger package' },
  list_price_gbp: { value: '180000' },
})
const coolerG = groundBomLineCost(cooler, { quantities: {}, installMode: 'skid' })
ok('effluent cooler → doe-netl-class4 (sized from kW duty)', coolerG.provenance === 'doe-netl-class4', `${coolerG.provenance} / ${coolerG.basis}`)
ok('effluent cooler installed is a sane HX price (£50k–£1M)',
  (coolerG.price_gbp ?? 0) >= 50000 && (coolerG.price_gbp ?? 0) <= 1000000, `got £${coolerG.price_gbp}`)
ok('effluent cooler basis cites shell-&-tube + ft²', /shell-&-tube/.test(coolerG.basis) && /ft²/.test(coolerG.basis), coolerG.basis)

// ── API 650 storage tank → carbon steel (atmospheric), tank fabrication factor 3.0 ──
// product_tank_shell_mass_kg = 6269.2 kg × £1.2/kg CS × 3.0 fab = £22,569 purchased; × 3.0 = £67,707
const tank = word('SAF storage tank', {
  form: { value: 'API 650 atmospheric welded steel storage tank, carbon steel' },
  manufacturer: { value: 'made-to-order fabrication' },
  part_number: { value: 'fabricated API 650 tank' },
  list_price_gbp: { value: '110000' },
})
const tankG = groundBomLineCost(tank, { quantities: efuelQuantities, installMode: 'skid' })
ok('storage tank → doe-netl-class4', tankG.provenance === 'doe-netl-class4')
ok('storage tank used carbon steel (£1.2/kg) + tank fab 3.0', /carbon steel × £1\.2\/kg/.test(tankG.cost_basis?.working ?? '') && /×3/.test(tankG.cost_basis?.working ?? ''), tankG.cost_basis?.working)
near('storage tank installed ≈ £67,707 (6269 kg × £1.2 × 3.0 × 3.0)', tankG.price_gbp, 67707)

// ── AUXILIARY GUARD: a static mixer / circulation heater / control valve must NOT cost as a vessel ──
const mixer = word('feed-gas blending static mixer', {
  form: { value: 'in-line static mixer blending make-up CO2 + H2 with the recycle' },
  manufacturer: { value: 'Sulzer' },
  part_number: { value: 'SMV static mixer element' },
  list_price_gbp: { value: '4200' },
})
const mixerG = groundBomLineCost(mixer, { quantities: efuelQuantities, installMode: 'skid' })
ok('static mixer NOT costed as a fabricated vessel (guarded)', mixerG.provenance !== 'doe-netl-class4', mixerG.provenance)

const heater = word('catalyst reduction/activation heater', {
  form: { value: 'electric startup heater reducing/activating the iron catalyst' },
  capacity: { value: '120', unit: 'kW' },
  manufacturer: { value: 'Watlow' },
  part_number: { value: 'fabricated electric heater' },
})
const heaterG = groundBomLineCost(heater, { quantities: efuelQuantities, installMode: 'skid' })
ok('activation heater NOT costed as a reactor (guarded)', heaterG.provenance !== 'doe-netl-class4', heaterG.provenance)

const prv = word('reactor pressure-relief valve', {
  form: { value: 'spring-loaded PRV sized to PED on the synthesis loop' },
  manufacturer: { value: 'LESER' },
  part_number: { value: 'Type 441 PRV' },
})
const prvG = groundBomLineCost(prv, { quantities: efuelQuantities })
ok('PRV NOT costed as a vessel (guarded)', prvG.provenance !== 'doe-netl-class4', prvG.provenance)

// ── A registered shell mass must never be the whole-plant total ──
ok('reactor mass came from ft_reactor_shell_mass_kg, NOT total_system_mass_kg (19,000 kg)',
  /2,387 kg/.test(ftSkid.cost_basis?.working ?? '') || /2,386/.test(ftSkid.cost_basis?.working ?? ''),
  ftSkid.cost_basis?.working)

// ─────────────────────────────────────────────────────────────────────────────
// 2) CATALOGUE PART with a real MPN → distributor cache (INJECTED stub, pure)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\ncatalogue part with a real MPN → distributor cache (injected stub)\n')

// A stub standing in for db-only-cascade::lookupCached. The real path uses lookupCached; here we
// inject so the module stays pure + the test never touches better-sqlite3 / the filesystem.
const stubCache: CacheLookup = (manufacturer, mpn) => {
  if (/PMC-?1000/i.test(mpn)) {
    return {
      found: true,
      source: 'cache_hit',
      result: { priceGBP: [{ qty: 1, unitPriceGbp: 412.5 }, { qty: 10, unitPriceGbp: 380.0 }] },
    }
  }
  // confirmed real but no price (library-only)
  if (/LIB-ONLY/i.test(mpn)) return { found: true, source: 'library_only', result: { priceGBP: [] } }
  // everything else → unknown (no row)
  return { found: false, source: 'unknown', result: null }
}

const catalogueLine = word('pressure transmitter', {
  form: { value: 'coplanar gauge transmitter, 4–20 mA HART, 316L wetted' },
  manufacturer: { value: 'Emerson Rosemount' },
  part_number: { value: 'PMC-1000A' }, // a real-looking MPN
  list_price_gbp: { value: '1200' },
})
const catG = groundBomLineCost(catalogueLine, { cacheLookup: stubCache })
ok('catalogue line → distributor-cache provenance', catG.provenance === 'distributor-cache', catG.provenance)
ok('catalogue price = cheapest cached break (£380, the qty-10 break)', catG.price_gbp === 380, `got £${catG.price_gbp}`)
ok('catalogue confidence high on a cache_hit', catG.confidence === 'high')
ok('catalogue basis names the cache source + MPN', /cache_hit/.test(catG.basis) && /PMC-1000A/.test(catG.basis), catG.basis)

// a real part with no cached price → honest no-ground (NOT a fabricated number)
const libOnly = word('flow transmitter', {
  manufacturer: { value: 'Endress+Hauser' },
  part_number: { value: 'LIB-ONLY-42' },
  list_price_gbp: { value: '3600' },
})
const libG = groundBomLineCost(libOnly, { cacheLookup: stubCache })
ok('library-only (real but unpriced) → no-ground (honest, no fabricated £)', libG.provenance === 'no-ground' && libG.price_gbp === null, `${libG.provenance} / £${libG.price_gbp}`)

// a descriptive "part number" (not a real MPN) must NOT trigger a cache lookup → no-ground
const descriptive = word('distributed control system', {
  form: { value: 'redundant DCS controller pair sequencing the plant' },
  manufacturer: { value: 'Siemens' },
  part_number: { value: 'engineered DCS package' }, // descriptive, not an MPN
  list_price_gbp: { value: '65000' },
})
let cacheCalls = 0
const countingCache: CacheLookup = (m, mpn) => {
  cacheCalls++
  return { found: false, source: 'unknown', result: null }
}
const descG = groundBomLineCost(descriptive, { cacheLookup: countingCache })
ok('descriptive part_number does NOT hit the cache (not an MPN)', cacheCalls === 0, `cache called ${cacheCalls}×`)
ok('descriptive non-fabricated line → no-ground', descG.provenance === 'no-ground' && descG.price_gbp === null)

// ─────────────────────────────────────────────────────────────────────────────
// 3) MACRO ASSEMBLY → macro-assembly provenance
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nmacro_assembly_prices match → macro-assembly\n')

const macroCtx: GroundingContext = {
  macroAssemblyPrices: [{ name: 'feed compression package', price_gbp: 1250000 }],
}
const macroLine = word('CO2 feed compression package', {
  form: { value: 'multistage CO2 feed compression package, 3-stage, intercooled' },
  manufacturer: { value: 'Burckhardt Compression' },
  part_number: { value: 'API 618 engineered package' },
  list_price_gbp: { value: '650000' },
})
const macroG = groundBomLineCost(macroLine, macroCtx)
ok('macro-assembly match → macro-assembly provenance', macroG.provenance === 'macro-assembly', macroG.provenance)
ok('macro-assembly price = the contract entry (£1,250,000)', macroG.price_gbp === 1250000, `got £${macroG.price_gbp}`)
ok('macro-assembly basis names the entry', /feed compression package/.test(macroG.basis))
// macro-assembly takes precedence over the fabricated path (an explicit contract price wins)
ok('macro-assembly precedence over DOE/NETL', macroG.provenance === 'macro-assembly')

// proveCatch (2026-07-29 SOL): contract schema word_name + total_gbp must ground
// traction principals (was silently missing → £25 Engine-B motor floor).
const tractionMacroCtx: GroundingContext = {
  macroAssemblyPrices: [{
    word_name: 'traction_ipmsm_motor_generator',
    unit_price_gbp: 18000,
    total_gbp: 18000,
  }],
}
const tractionLine = word(
  'Traction IPMSM Motor Generator · 350 kW',
  { form: { value: 'high-speed IPMSM' }, list_price_gbp: { value: '25' } },
  { word_id: 'traction_ipmsm_motor_generator' },
)
const tractionG = groundBomLineCost(tractionLine, tractionMacroCtx)
ok('contract word_name/total_gbp macro grounds traction motor',
  tractionG.provenance === 'macro-assembly' && tractionG.price_gbp === 18000,
  `${tractionG.provenance} £${tractionG.price_gbp}`)

// proveCatch: chain words often only have id=`…_word` + content_character.
const tractionWordSuffix = {
  id: 'traction_ipmsm_motor_generator_word',
  name_human: 'Traction Ipmsm Motor Generator',
  content_character: { character_id: 'traction_ipmsm_motor_generator' },
  modifier_characters: [],
} as any
const tractionSuffixG = groundBomLineCost(tractionWordSuffix, tractionMacroCtx)
ok('id=_word suffix still grounds via character_id / stripped id',
  tractionSuffixG.provenance === 'macro-assembly' && tractionSuffixG.price_gbp === 18000,
  `${tractionSuffixG.provenance} £${tractionSuffixG.price_gbp}`)

// proveCatch: structured sic_traction_inverter must NOT smear onto sibling inverter words.
const sicMacroCtx: GroundingContext = {
  macroAssemblyPrices: [{
    word_name: 'sic_traction_inverter',
    unit_price_gbp: 17500,
    total_gbp: 17500,
  }],
}
const desatLine = {
  id: 'inverter_desat_protection_word',
  name_human: 'Inverter Desat Protection',
  content_character: { character_id: 'inverter_desat_protection' },
  modifier_characters: [],
} as any
const housingLine = {
  id: 'traction_drive_housing_word',
  name_human: 'Traction Drive Housing',
  content_character: { character_id: 'traction_drive_housing' },
  modifier_characters: [],
} as any
const sicExact = groundBomLineCost({
  id: 'sic_traction_inverter_word',
  name_human: 'SiC Traction Inverter',
  content_character: { character_id: 'sic_traction_inverter' },
  modifier_characters: [],
} as any, sicMacroCtx)
ok('sic macro grounds exact inverter principal',
  sicExact.provenance === 'macro-assembly' && sicExact.price_gbp === 17500)
ok('sic macro does NOT smear onto desat protection',
  groundBomLineCost(desatLine, sicMacroCtx).provenance !== 'macro-assembly')
ok('sic/traction macro does NOT smear onto drive housing',
  groundBomLineCost(housingLine, sicMacroCtx).provenance !== 'macro-assembly')

// ─────────────────────────────────────────────────────────────────────────────
// 4) NO-DATA line → null / no-ground
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nno defensible basis → null / no-ground\n')

const noData = word('process gas analysers', {
  form: { value: 'extractive multi-component NDIR analyser' },
  manufacturer: { value: 'ABB' },
  part_number: { value: 'analyser system' }, // descriptive
  list_price_gbp: { value: '9500' },
})
const noDataG = groundBomLineCost(noData, {}) // no contract, no cache injected → real cache returns unknown in test env
ok('no-data line → no-ground', noDataG.provenance === 'no-ground' && noDataG.price_gbp === null, `${noDataG.provenance} / £${noDataG.price_gbp}`)
ok('no-ground basis is honest about the gap', /no defensible basis/.test(noDataG.basis), noDataG.basis)

// a fabricated line with NO registered mass and NO size → honest no-ground (not a guess)
const unsizedVessel = word('recycle knock-out drum', {
  form: { value: 'compressor-suction knock-out drum' },
  manufacturer: { value: 'made-to-order fabrication' },
  part_number: { value: 'fabricated KO drum' },
  list_price_gbp: { value: '45000' },
})
const unsizedG = groundBomLineCost(unsizedVessel, { quantities: {} })
ok('unsized KO drum (guarded knock-out) → no-ground (no fabricated number)', unsizedG.price_gbp === null && unsizedG.provenance === 'no-ground', `£${unsizedG.price_gbp}`)

// FIELD INSTRUMENT must not inherit a co-located vessel's material take-off (Tristan 2026-06-24):
// a "reactor pH probe" / "temperature sensor" / "density meter" sharing a sub-module with a reactor
// whose *_shell_mass_kg is registered must route OFF the fabricated path (the AUXILIARY_GUARD), NOT
// be priced as 772 kg of 316L — the £62,529 over-bill bug. Each must NOT get the vessel take-off.
for (const instr of ['reactor pH probe', 'reactor temperature sensor', 'reactor slurry density meter']) {
  const iw = word(instr, { form: { value: 'field instrument' }, manufacturer: { value: 'Endress+Hauser' }, part_number: { value: 'descriptive instrument' } })
  const ig = groundBomLineCost(iw, { quantities: { carbonation_reactor_shell_mass_kg: 772 } })
  ok(`field instrument "${instr}" does NOT inherit the co-located reactor's material take-off`,
     ig.provenance === 'no-ground' && !/316L|kg.*fabrication|kg ×/.test(ig.basis ?? ''), `${ig.provenance} / £${ig.price_gbp} / ${ig.basis ?? ''}`)
}

console.log(`\n${pass} passed, ${fail} failed`)

// Dual-mode: self-running under `npx tsx` (the documented run mode, matching the sibling cost
// tests), AND a real assertion under jest if the file is ever picked up by the jest runner.
declare const test: undefined | ((name: string, fn: () => void) => void)
declare const expect: undefined | ((v: unknown) => { toBe: (x: unknown) => void })
if (typeof test === 'function' && typeof expect === 'function') {
  test('bom-cost-grounding: all per-line grounding assertions pass', () => {
    expect(fail).toBe(0)
  })
} else if (fail > 0) {
  process.exit(1)
}
