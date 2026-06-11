/**
 * bom-assembly-sequence.test.tsx — verifies the assembly / erection-sequence layer (the Part-2
 * "how you manufacture it — the build order" block) on hand-built lines AND on the real e-fuel
 * plant (out/oxccu-saf-v21 state + connection schedule + engineering-contract topology).
 *
 * Run: npx tsx "scripts/lib/cost/bom-assembly-sequence.test.tsx"   (network-free, deterministic)
 *
 * The spec from the task:
 *   - eight ordered, non-empty-where-expected phases (civil → structural → set-equipment →
 *     pipework → electrical → instruments → pre-commissioning → commissioning);
 *   - the FT reactor + columns land in 'set major equipment' in PROCESS order;
 *   - the 8 routed connection runs split across pipework (7 fluid/thermal) + electrical (1 bus);
 *   - the instruments (transmitters / detectors / control valves) land in 'instruments & controls';
 *   - the sequence reads like a real erection plan.
 */
import {
  assemblySequence,
  type BomLine,
  type AssemblySequenceContext,
  type AssemblyPhaseKey,
} from './bom-assembly-sequence'
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

/** Build a BoM "word" from a name + a partial modifier map (mirrors the sibling test helpers). */
function word(name_human: string, mods: Record<string, { value: string; unit?: string }> = {}, extra: Partial<BomLine> = {}): BomLine {
  return {
    name_human,
    modifier_characters: Object.entries(mods).map(([kind, m]) => ({ kind, value: m.value, unit: m.unit })),
    ...extra,
  }
}

/** Find a phase by key. */
function phase(result: ReturnType<typeof assemblySequence>, key: AssemblyPhaseKey) {
  return result.phases.find((p) => p.phase === key)!
}
/** True when ANY item in a phase matches the regex. */
function phaseHas(result: ReturnType<typeof assemblySequence>, key: AssemblyPhaseKey, re: RegExp): boolean {
  return phase(result, key).items.some((it) => re.test(it))
}

console.log('bom-assembly-sequence — the ordered plant erection sequence\n')

// ─────────────────────────────────────────────────────────────────────────────
// 1) THE PHASE FRAME — eight phases, fixed order, correct keys + titles
// ─────────────────────────────────────────────────────────────────────────────
console.log('phase frame — eight ordered phases\n')

const EXPECTED_ORDER: AssemblyPhaseKey[] = [
  'civil-foundations',
  'structural-erection',
  'set-major-equipment',
  'pipework-ducting',
  'electrical-cabling',
  'instruments-controls',
  'pre-commissioning',
  'commissioning-startup',
]

{
  const r = assemblySequence([])
  ok('returns exactly 8 phases', r.phases.length === 8, `got ${r.phases.length}`)
  ok('phases are in the fixed erection order', r.phases.map((p) => p.phase).join(',') === EXPECTED_ORDER.join(','),
    r.phases.map((p) => p.phase).join(','))
  ok('order field is 1..8 ascending', r.phases.every((p, i) => p.order === i + 1))
  ok('every phase has a scope sentence', r.phases.every((p) => p.scope.length > 10))
  ok('every phase has a title', r.phases.every((p) => p.title.length > 3))
  ok('empty BoM still yields a narrative', r.narrative.length > 50)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) PER-LINE ROLE-SIGNAL PLACEMENT — each role lands in the right phase
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nper-line placement — role signals → phases\n')

