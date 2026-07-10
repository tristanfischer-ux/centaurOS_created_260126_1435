// proveCatch guard for reassertPopulationCounts in universal-contract-sizing.ts
// (Tristan 2026-06-27, physics-critic "massive duplication of valve counts" HIGH).
//
// THE BUG: the LLM Phase-2 stamps a single contract POPULATION count
// (actuated_distribution_valve_count=200) onto EVERY word sharing its head noun — ~15 valve
// words each ×200 = 3,000 valves for a 200-valve network. reassertPopulationCounts re-asserts the
// deterministic per-word count (contractCountFor, qualifier-strict) over exactly that smear, with
// three false-positive guards (≥POP_MIN, value==a contract count, head-noun shared). This guard
// fails the build if the smear is no longer corrected OR a legitimate count is wrongly reset.

import { reassertPopulationCounts, dropAttributePhantomWords } from './universal-contract-sizing'

const C = (q: Record<string, number>) => ({
  quantities: Object.fromEntries(Object.entries(q).map(([k, v]) => [k, { value: v }])),
}) as never

function word(name: string, qty: number) {
  const slug = name.toLowerCase().replace(/\W+/g, '_')
  return {
    id: `${slug}_word`, name_human: name,
    content_character: { character_id: slug, name_human: name },
    modifier_characters: [{ kind: 'quantity', value: `×${qty}` }],
  }
}
function qtyOf(modules: any, name: string): number {
  for (const m of modules) for (const sm of m.sub_modules) for (const w of sm.words) {
    if ((w.name_human || '') === name) {
      const q = (w.modifier_characters || []).find((x: any) => x.kind === 'quantity')
      return parseInt(String(q?.value).replace(/[^0-9]/g, ''), 10) || 0
    }
  }
  return -1
}

