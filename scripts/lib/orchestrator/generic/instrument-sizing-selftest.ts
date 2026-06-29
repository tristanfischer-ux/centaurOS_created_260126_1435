// proveCatch guard for the field-instrument "never size as a machine" fix in
// universal-contract-sizing.ts (Tristan 2026-06-27, physics-critic Risk-tab PHYSICS-FIRST work).
//
// THE BUG it catches: a skeleton / padding instrument word (e.g. a generic 'Pressure
// Transducer' the skeleton padded into sensing_instrumentation) carries no `_instrument`
// flag, so it was eligible for the contract-quantity fuzzy match in applyUniversalContractSizing.
// It then matched a small power group and got stamped boxFromRatingKw(~2)=600×510×660 mm + a
// "2 kW" rating — the physics-critic HIGH "pressure transducer rated 2 kW, off by four orders
// of magnitude" AND the shared default box that littered the GA. The fix makes instrument
// detection NAME-based (FIELD_INSTRUMENT_RE, mirroring ga_massing.py) and skips such words in
// the sizing loop. This guard fails the build if an instrument word ever re-acquires a kW
// rating / machine box, OR if the skip over-reaches and a real machine stops being sized.
//
// Standalone (not a --selftest block inside the big module). Wired into verify-engine-guards.sh.

import { applyUniversalContractSizing, synthesizeInstrumentation } from './universal-contract-sizing'

function modsOf(modules: any, name: string): any[] {
  for (const m of modules) for (const sm of m.sub_modules) for (const w of sm.words) {
    if ((w.name_human || '') === name) return w.modifier_characters || []
  }
  return []
}
function hasKwRating(mods: any[]): boolean {
  return mods.some((x) => x.kind === 'rating_primary' && /kw/i.test(String(x.unit ?? '')))
}
function hasBoxDim(mods: any[]): boolean {
  return mods.some((x) => (x.kind === 'dimension' || x.kind === 'dimensions') && /\d+x\d+x\d+\s*mm/i.test(String(x.value ?? '')))
}

function word(name: string) {
  const slug = name.toLowerCase().replace(/\W+/g, '_')
  return {
    id: `${slug}_word`, name_human: name,
    content_character: { character_id: slug, name_human: name },
    modifier_characters: [{ kind: 'quantity', value: '×2' }],
  }
}

function run() {
  const modules: any = [{
    module: 'sensing_instrumentation', sub_modules: [{
      sub_module: 's', words: [
        word('Pressure Transducer'),    // INSTRUMENT — must NOT be sized as a kW machine
        word('Conductivity Sensor'),    // INSTRUMENT
        word('Silica Analyser'),        // INSTRUMENT
        word('Transfer Pump'),          // REAL machine — MUST still be sized from the contract
      ],
    }],
  }]
  // A small ~2 kW quantity is exactly what the instrument used to fuzzy-match; the pump kW is
  // the legitimate driver for the Transfer Pump.
  const contract: any = {
    quantities: {
      transfer_pump_power_kw: { value: 11 },
      // a small power that the old fuzzy match would have stamped onto an instrument:
      sample_pump_power_kw: { value: 2 },
    },
  }
  applyUniversalContractSizing(modules as never[], contract, { synthesizeMissing: false, dedupeAndStrip: false, explode: false, instrument: false })

  for (const inst of ['Pressure Transducer', 'Conductivity Sensor', 'Silica Analyser']) {
    const m = modsOf(modules, inst)
    if (hasKwRating(m)) throw new Error(`instrument-sizing: "${inst}" was stamped a kW rating — a field instrument must never be sized as a powered machine (physics-critic "2 kW transducer" regressed)`)
    if (hasBoxDim(m)) throw new Error(`instrument-sizing: "${inst}" was stamped a WxDxH machine box — a field instrument is a P&ID tag, not 3-D massing`)
  }
  // Counter-case: the real Transfer Pump MUST still be sized (the skip is instrument-only, not
  // an over-broad "skip everything in sensing_instrumentation").
  const pump = modsOf(modules, 'Transfer Pump')
  if (!hasKwRating(pump)) throw new Error('instrument-sizing: the real Transfer Pump lost its contract kW rating — the instrument skip over-reached')

  // CONSOLIDATED LEVEL RANGE must span the TALLEST served vessel (Tristan 2026-06-29 physics HIGH:
  // a 0–1.4 m guided-radar consolidated onto a 1.6 m nutrient tank = unmonitored dead zone). The
  // host is the largest by CAPACITY (the wide shallow sump, 1.4 m) but the range must cover the
  // taller nutrient tank (1.6 m).
  const lvlModules: any = [{
    module: 'mass_fluid_transport_process', sub_modules: [{
      sub_module: 's', words: [
        { id: 'sump_word', name_human: 'Drain Collection Sump', content_character: { character_id: 'sump', name_human: 'Drain Collection Sump' }, modifier_characters: [{ kind: 'dimension', value: '2.1 m dia x 1.4 m' }, { kind: 'quantity', value: '×1' }], _synthesized: true },
        { id: 'nutrient_tank_word', name_human: 'Nutrient Tank', content_character: { character_id: 'nutrient_tank', name_human: 'Nutrient Tank' }, modifier_characters: [{ kind: 'dimension', value: '1.0 m dia x 1.6 m' }, { kind: 'quantity', value: '×8' }], _synthesized: true },
      ],
    }],
  }]
  synthesizeInstrumentation(lvlModules as never[], {})
  const lvl = modsOf(lvlModules, 'Level Transmitter')
  const lvlRange = String(lvl.find((x) => x.kind === 'rating_primary')?.value ?? '')
  if (!/1\.6\s*m/.test(lvlRange)) throw new Error(`instrument-sizing: consolidated LEVEL range "${lvlRange}" must span the TALLEST served vessel (1.6 m), not the largest-capacity host (1.4 m sump)`)

  // eslint-disable-next-line no-console
  console.log('instrument-sizing --selftest OK (3 instruments un-sized as machines; real pump still sized from contract; consolidated level range spans the tallest served vessel)')
}

run()