const civilLine = word('reactor equipment foundation + plinth', { form: { value: 'reinforced-concrete foundation + plinth for the synthesis reactor' } })
const steelLine = word('main pipe rack + structural steel', { form: { value: 'galvanised structural steel pipe rack carrying interconnecting lines' } })
const reactorLine = word('Fischer-Tropsch synthesis reactor', {
  form: { value: 'cooled multitubular fixed-bed FT reactor, 316L, 25 bar' },
  manufacturer: { value: 'made-to-order fabrication' },
  part_number: { value: 'fabricated boiling-water-cooled multitubular reactor — bespoke vessel' },
})
const columnLine = word('product fractionation column', {
  form: { value: 'packed/trayed fractionation column, 316L' },
  manufacturer: { value: 'made-to-order fabrication' },
  part_number: { value: 'fabricated 316L fractionation column shell — bespoke vessel' },
})
const ductLine = word('flue-gas ductwork to stack', { form: { value: 'carbon-steel ductwork carrying oxidiser flue gas to the stack' } })
const xfmrLine = word('MV/LV distribution transformer', { form: { value: '11 kV / 415 V cast-resin distribution transformer' } })
const mccLine = word('motor control centre', { form: { value: 'Form-4 motor control centre feeding the plant drives' } })
const txLine = word('pressure transmitters', { manufacturer: { value: 'Emerson' }, part_number: { value: 'Rosemount 3051CD' } })
const cvLine = word('process control valves', { manufacturer: { value: 'Emerson Fisher' }, part_number: { value: 'GX + DVC6200' } })
const dcsLine = word('distributed control system', { manufacturer: { value: 'Siemens' }, part_number: { value: 'Siemens SIMATIC S7-1500 — engineered' } })
const catalystLine = word('shaped iron FT catalyst charge', { form: { value: 'shaped iron-based FT catalyst charge for the reactor' } })

// AUXILIARY GUARD lines: a valve/relief that MENTIONS a vessel must be an instrument, not the vessel.
const blanketValve = word('storage-tank N2 blanketing valves', { form: { value: 'pressure/vacuum blanketing valve set on the SAF/naphtha tanks' } })
const reliefValve = word('reactor pressure-relief valve', { form: { value: 'spring-loaded PRV on the synthesis reactor' } })

const allLines = [civilLine, steelLine, reactorLine, columnLine, ductLine, xfmrLine, mccLine, txLine, cvLine, dcsLine, catalystLine, blanketValve, reliefValve]
const rp = assemblySequence(allLines)

ok('foundation → civil-foundations', phaseHas(rp, 'civil-foundations', /foundation/i))
ok('pipe rack + structural steel → structural-erection', phaseHas(rp, 'structural-erection', /structural steel|pipe rack/i))
ok('FT reactor → set-major-equipment', phaseHas(rp, 'set-major-equipment', /fischer-tropsch synthesis reactor/i))
ok('fractionation column → set-major-equipment', phaseHas(rp, 'set-major-equipment', /fractionation column/i))
ok('ductwork → pipework-ducting', phaseHas(rp, 'pipework-ducting', /ductwork/i))
ok('transformer → electrical-cabling', phaseHas(rp, 'electrical-cabling', /transformer/i))
ok('motor control centre → electrical-cabling', phaseHas(rp, 'electrical-cabling', /motor control centre/i))
ok('pressure transmitters → instruments-controls', phaseHas(rp, 'instruments-controls', /pressure transmitters/i))
ok('control valves → instruments-controls', phaseHas(rp, 'instruments-controls', /control valves/i))
ok('DCS → instruments-controls', phaseHas(rp, 'instruments-controls', /distributed control system/i))
ok('catalyst charge rides with vessel → set-major-equipment', phaseHas(rp, 'set-major-equipment', /catalyst charge/i))
// Auxiliary guard: tank-blanketing valves + reactor PRV are INSTRUMENTS, not the tank / the reactor.
ok('storage-tank blanketing VALVES → instruments-controls (not set-equipment)', phaseHas(rp, 'instruments-controls', /blanketing valves/i))
ok('  ...and blanketing valves are NOT in set-major-equipment', !phaseHas(rp, 'set-major-equipment', /blanketing valves/i))
ok('reactor pressure-relief VALVE → instruments-controls (not set-equipment)', phaseHas(rp, 'instruments-controls', /pressure-relief valve/i))
ok('  ...and the PRV is NOT in set-major-equipment', !phaseHas(rp, 'set-major-equipment', /pressure-relief valve/i))
// Set-equipment note flags the catalyst-load + process order.
ok('set-equipment note flags catalyst loaded into host vessel', /loaded into their host vessels|charges/i.test(phase(rp, 'set-major-equipment').note ?? ''),
  phase(rp, 'set-major-equipment').note ?? '')

