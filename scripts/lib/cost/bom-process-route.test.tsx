/**
 * bom-process-route.test.tsx — verifies the process-route classifier (the Part-2 "how you
 * manufacture it" layer) on hand-built lines AND on the real e-fuel BoM (out/oxccu-saf-v21).
 * Run: npx tsx "scripts/lib/cost/bom-process-route.test.tsx"   (network-free, deterministic)
 *
 * The spec from the task:
 *   - an FT reactor / column → plate-fabrication with the weld / NDT / PWHT / hydrotest steps;
 *   - a flange / valve → machining;
 *   - an instrument with a real MPN → bought;
 *   - a control board → PCB-assembly.
 * Plus the whole-BoM process mix is printed + sanity-checked.
 */
import {
  processRoute,
  processRouteSummary,
  type BomLine,
  type PrimaryProcess,
} from './bom-process-route'
import * as fs from 'fs'
import * as path from 'path'

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
/** Assert at least one step matches each required regex (ordered ops present). */
function hasSteps(name: string, steps: string[], required: RegExp[]) {
  const joined = steps.join(' || ')
  const missing = required.filter((re) => !re.test(joined))
  ok(name, missing.length === 0, missing.length ? `missing steps: ${missing.map(String).join(', ')} — got [${steps.join(' | ')}]` : '')
}

/** Build a BoM "word" from a name + a partial modifier map (mirrors the grounding test helper). */
function word(name_human: string, mods: Record<string, { value: string; unit?: string }>, extra: Partial<BomLine> = {}): BomLine {
  return {
    name_human,
    modifier_characters: Object.entries(mods).map(([kind, m]) => ({ kind, value: m.value, unit: m.unit })),
    ...extra,
  }
}

console.log('bom-process-route — process route per made line + the BoM process mix\n')

// ─────────────────────────────────────────────────────────────────────────────
// 1) FABRICATED VESSEL / REACTOR → plate-fabrication (weld / NDT / PWHT / hydrotest)
// ─────────────────────────────────────────────────────────────────────────────
console.log('plate-fabrication — vessels / reactors / columns / heat exchangers\n')

const ftReactor = word(
  'Fischer-Tropsch synthesis reactor',
  {
    form: { value: 'cooled multitubular fixed-bed Fischer-Tropsch synthesis reactor, 316L, 25 bar' },
    manufacturer: { value: 'made-to-order fabrication' },
    part_number: { value: 'fabricated boiling-water-cooled multitubular reactor — engineered package' },
  },
  { content_character: { material_radical_primary: 'stainless_steel' } },
)
const r1 = processRoute(ftReactor)
ok('FT reactor → plate-fabrication', r1.primary_process === 'plate-fabrication', r1.primary_process)
ok('FT reactor material = 316L stainless steel', r1.material === '316L stainless steel', r1.material ?? 'null')
ok('FT reactor confidence high', r1.confidence === 'high', r1.confidence)
hasSteps('FT reactor steps include cut+roll / weld / NDT / PWHT / hydrotest', r1.steps, [
  /cut \+ roll plate/i,
  /weld shell \+ heads|weld shell|fit \+ weld shell/i,
  /weld nozzles|nozzles/i,
  /NDT/i,
  /post-weld heat treatment|PWHT/i,
  /hydrotest/i,
])
ok('FT reactor NOT bought (descriptive "engineered package" MPN is not a catalogue MPN)', r1.primary_process !== 'bought')

// Fractionation column → plate-fabrication, with internals
const column = word(
  'product fractionation column',
  {
    form: { value: 'packed/trayed fractionation column splitting the upgraded syncrude, 316L' },
    manufacturer: { value: 'made-to-order fabrication' },
    part_number: { value: 'fabricated 316L fractionation column shell — engineered' },
  },
  { content_character: { material_radical_primary: 'stainless_steel' } },
)
const r2 = processRoute(column)
ok('fractionation column → plate-fabrication', r2.primary_process === 'plate-fabrication', r2.primary_process)
hasSteps('column steps include internals + PWHT + hydrotest', r2.steps, [
  /internals|trays|packing/i,
  /PWHT|post-weld/i,
  /hydrotest/i,
])

