/**
 * bom-make-vs-buy.test.tsx — verifies the per-line make-vs-buy classifier against hand-judged
 * expectations, then runs it over the WHOLE real 73-line e-fuel BoM and sanity-checks the split.
 *
 * Run: npx tsx "scripts/lib/cost/bom-make-vs-buy.test.tsx"   (network-free, deterministic)
 *
 * Mirrors the real e-fuel BoM (out/oxccu-saf-v21/state.json):
 *   – a real-MPN catalogue line (Grundfos CRNE 10-4, Rosemount 3051CD)        → bought
 *   – a fabricated vessel/column/tank ("made-to-order fabrication" + bespoke)  → fabricated
 *   – a named-OEM engineered package/skid (Burckhardt API 618, Parker dryer)   → custom-made
 *   – a generic bracket / unattributed structural item                         → fabricated
 *   – a catalyst/adsorbent charge                                              → bought (material)
 */
import {
  classifyMakeVsBuy,
  makeVsBuySummary,
  type BomLine,
  type MakeVsBuyContext,
} from './bom-make-vs-buy'
import * as fs from 'node:fs'
import * as path from 'node:path'

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
function cat(name: string, line: BomLine, want: string, ctx?: MakeVsBuyContext) {
  const r = classifyMakeVsBuy(line, ctx)
  ok(`${name} → ${want}`, r.category === want, `got ${r.category} (${r.confidence}): ${r.rationale}`)
  return r
}

// Build a BoM "word" from a name + a partial modifier map.
function word(
  name_human: string,
  mods: Record<string, { value: string; unit?: string }>,
  extra: Partial<BomLine> = {},
): BomLine {
  return {
    name_human,
    modifier_characters: Object.entries(mods).map(([kind, m]) => ({ kind, value: m.value, unit: m.unit })),
    ...extra,
  }
}

console.log('bom-make-vs-buy — per-line make/buy classification\n')

// ─────────────────────────────────────────────────────────────────────────────
// 1) BOUGHT — real manufacturer + real compact catalogue MPN
// ─────────────────────────────────────────────────────────────────────────────
console.log('bought — real OEM + real catalogue MPN\n')

const pump = word('process-water transfer pump', {
  form: { value: 'centrifugal process-water transfer pump, 1 duty + 1 standby' },
  capacity: { value: '10', unit: 'm3/h' },
  manufacturer: { value: 'Grundfos' },
  part_number: { value: 'CRNE 10-4' },
  list_price_gbp: { value: '4200' },
})
const pumpR = cat('Grundfos CRNE 10-4 pump', pump, 'bought')
ok('bought pump confidence high', pumpR.confidence === 'high', pumpR.confidence)
ok('bought pump rationale names the MPN', /CRNE 10-4/.test(pumpR.rationale), pumpR.rationale)

const txr = word('pressure transmitters', {
  form: { value: 'coplanar gauge/differential, 4–20 mA HART, 316L wetted' },
  manufacturer: { value: 'Emerson' },
  part_number: { value: 'Rosemount 3051CD' },
})
cat('Emerson Rosemount 3051CD', txr, 'bought')

const ioCard = word('digital I/O cards', {
  form: { value: 'DI 16×24 V DC + DQ 16×24 V DC modules' },
  manufacturer: { value: 'Siemens' },
  part_number: { value: '6ES7131-6BH01-0BA0' },
})
cat('Siemens 6ES7131-6BH01-0BA0 I/O card', ioCard, 'bought')

const barrier = word('SIL-rated isolation barriers', {
  form: { value: 'SIL-2 isolated signal barriers on the safety I/O' },
  manufacturer: { value: 'Pepperl+Fuchs' },
  part_number: { value: 'KFD2-STC4-Ex1' },
})
cat('Pepperl+Fuchs KFD2-STC4-Ex1', barrier, 'bought')

const relief = word('reactor pressure-relief valve', {
  form: { value: 'spring-loaded PRV sized to PED on the synthesis loop' },
  manufacturer: { value: 'LESER' },
  part_number: { value: 'Type 441' },
})
cat('LESER Type 441 PRV', relief, 'bought')

// pure-digit catalogue MPN (Spelsberg junction box) is a real MPN.
const jbox = word('field junction boxes', {
  form: { value: 'GRP/polycarbonate IP65 field junction box, M20 gland entries' },
  manufacturer: { value: 'Spelsberg' },
  part_number: { value: '81040001' },
})
cat('Spelsberg 81040001 junction box', jbox, 'bought')

