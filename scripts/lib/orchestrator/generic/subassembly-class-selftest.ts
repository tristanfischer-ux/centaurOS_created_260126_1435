// proveCatch guard for the pressure-vessel-vs-drum filter sub-assembly classification in
// universal-contract-sizing.ts (Tristan 2026-06-27, physics-critic Risk HIGH).
//
// THE BUG: the sub-assembly rule /filter|membrane|screen|.../ gave EVERY filter/membrane word the
// components of a ROTARY DRUM FILTER (Drum, Drive Gearmotor, Backwash Spray Bar, Reject Trough) —
// so a GAC (granular activated carbon) PRESSURE VESSEL and an RO/UF MEMBRANE vessel were exploded
// with a drum + gearmotor + spray bar they do not have (the critic: "the Gac Filter / Ro Membrane
// sub-module contains rotary drum-filter components"). A new pressure-vessel-filter rule (matched
// BEFORE the narrowed drum rule) gives a media/membrane vessel its real parts. This guard fails the
// build if a GAC/RO/UF inherits drum parts again, or a genuine drum/cloth/microscreen loses them.

import { explodeEquipmentSubAssemblies } from './universal-contract-sizing'

function word(name: string) {
  const s = name.toLowerCase().replace(/\W+/g, '_')
  return {
    id: `${s}_synth_word`, name_human: name, _synthesized: true,
    content_character: { character_id: `${s}_synth`, name_human: name },
    modifier_characters: [{ kind: 'rating_primary', value: '90', unit: 'm³/h' }],
  }
}
function childrenOf(modules: any, parentId: string): string[] {
  const out: string[] = []
  for (const m of modules) for (const sm of m.sub_modules) for (const w of sm.words) {
    if ((w as any)._subcomponent && String(w.id).startsWith(parentId)) out.push(w.name_human)
  }
  return out
}

function run() {
  const modules: any = [{ module: 'm', sub_modules: [{ sub_module: 's', words: [
    word('Gac Filter'), word('Ro Membrane Elements'), word('Uf Membrane Bank'),
    word('Softener Vessel'), word('Drum Filter'), word('Cloth Filter'),
  ] }] }]
  explodeEquipmentSubAssemblies(modules, {})

  const DRUM = /drum|gearmotor|spray bar|reject trough/i
  const VESSEL = /pressure vessel|media|membrane element|underdrain/i

  // pressure-vessel filters MUST NOT get drum parts; MUST get vessel/media parts
  for (const pv of ['gac_filter', 'ro_membrane_elements', 'uf_membrane_bank']) {
    const kids = childrenOf(modules, pv).join(' | ')
    if (DRUM.test(kids)) throw new Error(`subassembly-class: "${pv}" got ROTARY DRUM components (${kids}) — a media/membrane pressure vessel is not a drum filter`)
    if (!VESSEL.test(kids)) throw new Error(`subassembly-class: "${pv}" lost its pressure-vessel/media components (got ${kids})`)
  }
  // a genuine rotary drum / cloth filter MUST still get the drum components
  for (const dr of ['drum_filter', 'cloth_filter']) {
    const kids = childrenOf(modules, dr).join(' | ')
    if (!DRUM.test(kids)) throw new Error(`subassembly-class: a genuine "${dr}" lost its rotary-drum components (got ${kids})`)
  }
  // eslint-disable-next-line no-console
  console.log('subassembly-class --selftest OK (GAC/RO/UF → pressure-vessel parts; drum/cloth → rotary-drum parts)')
}

run()