// Shell-and-tube heat exchanger → plate-fabrication (tube bundle + tubesheet)
const hx = word(
  'effluent product cooler',
  {
    form: { value: 'shell-and-tube effluent cooler condensing syncrude + product, 316L' },
    manufacturer: { value: 'Alfa Laval' },
    part_number: { value: 'shell-and-tube process cooler — engineered' },
  },
  { content_character: { material_radical_primary: 'stainless_steel' } },
)
const r3 = processRoute(hx)
ok('shell-&-tube cooler → plate-fabrication', r3.primary_process === 'plate-fabrication', r3.primary_process)
hasSteps('HX steps include tubesheet + tube-to-tubesheet + hydrotest', r3.steps, [
  /tubesheet/i,
  /tube/i,
  /hydrotest/i,
])

// Atmospheric storage tank → plate-fabrication but the TANK route (no PWHT, water/settlement test)
const tank = word(
  'SAF storage tank',
  {
    form: { value: 'API 650 atmospheric welded steel storage tank, >=14-day' },
    manufacturer: { value: 'made-to-order fabrication' },
    part_number: { value: 'API 650 welded steel atmospheric storage tank' },
  },
  { content_character: { material_radical_primary: 'carbon_steel' } },
)
const r4 = processRoute(tank)
ok('API-650 tank → plate-fabrication', r4.primary_process === 'plate-fabrication', r4.primary_process)
ok('tank material = carbon steel', r4.material === 'carbon steel', r4.material ?? 'null')
hasSteps('tank steps = shell courses + field weld + water/settlement test (no PWHT)', r4.steps, [
  /shell courses|roll shell/i,
  /field-erected|field/i,
  /water\/settlement|settlement/i,
])
ok('tank route has NO PWHT step (atmospheric, not a code pressure vessel)', !r4.steps.join(' ').match(/post-weld heat treatment|PWHT/i))

// ─────────────────────────────────────────────────────────────────────────────
// 2) MACHINING — flanges / valves
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nmachining — flanges / shafts / valve bodies\n')

const flange = word(
  'weld-neck flange',
  { form: { value: '6-inch 316L weld-neck raised-face flange, machined from forging' } },
  { content_character: { material_radical_primary: 'stainless_steel' } },
)
const r5 = processRoute(flange)
ok('flange → machining', r5.primary_process === 'machining', r5.primary_process)
hasSteps('flange steps = cut from bar/forging + finish machine', r5.steps, [
  /cut from bar|forging blank|cut from/i,
  /finish machine/i,
])

const valve = word(
  'process control valve',
  {
    form: { value: 'rotary/globe control valve body, 316L, rated to process design' },
    manufacturer: { value: 'Emerson Fisher' },
    part_number: { value: 'GX + DVC6200' }, // a real Fisher GX/DVC line — this IS a catalogue valve
  },
  { content_character: { material_radical_primary: 'stainless_steel' } },
)
const r6 = processRoute(valve)
// With a real MPN present the honest default is BOUGHT (it is a catalogue valve, procured).
ok('control valve with real MPN → bought (catalogue)', r6.primary_process === 'bought', r6.primary_process)
// But if the integrator marks it MADE (in-house machined body), the route is machining + valve steps.
const r6made = processRoute(valve, { assumeMade: true })
ok('control valve forced-made → machining', r6made.primary_process === 'machining', r6made.primary_process)
hasSteps('made valve steps = machine body/seats + seat-leak test', r6made.steps, [
  /machine body|machine.*seats/i,
  /seat-leak|seat leak|API 598/i,
])

// A relief valve described as fabricated/bespoke (no catalogue MPN) → machining route surfaces.
const prv = word(
  'reactor pressure-relief valve',
  { form: { value: 'spring-loaded PRV sized to PED on the synthesis loop, 316L' } },
  { content_character: { material_radical_primary: 'stainless_steel' } },
)
const r6b = processRoute(prv)
ok('PRV (no catalogue MPN) → machining', r6b.primary_process === 'machining', r6b.primary_process)