// A verification distributor_price_gbp must NOT be treated as a buyability/catalogue confirmation
// (on the real dossier it is an LLM-authored list price, not a live distributor quote). It must
// neither reclassify a line nor appear as a "confirmed price" claim. Buyability = real MPN + maker.
const txrVer: MakeVsBuyContext = {
  verifications: { tx1: { manufacturer: 'Emerson', part_number: 'Rosemount 3051CD', distributor_price_gbp: 1180 } },
}
const txr2 = word('pressure transmitter', { manufacturer: { value: 'Emerson' }, part_number: { value: 'Rosemount 3051CD' } }, { id: 'tx1' })
const txr2R = cat('verified-record transmitter still bought via MPN', txr2, 'bought', txrVer)
ok('verification price NOT claimed as a live-price confirmation in rationale', !/live distributor price|confirmed.*price/i.test(txr2R.rationale), txr2R.rationale)

// A bespoke engineered package that happens to carry a verification price must STILL be custom-made
// (the price must not promote it to bought) — the exact real-data trap (compressors/dryers had prices).
const pkgVer: MakeVsBuyContext = {
  verifications: { pk1: { manufacturer: 'Burckhardt Compression', part_number: 'API 618 … engineered package', distributor_price_gbp: 650000 } },
}
const pkgLine = word('CO2 feed compressor', {
  form: { value: 'multistage process gas compressor, 3-stage, intercooled, VSD-driven' },
  manufacturer: { value: 'Burckhardt Compression' },
  part_number: { value: 'API 618 multistage reciprocating process compressor — engineered package' },
}, { id: 'pk1' })
cat('priced engineered package stays custom-made (price must not promote to bought)', pkgLine, 'custom-made', pkgVer)

// ─────────────────────────────────────────────────────────────────────────────
// 2) FABRICATED — vessel/column/tank to drawing, no real MPN, generic maker
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nfabricated — shop-fabricated vessel/column/tank to drawing\n')

const ftReactor = word('Fischer-Tropsch synthesis reactor', {
  form: { value: 'cooled multitubular fixed-bed Fischer-Tropsch reactor, 316L, 25 bar' },
  manufacturer: { value: 'made-to-order fabrication' },
  part_number: { value: 'fabricated boiling-water-cooled multitubular Fischer-Tropsch reactor — bespoke vessel' },
  list_price_gbp: { value: '1500000' },
})
const ftR = cat('FT reactor (made-to-order)', ftReactor, 'fabricated')
ok('FT reactor confidence high', ftR.confidence === 'high', ftR.confidence)
ok('FT reactor rationale names the family + fabrication schedule', /reactor/.test(ftR.rationale) && /fabrication schedule/.test(ftR.rationale), ftR.rationale)

const column = word('product fractionation column', {
  form: { value: 'packed/trayed fractionation column splitting the syncrude into SAF + naphtha, 316L' },
  manufacturer: { value: 'made-to-order fabrication' },
  part_number: { value: 'fabricated 316L fractionation column shell — bespoke vessel' },
})
cat('fractionation column (made-to-order)', column, 'fabricated')

const tank = word('SAF storage tank', {
  form: { value: 'API 650 atmospheric welded steel storage tank, carbon steel' },
  manufacturer: { value: 'made-to-order fabrication' },
  part_number: { value: 'API 650 welded steel atmospheric storage tank — bespoke' },
})
cat('API 650 storage tank (made-to-order)', tank, 'fabricated')

const separator = word('hot 3-phase separator', {
  form: { value: 'horizontal hot high-pressure 3-phase separator' },
  manufacturer: { value: 'made-to-order fabrication' },
  part_number: { value: 'fabricated horizontal 3-phase separator — bespoke vessel' },
})
cat('3-phase separator (made-to-order)', separator, 'fabricated')

const koDrum = word('recycle knock-out drum', {
  form: { value: 'compressor-suction knock-out drum protecting the recycle compressor' },
  manufacturer: { value: 'made-to-order fabrication' },
  part_number: { value: 'fabricated compressor-suction knock-out drum — bespoke vessel' },
})
cat('knock-out drum (made-to-order)', koDrum, 'fabricated')

const buffer = word('H2 buffer storage vessel', {
  form: { value: 'horizontal H2 buffer receiver smoothing the supply' },
  manufacturer: { value: 'made-to-order fabrication' },
  part_number: { value: 'fabricated hydrogen-service buffer receiver vessel — bespoke vessel' },
})
cat('H2 buffer vessel (made-to-order)', buffer, 'fabricated')