function run() {
  const modules: any = [{
    module: 'actuation', sub_modules: [{ sub_module: 's', words: [
      word('Pneumatic Actuated Valve', 200),  // genuine actuated-distribution match → stays 200
      word('Solenoid Valves', 200),           // smear: head noun valve, fails qualifiers → 1
      word('Manual Ball Valve', 200),         // smear → 1
      word('Check Valve', 200),               // smear → 1
      word('Sample Valves', 200),             // smear → 1
      word('Nutrient Tank', 8),               // below POP_MIN → untouched
      word('Drip Emitter', 200),              // 200 but NO count key with head noun 'emitter' → untouched
    ] }],
  }]
  const fixed = reassertPopulationCounts(modules, C({ actuated_distribution_valve_count: 200, nutrient_tank_count: 8 }))

  if (qtyOf(modules, 'Pneumatic Actuated Valve') !== 200) throw new Error(`population-count: the genuine actuated valve must keep ×200 (got ${qtyOf(modules, 'Pneumatic Actuated Valve')})`)
  for (const smear of ['Solenoid Valves', 'Manual Ball Valve', 'Check Valve', 'Sample Valves']) {
    if (qtyOf(modules, smear) !== 1) throw new Error(`population-count: "${smear}" was a head-noun smear of the 200-valve count and must drop to ×1 (got ${qtyOf(modules, smear)})`)
  }
  if (qtyOf(modules, 'Nutrient Tank') !== 8) throw new Error('population-count: a below-threshold count (×8) must be untouched')
  if (qtyOf(modules, 'Drip Emitter') !== 200) throw new Error('population-count: a ×200 word whose head noun matches NO same-valued count key must be untouched (false-positive guard)')
  if (fixed !== 4) throw new Error(`population-count: expected exactly 4 smear corrections, got ${fixed}`)

  // ── dropAttributePhantomWords: a dimension/property name is not a part; same-id words dedup ──
  const pm: any = [{
    module: 'mass_fluid', sub_modules: [{ sub_module: 's', words: [
      { ...word('RO Membrane Area', 1), id: 'ro_membrane_area_word' },     // phantom (ends "Area")
      { ...word('GAC Vessel Diameter', 1), id: 'gac_vessel_diameter_word' }, // phantom (ends "Diameter")
      { ...word('Reverse Osmosis Skid', 1), id: 'ro_skid_word' },          // real part — kept
      { ...word('Pressure Vessel', 1), id: 'pv_word' },                    // ends in DEVICE noun — kept
      { ...word('Control Valve', 1), id: 'cv_word' },                      // ends in DEVICE noun — kept
      { ...word('Duplicate Pump', 1), id: 'dup_word' },
      { ...word('Duplicate Pump Two', 1), id: 'dup_word' },                // same id → deduped
    ] }],
  }]
  const dr = dropAttributePhantomWords(pm)
  const remain = pm[0].sub_modules[0].words.map((w: any) => w.name_human)
  if (remain.some((n: string) => /membrane area|vessel diameter/i.test(n))) throw new Error(`phantom-drop: a dimension/property phantom survived (${JSON.stringify(remain)})`)
  for (const keep of ['Reverse Osmosis Skid', 'Pressure Vessel', 'Control Valve']) {
    if (!remain.includes(keep)) throw new Error(`phantom-drop: dropped a REAL part "${keep}" (ends in a device noun, must be kept)`)
  }
  if (dr.droppedDuplicate !== 1) throw new Error(`phantom-drop: expected 1 exact-id duplicate dropped, got ${dr.droppedDuplicate}`)

  // ── dropAttributePhantomWords: solenoid ↔ pneumatic-actuated synonym population collapse ──
  const syn: any = [{
    module: 'actuation', sub_modules: [{ sub_module: 's', words: [
      { ...word('Solenoid Valves', 200), id: 'solenoid_valves_word' },
      { ...word('Pneumatic Actuated Valves', 200), id: 'pneumatic_actuated_valves_word' },
      { ...word('Solenoid Valve', 200), id: 'solenoid_valve_word' },
      { ...word('Manual Ball Valves', 200), id: 'manual_ball_valves_word' }, // distinct family — kept
    ] }],
  }]
  const synDr = dropAttributePhantomWords(syn)
  const synRemain = syn[0].sub_modules[0].words.map((w: any) => w.name_human)
  if (synRemain.filter((n: string) => /solenoid|pneumatic actuated/i.test(n)).length !== 1) {
    throw new Error(`phantom-drop: solenoid+pneumatic ×200 must collapse to ONE word (got ${JSON.stringify(synRemain)})`)
  }
  if (!synRemain.includes('Manual Ball Valves')) {
    throw new Error('phantom-drop: Manual Ball Valves ×200 must NOT collapse into the actuated-on/off family')
  }
  if (synDr.droppedDuplicate < 2) {
    throw new Error(`phantom-drop: expected ≥2 synonym population drops, got ${synDr.droppedDuplicate}`)
  }

  // ── dropAttributePhantomWords: SINGULAR/PLURAL PINNED duplicate (run-20 £210k×2 rack) ──
  const mkPinned = (id: string, name: string, pn: string) => ({
    id, name_human: name, content_character: { character_id: id, name_human: name },
    modifier_characters: [
      { kind: 'quantity', value: '×1' },
      { kind: 'part_number', value: pn },
    ],
  })
  const pinned: any = [{
    module: 'energy', sub_modules: [{ sub_module: 's', words: [
      mkPinned('battery_module_rack_word', 'Battery Module Rack', 'ST2752UX'),
      mkPinned('battery_module_racks_word', 'Battery Module Racks', 'ST2752UX'),
      mkPinned('bms_slave_word', 'BMS Slave', 'ORION-2'),                      // different name — kept
      mkPinned('spare_module_word', 'Spare Module', 'TBD (detailed design)'),  // TBD never keys
      mkPinned('spare_modules_word', 'Spare Modules', 'TBD (detailed design)'),
    ] }],
  }]
  const pinnedDr = dropAttributePhantomWords(pinned)
  const pinnedRemain = pinned[0].sub_modules[0].words.map((w: any) => w.name_human)
  if (pinnedRemain.filter((n: string) => /battery module rack/i.test(n)).length !== 1) {
    throw new Error(`phantom-drop: singular+plural SAME-PIN principals must collapse to ONE (got ${JSON.stringify(pinnedRemain)})`)
  }
  // (2026-07-10 sibling-fold update: 'Spare Module' + 'Spare Modules' now ALSO fold —
  //  they are the same part under singular/plural labels, TBD pin or not)
  if (!pinnedRemain.includes('BMS Slave') || pinnedRemain.filter((n: string) => /spare/i.test(n)).length !== 1) {
    throw new Error('phantom-drop: the distinct pinned part stays; the spare singular/plural pair folds to ONE')
  }
  if (pinnedDr.droppedDuplicate !== 2) {
    throw new Error(`phantom-drop: expected 2 duplicates dropped (pinned twin + spare sibling), got ${pinnedDr.droppedDuplicate}`)
  }

  // ── SAME-FAMILY SYNONYM SIBLINGS (run-28 Part-names: 'Main AC Breaker' beside
  //    'AC Circuit Breaker'; discriminator pairs like voltage/current stay distinct) ──
  const sib: any = [{
    module: 'power', sub_modules: [{ sub_module: 's', words: [
      { ...word('Main AC Breaker', 1), id: 'main_ac_breaker_word' },
      { ...word('AC Circuit Breaker', 1), id: 'ac_circuit_breaker_word' },   // shared 'ac' + head 'breaker' → folds
      { ...word('Voltage Transducer', 1), id: 'voltage_transducer_word' },
      { ...word('Current Transducer', 1), id: 'current_transducer_word' },   // voltage↔current discriminator → BOTH stay
      { ...word('DC Fuse', 1), id: 'dc_fuse_word' },
      { ...word('AC Fuse', 1), id: 'ac_fuse_word' },                         // dc↔ac discriminator → BOTH stay
    ] }],
  }]
  dropAttributePhantomWords(sib)
  const sibRemain = sib[0].sub_modules[0].words.map((w: any) => w.name_human)
  if (sibRemain.filter((n: string) => /breaker/i.test(n)).length !== 1) {
    throw new Error(`phantom-drop: breaker synonym siblings must fold to ONE (got ${JSON.stringify(sibRemain)})`)
  }
  if (!(sibRemain.includes('Voltage Transducer') && sibRemain.includes('Current Transducer'))) {
    throw new Error('phantom-drop: voltage vs current transducers are DISTINCT (discriminator pair)')
  }
  if (!(sibRemain.includes('DC Fuse') && sibRemain.includes('AC Fuse'))) {
    throw new Error('phantom-drop: dc vs ac fuses are DISTINCT (discriminator pair)')
  }
  // generic-tail collapse: 'Audible Alarm System' folds onto 'Audible Alarm';
  // 'Fire Suppression System' vs 'Gas Detection System' stay distinct (different
  // effective heads once the generic tail collapses)
  const gt: any = [{
    module: 'safety', sub_modules: [{ sub_module: 's', words: [
      { ...word('Audible Alarm', 1), id: 'audible_alarm_word' },
      { ...word('Audible Alarm System', 1), id: 'audible_alarm_system_word' },
      { ...word('Fire Suppression System', 1), id: 'fire_suppression_system_word' },
      { ...word('Gas Detection System', 1), id: 'gas_detection_system_word' },
    ] }],
  }]
  dropAttributePhantomWords(gt)
  const gtRemain = gt[0].sub_modules[0].words.map((w: any) => w.name_human)
  if (gtRemain.filter((n: string) => /audible alarm/i.test(n)).length !== 1) {
    throw new Error(`phantom-drop: 'Audible Alarm System' must fold onto 'Audible Alarm' (got ${JSON.stringify(gtRemain)})`)
  }
  if (!(gtRemain.includes('Fire Suppression System') && gtRemain.includes('Gas Detection System'))) {
    throw new Error('phantom-drop: suppression vs detection systems are DISTINCT families')
  }

  // eslint-disable-next-line no-console
  console.log('population-count --selftest OK (4 valve smears → ×1; genuine actuated stays ×200; ' +
    `attribute phantoms dropped [${dr.droppedPhantom}], same-id dedup [${dr.droppedDuplicate}], ` +
    `solenoid↔pneumatic synonym collapse [${synDr.droppedDuplicate}], real parts kept)`)
}

run()