// ─────────────────────────────────────────────────────────────────────────────
// 3) BOUGHT — an instrument with a real catalogue MPN
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nbought — catalogue instruments / pumps with a real MPN\n')

const transmitter = word(
  'pressure transmitters',
  {
    form: { value: 'coplanar gauge/differential, 4-20 mA HART, 316L wetted' },
    manufacturer: { value: 'Emerson' },
    part_number: { value: 'Rosemount 3051CD' },
  },
  { content_character: { material_radical_primary: 'stainless_steel' } },
)
const r7 = processRoute(transmitter)
ok('Rosemount 3051CD transmitter → bought', r7.primary_process === 'bought', r7.primary_process)
hasSteps('bought line route = procurement (PO + goods-in + inspect)', r7.steps, [
  /purchase order|raise purchase/i,
  /goods-in|goods in/i,
  /inspect/i,
])
ok('bought note names the real part', /Rosemount 3051CD/.test(r7.note ?? ''), r7.note ?? '')

const pumpCat = word(
  'process-water transfer pump',
  {
    form: { value: 'centrifugal process-water transfer pump, 1 duty + 1 standby, 316L' },
    manufacturer: { value: 'Grundfos' },
    part_number: { value: 'CRNE 10-4' },
  },
  { content_character: { material_radical_primary: 'stainless_steel' } },
)
const r8 = processRoute(pumpCat)
ok('Grundfos CRNE 10-4 pump → bought (real catalogue MPN beats the casting family)', r8.primary_process === 'bought', r8.primary_process)

// A pump with NO catalogue MPN → casting route surfaces (the casing is cast then machined).
const pumpFab = word(
  'bespoke API 610 process pump',
  { form: { value: 'API 610 centrifugal pump, special metallurgy, made to order' } },
  { content_character: { material_radical_primary: 'stainless_steel' } },
)
const r8b = processRoute(pumpFab)
ok('pump without catalogue MPN → casting', r8b.primary_process === 'casting', r8b.primary_process)
hasSteps('cast pump steps = cast casing + machine + performance test', r8b.steps, [
  /cast casing|cast.*impeller/i,
  /machine casing|machine.*bores/i,
  /performance test|ISO 9906|hydrostatic/i,
])

// ─────────────────────────────────────────────────────────────────────────────
// 4) PCB-ASSEMBLY — control board / DCS / I/O card / drive
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nPCB-assembly — control boards / DCS / I/O / drives\n')

const board = word(
  'custom cell-monitoring control board',
  { form: { value: '24-channel cell-voltage + temperature monitoring PCB' } },
  { content_character: { material_radical_primary: 'polymer_thermoplastic' } },
)
const r9 = processRoute(board)
ok('custom control board → PCB-assembly', r9.primary_process === 'PCB-assembly', r9.primary_process)
ok('PCB material = FR4 copper-clad laminate', /FR4/.test(r9.material ?? ''), r9.material ?? 'null')
hasSteps('PCB steps = bare board + SMT + reflow + test', r9.steps, [
  /bare PCB|FR4/i,
  /SMT|pick-and-place/i,
  /reflow/i,
  /test/i,
])

// A DCS with a real Siemens MPN → bought (it is a catalogue controller); forced-made → PCB-assembly.
const dcs = word(
  'distributed control system',
  {
    form: { value: 'redundant DCS controller pair sequencing the continuous plant' },
    manufacturer: { value: 'Siemens' },
    part_number: { value: 'Siemens SIMATIC S7-1500 distributed control' },
  },
  { content_character: { material_radical_primary: 'polymer_thermoplastic' } },
)
const r9b = processRoute(dcs)
ok('Siemens S7-1500 DCS → bought (catalogue)', r9b.primary_process === 'bought', r9b.primary_process)
const r9bMade = processRoute(dcs, { assumeMade: true })
ok('DCS forced-made → PCB-assembly', r9bMade.primary_process === 'PCB-assembly', r9bMade.primary_process)

// ─────────────────────────────────────────────────────────────────────────────
// 5) WINDING — transformer
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nwinding — transformers / motors / inductors\n')