// a generic structural bracket / steel item with NO maker → fabricated (safest default).
const bracket = word('pump support bracket', {
  form: { value: 'welded carbon-steel support bracket and baseframe' },
  manufacturer: { value: '' },
  part_number: { value: 'fabricated structural steel bracket' },
})
const bracketR = cat('generic welded bracket (no maker)', bracket, 'fabricated')
ok('bracket rationale flags structural steel / fab shop', /structural steel|fab shop|fabricated/.test(bracketR.rationale), bracketR.rationale)

// ─────────────────────────────────────────────────────────────────────────────
// 3) CUSTOM-MADE — named OEM + bespoke engineered package / skid / configured
// ─────────────────────────────────────────────────────────────────────────────
console.log('\ncustom-made — named OEM engineered-to-order package/skid\n')

const co2Comp = word('CO2 feed compressor', {
  form: { value: 'multistage process gas compressor, 3-stage, intercooled, VSD-driven' },
  capacity: { value: '1000', unit: 'kg/h' },
  manufacturer: { value: 'Burckhardt Compression' },
  part_number: { value: 'API 618 multistage reciprocating process compressor — engineered package' },
  list_price_gbp: { value: '650000' },
})
const co2R = cat('Burckhardt API 618 compressor', co2Comp, 'custom-made')
ok('compressor rationale names the specialist + RFQ framing', /Burckhardt/.test(co2R.rationale) && /(RFQ|engineered)/.test(co2R.rationale), co2R.rationale)

const dryer = word('CO2 feed dryer', {
  form: { value: 'twin-tower regenerative molecular-sieve gas dryer, duty/standby' },
  manufacturer: { value: 'Parker Hiross' },
  part_number: { value: 'twin-tower regenerative molecular-sieve gas dryer — packaged skid' },
})
cat('Parker Hiross packaged-skid dryer', dryer, 'custom-made')

const oxidiser = word('enclosed thermal oxidiser', {
  form: { value: 'enclosed thermal oxidiser/flare for the tail-gas purge' },
  manufacturer: { value: 'Zeeco' },
  part_number: { value: 'enclosed ground thermal oxidiser — engineered package' },
})
cat('Zeeco engineered thermal oxidiser', oxidiser, 'custom-made')

const hx = word('effluent product cooler', {
  form: { value: 'shell-and-tube effluent cooler condensing syncrude' },
  capacity: { value: '782', unit: 'kW' },
  manufacturer: { value: 'Alfa Laval' },
  part_number: { value: 'shell-and-tube process cooler — engineered' },
})
cat('Alfa Laval engineered heat exchanger', hx, 'custom-made')

const n2skid = word('nitrogen inerting skid', {
  form: { value: 'PSA/membrane N2 generation + blanketing skid for vessels' },
  manufacturer: { value: 'Atlas Copco' },
  part_number: { value: 'membrane nitrogen generation + inerting skid — packaged' },
})
cat('Atlas Copco packaged N2 skid', n2skid, 'custom-made')

const mcc = word('motor control centre', {
  form: { value: 'Form-4 withdrawable MCC, 3-MVA rated incoming, fully compartmentalised — configured' },
  manufacturer: { value: 'ABB' },
  part_number: { value: 'MNS Form-4 motor control centre — configured' },
})
cat('ABB configured MCC (custom control panel)', mcc, 'custom-made')

// ─────────────────────────────────────────────────────────────────────────────
// 4) CONSUMABLE / MEDIA charges → bought (material), never fabricated
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nconsumable / process-media charges — a material buy, never fabricated\n')

const ftCat = word('shaped iron FT catalyst charge', {
  form: { value: 'shaped/structured iron-based FT catalyst charge engineered for the reactor' },
  manufacturer: { value: 'proprietary catalyst supplier' },
  part_number: { value: 'shaped iron Fischer-Tropsch catalyst charge — proprietary' },
})
const ftCatR = cat('FT catalyst charge (proprietary)', ftCat, 'bought')
ok('catalyst charge rationale = material buy not machine', /material buy|consumable|catalyst/.test(ftCatR.rationale), ftCatR.rationale)
ok('catalyst charge NOT fabricated', ftCatR.category !== 'fabricated', ftCatR.category)

const guardCharge = word('guard-bed adsorbent + deoxo charge', {
  form: { value: 'ZnO sulphur-polishing + precious-metal deoxo catalyst charge' },
  manufacturer: { value: 'Johnson Matthey' },
  part_number: { value: 'PURASPEC sulphur + oxygen polishing catalyst charge' },
})
const gcR = cat('Johnson Matthey adsorbent charge', guardCharge, 'bought')
ok('named-maker charge confidence medium', gcR.confidence === 'medium', gcR.confidence)