// ─────────────────────────────────────────────────────────────────────────────
// 3) PROCESS-ORDER within set-major-equipment from a topology
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nprocess order — set-major-equipment sorted by topology\n')

{
  const feedComp = word('CO2 feed compressor', { part_number: { value: 'API 618 reciprocating compressor — engineered package' } })
  const reactor = word('Fischer-Tropsch synthesis reactor', { part_number: { value: 'fabricated multitubular reactor — bespoke vessel' } })
  const sep = word('hot 3-phase separator', { part_number: { value: 'fabricated knock-out drum — bespoke vessel' } })
  const col = word('product fractionation column', { part_number: { value: 'fabricated fractionation column — bespoke vessel' } })
  const tank = word('SAF storage tank', { part_number: { value: 'API 650 atmospheric storage tank — bespoke' } })
  // Deliberately pass them OUT of order; topology should re-order them feed → product.
  const lines = [tank, col, sep, reactor, feedComp]
  const topology = [
    { from_part: 'co2_feed_compressor', to_part: 'ft_synthesis_reactor' },
    { from_part: 'ft_synthesis_reactor', to_part: 'three_phase_separator' },
    { from_part: 'three_phase_separator', to_part: 'fractionation_column' },
    { from_part: 'fractionation_column', to_part: 'saf_and_naphtha_storage' },
  ]
  const ctx: AssemblySequenceContext = { topology }
  const r = assemblySequence(lines, ctx)
  const eq = phase(r, 'set-major-equipment').items
  const idx = (re: RegExp) => eq.findIndex((x) => re.test(x))
  ok('compressor set before reactor', idx(/compressor/i) < idx(/reactor/i), eq.join(' | '))
  ok('reactor set before separator', idx(/reactor/i) < idx(/separator/i), eq.join(' | '))
  ok('separator set before column', idx(/separator/i) < idx(/column/i), eq.join(' | '))
  ok('column set before storage tank', idx(/column/i) < idx(/storage tank/i), eq.join(' | '))
  ok('process-order note present when topology supplied', /process order/i.test(phase(r, 'set-major-equipment').note ?? ''),
    phase(r, 'set-major-equipment').note ?? '')
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) CONNECTION-RUN SPLIT — pipework vs electrical
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nconnection runs — split across pipework + electrical\n')

{
  const connections = [
    { mechanism: 'fluid_loop', from: 'co2_feed_compressor', to: 'ft_synthesis_reactor', size: 'DN32', qty: 'DN32 pipe, 12.4 m' },
    { mechanism: 'thermal', from: 'ft_synthesis_reactor', to: 'waste_heat_steam_generator', size: 'DN200', qty: 'DN200 coolant pipe, 18.1 m' },
    { mechanism: 'electrical_bus', from: 'electrical_supply', to: 'process_compressors_and_pumps', size: '8×400 mm²', qty: '8 × 400 mm² Cu, 20.1 m each' },
  ]
  const r = assemblySequence([], { connections })
  ok('fluid_loop run → pipework', phaseHas(r, 'pipework-ducting', /co2 feed compressor.*ft synthesis reactor|DN32/i), phase(r, 'pipework-ducting').items.join(' | '))
  ok('thermal run → pipework', phaseHas(r, 'pipework-ducting', /coolant|DN200/i), phase(r, 'pipework-ducting').items.join(' | '))
  ok('electrical_bus run → electrical', phaseHas(r, 'electrical-cabling', /400 mm²|electrical supply/i), phase(r, 'electrical-cabling').items.join(' | '))
  ok('electrical run NOT in pipework', !phaseHas(r, 'pipework-ducting', /mm²/i))
  ok('pipe runs NOT in electrical', !phaseHas(r, 'electrical-cabling', /DN32|DN200/i))
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) THE REAL E-FUEL PLANT — state + connection schedule + topology
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── REAL e-fuel plant (out/oxccu-saf-v21) ──\n')