const xfmr = word(
  'MV/LV distribution transformer',
  { form: { value: '11 kV / 415 V cast-resin distribution transformer feeding the plant' } },
  { content_character: { material_radical_primary: 'copper' } },
)
const r10 = processRoute(xfmr)
ok('cast-resin transformer → winding', r10.primary_process === 'winding', r10.primary_process)
hasSteps('transformer steps = core + wind coils + cast-resin + electrical test', r10.steps, [
  /core/i,
  /wind.*coils|wind hv|wind lv/i,
  /cast.*resin|impregnate/i,
  /electrical test/i,
])

// ─────────────────────────────────────────────────────────────────────────────
// 6) ASSEMBLY-ONLY — packaged skid; + ambiguous fallback
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nassembly-only — packaged skids / units; ambiguous fallback\n')

// Engineered process-gas compressor (no stock code) → assembly-only (rotating-equipment package).
const compressor = word(
  'tail-gas recycle compressor',
  {
    form: { value: 'single-stage centrifugal recycle compressor returning unconverted gas' },
    manufacturer: { value: 'Atlas Copco Gas and Process' },
    part_number: { value: 'centrifugal process gas compressor — engineered package' },
  },
  { content_character: { material_radical_primary: 'stainless_steel' } },
)
const rC = processRoute(compressor)
ok('engineered compressor (no stock code) → assembly-only', rC.primary_process === 'assembly-only', rC.primary_process)
hasSteps('compressor package steps = procure sub-parts + string test + FAT', rC.steps, [
  /procure casing|rotor|driver/i,
  /string test|API 618|API 617/i,
  /FAT|factory acceptance/i,
])

// A plural instrument name ("optical flame detectors") must still route to PCB-assembly — the
// classifier handles plural forms (detectors/cards/transmitters), not just the singular.
const detectorsFab = word(
  'optical flame detectors',
  { form: { value: 'IR3 optical flame detectors at the reactor, oxidiser and loading areas' } },
  { content_character: { material_radical_primary: 'polymer_thermoplastic' } },
)
ok('plural "flame detectors" (no stock code) → PCB-assembly', processRoute(detectorsFab).primary_process === 'PCB-assembly',
  processRoute(detectorsFab).primary_process)

const skid = word(
  'cooling-water skid',
  {
    form: { value: 'dry-cooler/cooling-tower + circulation-pump skid serving the plant' },
    manufacturer: { value: 'Kelvion' },
    part_number: { value: 'closed-loop cooling-water skid — packaged' },
  },
  { content_character: { material_radical_primary: 'steel' } },
)
const r11 = processRoute(skid)
ok('cooling-water skid → assembly-only', r11.primary_process === 'assembly-only', r11.primary_process)
hasSteps('skid steps = frame + mount + pipe/wire + FAT', r11.steps, [
  /skid frame|baseplate/i,
  /mount bought|mount/i,
  /FAT|factory acceptance/i,
])

// Consumable charge → bought + consumable note (NOT a manufacturing route).
const catalyst = word(
  'shaped iron FT catalyst charge',
  { form: { value: 'shaped/structured iron-based FT catalyst charge engineered for the reactor' } },
  { content_character: { material_radical_primary: 'ceramic' } },
)
const r12 = processRoute(catalyst)
ok('catalyst charge → bought (consumable)', r12.primary_process === 'bought', r12.primary_process)
ok('catalyst note flags consumable/material supply', /consumable|material supply/i.test(r12.note ?? ''), r12.note ?? '')

// Ambiguous line (no MPN, no recognised family) → low-confidence assembly-only.
const vague = word('mystery widget', { form: { value: 'an unspecified custom item with no clear shape' } })
const r13 = processRoute(vague)
ok('ambiguous line → low confidence', r13.confidence === 'low', r13.confidence)
ok('ambiguous line note flags uncertainty', /uncertain|indicative/i.test(r13.note ?? ''), r13.note ?? '')

// ─────────────────────────────────────────────────────────────────────────────
// 7) WHOLE REAL E-FUEL BoM — process mix sanity check
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── whole-BoM process mix on the REAL e-fuel BoM (out/oxccu-saf-v21) ──\n')