// internals (structured packing/trays) from a named maker → custom-made engineered component.
const internals = word('fractionation column internals', {
  form: { value: 'structured packing + liquid distributors / valve trays for the column — engineered' },
  manufacturer: { value: 'Koch-Glitsch' },
  part_number: { value: 'INTALOX structured packing + trays — engineered' },
})
const intR = cat('Koch-Glitsch column internals', internals, 'custom-made')
ok('internals NOT counted as fabricating the column', intR.category !== 'fabricated', intR.category)

// ─────────────────────────────────────────────────────────────────────────────
// 5) GUARDS — a vessel-mentioning auxiliary must not be classed as the vessel
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nguards — auxiliaries that merely mention a vessel\n')

const thermowell = word('reactor thermowell + temperature profile', {
  form: { value: 'multipoint Pt100 axial temperature-profile thermowell assembly' },
  manufacturer: { value: 'Endress+Hauser' },
  part_number: { value: 'iTHERM TM411' },
})
// has a real MPN → bought (it is a catalogue instrument), NOT fabricated as "a reactor".
cat('reactor thermowell (real MPN)', thermowell, 'bought')

// OVER-MATCH GUARD: a valve set whose FORM says it sits "on the SAF tank" must NOT be read as a
// tank (the form sentence describes WHERE it is, not WHAT it is). Identity has no structural noun →
// Protego named supply → custom-made, NOT fabricated. (This was a real-data over-match bug.)
const n2valves = word('storage N2 blanketing valves', {
  form: { value: 'inert-gas blanketing regulator + breather valve set on the SAF tank' },
  manufacturer: { value: 'Protego' },
  part_number: { value: 'DK/ES blanketing valve' },
})
const n2R = classifyMakeVsBuy(n2valves)
ok('blanketing valves on a tank NOT mis-read as a fabricated tank', n2R.category !== 'fabricated', `${n2R.category}: ${n2R.rationale}`)

// ─────────────────────────────────────────────────────────────────────────────
// 6) AMBIGUOUS — honest low-confidence default
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nambiguous — honest low-confidence default\n')

const vague = word('process gas analysers', {
  form: { value: 'extractive multi-component NDIR analyser' },
  manufacturer: { value: 'ABB' },
  part_number: { value: 'analyser system' }, // descriptive, not a real MPN, no fab/structural tell
})
const vagueR = classifyMakeVsBuy(vague)
ok('ambiguous named-maker analyser → custom-made (RFQ), low confidence', vagueR.category === 'custom-made' && vagueR.confidence === 'low', `${vagueR.category}/${vagueR.confidence}: ${vagueR.rationale}`)

const vagueNoMaker = word('mystery process item', {
  form: { value: 'process item' },
  manufacturer: { value: 'TBD' },
  part_number: { value: 'TBD' },
})
const vnmR = classifyMakeVsBuy(vagueNoMaker)
ok('ambiguous no-maker no-MPN → fabricated (safest), low confidence', vnmR.category === 'fabricated' && vnmR.confidence === 'low', `${vnmR.category}/${vnmR.confidence}`)

// empty line never throws.
ok('empty line does not throw', (() => { try { classifyMakeVsBuy({}); return true } catch { return false } })())

// ─────────────────────────────────────────────────────────────────────────────
// 7) SUMMARY shape
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nsummary shape\n')
const tiny = makeVsBuySummary([pump, ftReactor, co2Comp, ftCat])
ok('summary counts add up', tiny.bought + tiny.fabricated + tiny.custom_made === tiny.total && tiny.total === 4, JSON.stringify(tiny))
ok('summary buckets each category', tiny.bought === 2 && tiny.fabricated === 1 && tiny.custom_made === 1, `b=${tiny.bought} f=${tiny.fabricated} c=${tiny.custom_made}`)
ok('summary notes mention the split', /bought off-the-shelf/.test(tiny.notes) && /fabrication schedule/.test(tiny.notes), tiny.notes)
ok('summary by_category carries line names', tiny.by_category.fabricated[0]?.name === 'Fischer-Tropsch synthesis reactor', JSON.stringify(tiny.by_category.fabricated))
ok('empty summary is safe', (() => { const e = makeVsBuySummary([]); return e.total === 0 && /No BoM lines/.test(e.notes) })())