const statePath = path.resolve(process.cwd(), 'out/oxccu-saf-v21/state.json')
const csPath = path.resolve(process.cwd(), 'out/oxccu-saf-v21/connection-schedule.json')
const contractPath = path.resolve(process.cwd(), 'out/oxccu-saf-v21/0.5-engineering-contract.json')

if (!fs.existsSync(statePath)) {
  console.warn(`  (skipped real-plant checks — ${statePath} not found)`)
} else {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  const connections = fs.existsSync(csPath) ? JSON.parse(fs.readFileSync(csPath, 'utf8')).rows : []
  const topology = fs.existsSync(contractPath) ? JSON.parse(fs.readFileSync(contractPath, 'utf8')).topology : []

  // Count BoM lines for context.
  let bomCount = 0
  for (const m of state.moduleDecomposition?.modules ?? [])
    for (const sm of m.sub_modules ?? []) bomCount += (sm.words ?? []).length
  ok('e-fuel BoM has 73 lines', bomCount === 73, `got ${bomCount}`)
  ok('connection schedule has 8 runs', connections.length === 8, `got ${connections.length}`)
  ok('topology has 8 edges', topology.length === 8, `got ${topology.length}`)

  const r = assemblySequence(state, { connections, topology })

  // ── phases present + ordered ──
  ok('real plant: 8 phases in order', r.phases.map((p) => p.phase).join(',') === EXPECTED_ORDER.join(','))

  const setEquip = phase(r, 'set-major-equipment')
  const pipework = phase(r, 'pipework-ducting')
  const electrical = phase(r, 'electrical-cabling')
  const instruments = phase(r, 'instruments-controls')
  const structural = phase(r, 'structural-erection')
  const civil = phase(r, 'civil-foundations')

  // ── the equipment-bearing phases are non-empty (the ones that MUST have content) ──
  ok('set-major-equipment non-empty', setEquip.items.length > 0, `${setEquip.items.length}`)
  ok('pipework non-empty (routed runs)', pipework.items.length > 0, `${pipework.items.length}`)
  ok('electrical non-empty (transformer/switchgear/VSDs + run)', electrical.items.length > 0, `${electrical.items.length}`)
  ok('instruments non-empty', instruments.items.length > 0, `${instruments.items.length}`)

  // ── the FT reactor + columns land in set-major-equipment, in PROCESS order ──
  ok('FT reactor in set-major-equipment', setEquip.items.some((x) => /fischer-tropsch synthesis reactor/i.test(x)),
    setEquip.items.join(' | '))
  ok('fractionation column in set-major-equipment', setEquip.items.some((x) => /fractionation column/i.test(x)))
  // Process order: a feed compressor should be set before the FT reactor; the reactor before the
  // fractionation column; the column before the storage tanks.
  const idxE = (re: RegExp) => setEquip.items.findIndex((x) => re.test(x))
  ok('CO2/H2 feed compressor set before FT reactor', idxE(/feed compressor/i) >= 0 && idxE(/feed compressor/i) < idxE(/synthesis reactor/i),
    `feedComp@${idxE(/feed compressor/i)} reactor@${idxE(/synthesis reactor/i)} — ${setEquip.items.join(' | ')}`)
  ok('FT reactor set before fractionation column', idxE(/synthesis reactor/i) < idxE(/fractionation column/i),
    `reactor@${idxE(/synthesis reactor/i)} column@${idxE(/fractionation column/i)}`)
  ok('fractionation column set before SAF storage tank', idxE(/fractionation column/i) >= 0 && idxE(/fractionation column/i) < idxE(/saf storage tank/i),
    `column@${idxE(/fractionation column/i)} tank@${idxE(/saf storage tank/i)}`)

  // ── the 8 connection runs split across pipework (7 fluid/thermal) + electrical (1 bus) ──
  // pipework should carry the 7 pipe/thermal runs; electrical should carry the 1 mm² bus run.
  const pipeRunItems = pipework.items.filter((x) => /→/.test(x))
  const elecRunItems = electrical.items.filter((x) => /→/.test(x))
  ok('7 routed pipe/thermal runs land in pipework', pipeRunItems.length === 7, `got ${pipeRunItems.length}: ${pipeRunItems.join(' | ')}`)
  ok('1 routed electrical run lands in electrical', elecRunItems.length === 1, `got ${elecRunItems.length}: ${elecRunItems.join(' | ')}`)
  ok('electrical run is the 400 mm² Cu bus', elecRunItems.some((x) => /mm²/.test(x)), elecRunItems.join(' | '))
  ok('no mm² cable run leaked into pipework', !pipework.items.some((x) => /mm²/.test(x)))

  // ── instruments land in instruments-controls ──
  ok('pressure transmitters in instruments-controls', instruments.items.some((x) => /pressure transmitters/i.test(x)))
  ok('gas/flame detectors in instruments-controls', instruments.items.some((x) => /detectors/i.test(x)))
  ok('process control valves in instruments-controls', instruments.items.some((x) => /control valves/i.test(x)))
  ok('DCS + SIS in instruments-controls', instruments.items.some((x) => /distributed control system/i.test(x)) && instruments.items.some((x) => /safety instrumented/i.test(x)))
  // Control-system I/O cards + network switches are control kit → instruments-controls, not set-equipment.
  ok('I/O cards in instruments-controls', instruments.items.some((x) => /i\/o cards?|i\/o (?:interface )?stations?/i.test(x)),
    instruments.items.join(' | '))
  ok('PROFINET network switches in instruments-controls', instruments.items.some((x) => /profinet|industrial switches/i.test(x)))
  ok('  ...and I/O cards are NOT in set-major-equipment', !setEquip.items.some((x) => /\bi\/o cards?\b/i.test(x)))

  // ── electrical carries the power kit (transformer, switchgear, drives, MCC, UPS) ──
  ok('transformer in electrical', electrical.items.some((x) => /transformer/i.test(x)))
  ok('VFDs/drives in electrical', electrical.items.some((x) => /variable-frequency|drives|motor control centre/i.test(x)))

  // ── every BoM line is placed exactly once across the equipment-bearing phases ──
  const placed =
    civil.items.length + structural.items.length + setEquip.items.length +
    pipework.items.filter((x) => !/→/.test(x)).length + // BoM pipe-spool lines only (exclude routed runs)
    electrical.items.filter((x) => !/→/.test(x)).length +
    instruments.items.length
  ok('every BoM line placed exactly once (73)', placed === 73, `placed ${placed} of 73 BoM lines`)

  // ── the pre/commissioning phases are synthetic (no BoM line) ──
  ok('pre-commissioning has no BoM items', phase(r, 'pre-commissioning').items.length === 0)
  ok('commissioning-startup has no BoM items', phase(r, 'commissioning-startup').items.length === 0)
  ok('pre-commissioning scope mentions leak/pressure test + loop check', /pressure|leak|loop/i.test(phase(r, 'pre-commissioning').scope))
  ok('commissioning scope mentions energise/feed/performance', /energise|feed|performance/i.test(phase(r, 'commissioning-startup').scope))

  // ── narrative sanity ──
  ok('narrative reads like an erection plan (mentions phases + process order + GA drawing)',
    /eight phases/i.test(r.narrative) && /process order/i.test(r.narrative) && /general arrangement/i.test(r.narrative),
    r.narrative.slice(0, 120))

  // ── PRINT the produced sequence for the deliverable ──
  console.log('\n  ── produced assembly sequence (real e-fuel plant) ──')
  for (const p of r.phases) {
    console.log(`\n  ${p.order}. ${p.title}  [${p.phase}] — ${p.items.length} item(s)`)
    console.log(`     scope: ${p.scope}`)
    if (p.items.length) console.log(`     items: ${sampleList(p.items, 5)}`)
    if (p.note) console.log(`     note:  ${p.note}`)
  }
  console.log(`\n  ── narrative ──\n  ${r.narrative}\n`)
}

function sampleList(items: string[], n: number): string {
  return items.slice(0, n).join('  •  ') + (items.length > n ? `  • …(+${items.length - n})` : '')
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? '✅' : '❌'} bom-assembly-sequence: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