const statePath = path.resolve(process.cwd(), 'out/oxccu-saf-v21/state.json')
if (!fs.existsSync(statePath)) {
  console.warn(`  (skipped real-BoM mix — ${statePath} not found)`) // never fail the suite on a missing fixture
} else {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  const lines: BomLine[] = []
  for (const m of state.moduleDecomposition?.modules ?? [])
    for (const sm of m.sub_modules ?? [])
      for (const w of sm.words ?? []) lines.push(w as BomLine)

  ok('e-fuel BoM has 73 lines', lines.length === 73, `got ${lines.length}`)

  const summary = processRouteSummary(lines)
  console.log(`  process mix: ${JSON.stringify(summary.by_process)}`)
  console.log(`  made ${summary.made_count} / bought ${summary.bought_count}; dominant make routes: ${summary.dominant_routes.join(', ')}`)
  console.log(`  summary note: ${summary.note}\n`)

  // Sanity: every line classifies into the known set, no throw.
  const known: PrimaryProcess[] = ['plate-fabrication', 'machining', 'casting', 'PCB-assembly', 'winding', 'moulding', 'assembly-only', 'bought']
  let allKnown = true
  for (const l of lines) if (!known.includes(processRoute(l).primary_process)) allKnown = false
  ok('every e-fuel line maps to a known primary_process', allKnown)

  // Sanity: the FT reactor in the REAL data is plate-fabrication, and its material is read from the
  // underscore radical "stainless_steel" (NOT the form sentence, which says "shaped iron catalyst").
  const realFt = lines.find((l) => /fischer-tropsch synthesis reactor/i.test(l.name_human ?? ''))
  ok('real FT reactor line → plate-fabrication', !!realFt && processRoute(realFt).primary_process === 'plate-fabrication',
    realFt ? processRoute(realFt).primary_process : 'reactor line not found')
  ok('real FT reactor material read from the underscore radical → "stainless steel"',
    !!realFt && /stainless steel/.test(processRoute(realFt).material ?? ''),
    realFt ? String(processRoute(realFt).material) : 'reactor line not found')

  // Sanity: the real fractionation column → plate-fabrication.
  const realCol = lines.find((l) => /product fractionation column/i.test(l.name_human ?? ''))
  ok('real fractionation column → plate-fabrication', !!realCol && processRoute(realCol).primary_process === 'plate-fabrication',
    realCol ? processRoute(realCol).primary_process : 'column not found')

  // Sanity: the real Rosemount transmitter → bought.
  const realTx = lines.find((l) => /pressure transmitters/i.test(l.name_human ?? ''))
  ok('real pressure transmitter (Rosemount 3051CD) → bought', !!realTx && processRoute(realTx).primary_process === 'bought',
    realTx ? processRoute(realTx).primary_process : 'transmitter not found')

  // Sanity: the real transformer → winding.
  const realXfmr = lines.find((l) => /distribution transformer/i.test(l.name_human ?? ''))
  ok('real distribution transformer → winding', !!realXfmr && processRoute(realXfmr).primary_process === 'winding',
    realXfmr ? processRoute(realXfmr).primary_process : 'transformer not found')

  // The REAL DCS line's part_number is "Siemens SIMATIC S7-1500 … controller — engineered": the
  // "— engineered" suffix marks it a panel-built / configured-to-order control system (NOT a stock
  // buy), so it honestly routes to PCB-assembly (assemble + panel-build + test). A bare-code I/O
  // card ("6ES7131-6BH01-0BA0") IS bought — checked next. This is the right made/buy split: stock
  // codes → bought, "— engineered/configured" control systems → assembled.
  const realDcs = lines.find((l) => /distributed control system/i.test(l.name_human ?? ''))
  ok('real DCS (Siemens S7-1500 — engineered) → PCB-assembly (panel-built, not a stock buy)',
    !!realDcs && processRoute(realDcs).primary_process === 'PCB-assembly',
    realDcs ? processRoute(realDcs).primary_process : 'DCS not found')
  const realIoCard = lines.find((l) => /digital i\/o cards/i.test(l.name_human ?? ''))
  ok('real digital I/O card (bare code 6ES7…) → bought (stock catalogue part)',
    !!realIoCard && processRoute(realIoCard).primary_process === 'bought',
    realIoCard ? processRoute(realIoCard).primary_process : 'I/O card not found')

  // Over-match guard: a vessel whose FORM sentence incidentally mentions "compressor" must NOT route
  // to the compressor package — it is a fabricated vessel. ("recycle knock-out drum" form =
  // "compressor-suction knock-out drum protecting the recycle compressor"; the guard bed form says
  // "the compressors handle cool gas".) Both must be plate-fabrication (identity-keyed rotating-eq).
  const realKo = lines.find((l) => /recycle knock-out drum/i.test(l.name_human ?? ''))
  ok('real KO drum (form mentions "compressor") → plate-fabrication, NOT compressor package',
    !!realKo && processRoute(realKo).primary_process === 'plate-fabrication',
    realKo ? processRoute(realKo).primary_process : 'KO drum not found')
  const realGuard = lines.find((l) => /guard bed/i.test(l.name_human ?? ''))
  ok('real guard bed (form mentions "compressors") → plate-fabrication',
    !!realGuard && processRoute(realGuard).primary_process === 'plate-fabrication',
    realGuard ? processRoute(realGuard).primary_process : 'guard bed not found')
  // Plural valve name: "emergency shutdown valves" → machining (the regex handles the plural).
  const realEsd = lines.find((l) => /emergency shutdown valves/i.test(l.name_human ?? ''))
  ok('real "emergency shutdown valves" (plural) → machining',
    !!realEsd && processRoute(realEsd).primary_process === 'machining',
    realEsd ? processRoute(realEsd).primary_process : 'ESD valves not found')
  // Real engineered compressors → assembly-only (rotating-equipment package).
  const realComp = lines.find((l) => /tail-gas recycle compressor/i.test(l.name_human ?? ''))
  ok('real tail-gas recycle compressor → assembly-only',
    !!realComp && processRoute(realComp).primary_process === 'assembly-only',
    realComp ? processRoute(realComp).primary_process : 'compressor not found')

  // Sanity: there IS some plate-fabrication (the vessels) — the dominant route for a process plant.
  ok('plate-fabrication is present + a dominant make route', (summary.by_process['plate-fabrication'] ?? 0) >= 8 && summary.dominant_routes[0] === 'plate-fabrication',
    `plate-fab=${summary.by_process['plate-fabrication']}, dominant[0]=${summary.dominant_routes[0]}`)

  // Both made and bought are substantial. On THIS BoM the engine writes "— engineered / packaged /
  // bespoke" descriptors for most major equipment (compressors, HX, vessels, skids, control systems),
  // so they route as MADE/engineered-to-order; the BOUGHT lines are the bare-code stock parts
  // (Grundfos CRNE 10-4, Rosemount 3051CD, ABB ACS580-01, Siemens 6ES7… cards, Rittal VX25). The
  // route layer reports an honest, non-trivial mix in BOTH directions rather than collapsing to one.
  ok('a substantial BOUGHT cohort exists (bare-code stock parts ≥ 20)', summary.bought_count >= 20,
    `bought=${summary.bought_count}`)
  ok('a substantial MADE cohort exists (engineered-to-order equipment ≥ 20)', summary.made_count >= 20,
    `made=${summary.made_count}`)

  // ── Print 4 worked example routes for the deliverable ──
  console.log('  ── worked example routes ──')
  const examples = ['Fischer-Tropsch synthesis reactor', 'product control valves', 'pressure transmitters', 'MV/LV distribution transformer']
  for (const nm of examples) {
    const l = lines.find((x) => (x.name_human ?? '').toLowerCase() === nm.toLowerCase()) ?? lines.find((x) => (x.name_human ?? '').toLowerCase().includes(nm.toLowerCase().split(' ')[0]))
    if (!l) continue
    const r = processRoute(l)
    console.log(`  • ${l.name_human}: ${r.primary_process} [${r.confidence}] (${r.material ?? 'material n/a'})`)
    console.log(`      steps: ${r.steps.join(' → ')}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? '✅' : '❌'} bom-process-route: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