// ─────────────────────────────────────────────────────────────────────────────
// 8) THE REAL 73-LINE E-FUEL BoM — run end-to-end + sanity-check the split
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nREAL e-fuel BoM (out/oxccu-saf-v21/state.json) — full-run sanity\n')

const statePath = path.resolve('out/oxccu-saf-v21/state.json')
if (!fs.existsSync(statePath)) {
  console.log('  (skipped — state.json not present in this checkout)')
} else {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  const md = state.moduleDecomposition
  const realLines: BomLine[] = []
  for (const m of md.modules ?? []) {
    for (const sm of m.sub_modules ?? []) {
      for (const w of sm.words ?? []) realLines.push(w)
    }
  }
  // Build the verification context the main thread would pass (partVerifications keyed by word_id).
  const verifications: Record<string, { manufacturer?: string; part_number?: string; distributor_price_gbp?: number | null }> = {}
  for (const v of state.partVerifications ?? []) {
    if (v.word_id) verifications[v.word_id] = { manufacturer: v.manufacturer, part_number: v.part_number, distributor_price_gbp: v.distributor_price_gbp }
  }
  const ctx: MakeVsBuyContext = { verifications }

  ok('real BoM has 73 lines', realLines.length === 73, `got ${realLines.length}`)

  const summary = makeVsBuySummary(realLines, ctx)
  console.log(`\n  SPLIT: bought=${summary.bought}  fabricated=${summary.fabricated}  custom-made=${summary.custom_made}  (total=${summary.total}, low-conf=${summary.low_confidence})`)
  console.log(`  NOTES: ${summary.notes}\n`)

  // Every line classified, counts reconcile.
  ok('every real line classified (counts reconcile)', summary.bought + summary.fabricated + summary.custom_made === 73)

  // Sanity bounds: a real process plant is a MIX. None of the three buckets should be empty or
  // swallow everything — that would mean a signal collapsed.
  ok('bought bucket is non-trivial (instruments/valves/pumps exist)', summary.bought >= 10, `bought=${summary.bought}`)
  ok('fabricated bucket is non-trivial (vessels/columns/tanks exist)', summary.fabricated >= 6, `fabricated=${summary.fabricated}`)
  ok('custom-made bucket is non-trivial (engineered packages exist)', summary.custom_made >= 5, `custom-made=${summary.custom_made}`)
  ok('no single bucket swallows the whole BoM', summary.bought < 73 && summary.fabricated < 73 && summary.custom_made < 73)

  // Spot-check the canonical examples land in the right bucket on the REAL data.
  const byName = (n: string) => realLines.find((w) => (w.name_human ?? '').toLowerCase() === n.toLowerCase())
  const check = (n: string, want: string) => {
    const w = byName(n)
    if (!w) { ok(`real "${n}" present`, false); return }
    const r = classifyMakeVsBuy(w, ctx)
    ok(`real "${n}" → ${want}`, r.category === want, `got ${r.category} (${r.confidence}): ${r.rationale}`)
  }
  check('process-water transfer pump', 'bought')        // Grundfos CRNE 10-4
  check('pressure transmitters', 'bought')              // Rosemount 3051CD
  check('Fischer-Tropsch synthesis reactor', 'fabricated')
  check('product fractionation column', 'fabricated')
  check('SAF storage tank', 'fabricated')
  check('CO2 feed compressor', 'custom-made')           // Burckhardt API 618 engineered package
  check('CO2 feed dryer', 'custom-made')                // Parker Hiross packaged skid
  check('enclosed thermal oxidiser', 'custom-made')     // Zeeco engineered package
  check('shaped iron FT catalyst charge', 'bought')     // material charge

  // Print the full per-line classification table for the manufacturing reviewer.
  console.log('\n  FULL CLASSIFICATION (real e-fuel BoM):')
  for (const w of realLines) {
    const r = classifyMakeVsBuy(w, ctx)
    const tag = r.category.toUpperCase().padEnd(11)
    const cf = r.confidence.padEnd(6)
    console.log(`    [${tag}] (${cf}) ${w.name_human}`)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)

// Dual-mode: self-running under `npx tsx` (the documented run mode, matching the sibling cost
// tests), AND a real assertion under jest if the file is ever picked up by the jest runner.
declare const test: undefined | ((name: string, fn: () => void) => void)
declare const expect: undefined | ((v: unknown) => { toBe: (x: unknown) => void })
if (typeof test === 'function' && typeof expect === 'function') {
  test('bom-make-vs-buy: all classification assertions pass', () => {
    expect(fail).toBe(0)
  })
} else if (fail > 0) {
  process.exit(1)
}
